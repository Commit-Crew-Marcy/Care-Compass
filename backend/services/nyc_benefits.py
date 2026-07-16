"""NYC Open Data benefits-program adapter.

The NYC dataset is a program directory, not an eligibility engine. CareCompass
uses structured category/audience fields only to surface a small set of
possibly relevant NYC resources. It never treats those records as an official
eligibility determination.
"""
import html
import json
import logging
import os
import threading
import time
from html.parser import HTMLParser
from typing import Dict, Iterable, List, Optional, Sequence, Set, Tuple
from urllib.parse import urlencode, urlparse
from urllib.request import Request, urlopen

from models.schemas import IntakeForm

logger = logging.getLogger(__name__)

NYC_DATASET_URL = os.getenv(
    "NYC_BENEFITS_API_URL",
    "https://data.cityofnewyork.us/resource/kvhd-5fmu.json",
)
NYC_DATASET_PUBLIC_URL = "https://data.cityofnewyork.us/resource/kvhd-5fmu.json"
CACHE_TTL_SECONDS = 60 * 60
MAX_NYC_RESULTS = 10

DATASET_FIELDS = [
    "unique_id_number",
    "program_code",
    "language",
    "program_name",
    "program_category",
    "government_agency",
    "population_served",
    "age_group",
    "plain_language_program_name",
    "program_description",
    "brief_excerpt",
    "heads_up",
    "plain_language_eligibility",
    "how_to_apply_summary",
    "url_of_online_application",
    "url_of_pdf_application_forms",
    "office_locations_url",
    "required_documents_summary",
    "updated_at",
]

CATEGORY_TO_PROGRAM_TYPE = {
    "Health": "health",
    "Food": "food",
    "Housing": "housing",
    "Cash & expenses": "cash",
    "Family Services": "family",
    "Child Care": "child_care",
    "Education": "education",
    "Enrichment": "enrichment",
    "Work": "work",
    "City ID Card": "city_id",
}

HELP_CATEGORY_TO_DATASET = {
    "health": {"Health"},
    "food": {"Food"},
    "housing": {"Housing"},
    "money": {"Cash & expenses", "City ID Card"},
    "family": {"Family Services", "Child Care", "Enrichment"},
    "work_education": {"Work", "Education"},
}

# Do not add a second card when the deterministic CareCompass engine already
# returned the same program. The local match keeps its rules-based reason.
NYC_NAME_TO_LOCAL_TYPE = {
    "supplemental nutrition assistance program": "snap",
    "medicaid": "medicaid",
    "head start / early head start": "head_start",
    "home energy assistance program": "liheap",
    "school meals": "school_lunch",
    "women, infants and children": "wic",
    "supplemental security income": "ssi",
}

_cache_lock = threading.Lock()
_cache_records: List[dict] = []
_cache_expires_at = 0.0


class _PlainTextParser(HTMLParser):
    BLOCK_TAGS = {"br", "li", "p", "tr", "h1", "h2", "h3", "h4"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts: List[str] = []

    def handle_starttag(self, tag, attrs):
        if tag in self.BLOCK_TAGS:
            self.parts.append(" ")

    def handle_endtag(self, tag):
        if tag in self.BLOCK_TAGS:
            self.parts.append(" ")

    def handle_data(self, data):
        self.parts.append(data)

    def text(self) -> str:
        return " ".join("".join(self.parts).split())


def plain_text(value: Optional[str]) -> str:
    """Turn trusted-source HTML into display-safe plain text."""
    if not value or str(value).strip().upper() == "NULL":
        return ""
    parser = _PlainTextParser()
    parser.feed(html.unescape(str(value)))
    parser.close()
    return parser.text()


def safe_http_url(*values: Optional[str]) -> Optional[str]:
    for value in values:
        if not value or str(value).strip().upper() == "NULL":
            continue
        parsed = urlparse(str(value).strip())
        if parsed.scheme in ("http", "https") and parsed.netloc:
            return str(value).strip()
    return None


def _fetch_records() -> List[dict]:
    query = urlencode({"$select": ",".join(DATASET_FIELDS), "$limit": 500})
    headers = {
        "Accept": "application/json",
        "User-Agent": "CareCompass/0.3 (NYC benefits directory integration)",
    }
    app_token = os.getenv("NYC_OPEN_DATA_APP_TOKEN")
    if app_token:
        headers["X-App-Token"] = app_token
    request = Request(f"{NYC_DATASET_URL}?{query}", headers=headers, method="GET")
    with urlopen(request, timeout=10) as response:
        payload = json.loads(response.read().decode("utf-8"))
    if not isinstance(payload, list):
        raise ValueError("NYC Open Data returned an unexpected response")
    return [item for item in payload if isinstance(item, dict)]


def get_records(force_refresh: bool = False) -> List[dict]:
    """Return cached directory records; an outage degrades to no enrichment."""
    global _cache_records, _cache_expires_at
    now = time.monotonic()
    with _cache_lock:
        if not force_refresh and _cache_records and now < _cache_expires_at:
            return list(_cache_records)
        try:
            records = _fetch_records()
        except (OSError, ValueError, json.JSONDecodeError) as exc:
            logger.warning("NYC benefits dataset unavailable: %s", exc)
            return list(_cache_records)
        _cache_records = records
        _cache_expires_at = now + CACHE_TTL_SECONDS
        return list(_cache_records)


def _selected_dataset_categories(help_categories: Sequence[str]) -> Set[str]:
    if not help_categories or "all" in help_categories:
        return set(CATEGORY_TO_PROGRAM_TYPE)
    selected: Set[str] = set()
    for category in help_categories:
        selected.update(HELP_CATEGORY_TO_DATASET.get(category, set()))
    return selected or set(CATEGORY_TO_PROGRAM_TYPE)


def _audience_score(record: dict, intake: IntakeForm) -> Tuple[int, List[str]]:
    population = plain_text(record.get("population_served")).lower()
    if not population:
        return 1, []

    matched: List[str] = []
    if "all new yorkers" in population or population == "everyone":
        return 2, matched
    if "older adults" in population and intake.age >= 55:
        matched.append("older adults")
    if "people with disabilities" in population and intake.disability_status:
        matched.append("people with disabilities")
    if "veterans" in population and intake.veteran_status:
        matched.append("veterans")
    if ("families" in population or "children" in population) and intake.has_children_under_18:
        matched.append("families with children")
    if "pregnant" in population and (intake.is_pregnant or intake.has_children_under_5):
        matched.append("pregnant people and new parents")
    if "immigrant" in population and intake.immigration_status != "citizen":
        matched.append("immigrants")
    if ("youth" in population or "students" in population) and intake.age <= 24:
        matched.append("younger adults")
    return (6 + len(matched), matched) if matched else (0, [])


def _age_score(record: dict, intake: IntakeForm) -> int:
    age_group = plain_text(record.get("age_group")).lower()
    if not age_group or "everyone" in age_group or "caregiver" in age_group:
        return 1
    if any(term in age_group for term in ("baby", "toddler", "pre-schooler")):
        return 3 if intake.has_children_under_5 else 0
    if any(term in age_group for term in ("grade-schooler", "pre-teen", "teen")):
        return 3 if intake.has_children_under_18 or intake.age <= 19 else 0
    if "young adult" in age_group:
        return 3 if intake.age <= 24 else 0
    return 0


def _match_reason(record: dict, intake: IntakeForm, audience_matches: Sequence[str]) -> str:
    category = plain_text(record.get("program_category")) or "benefits"
    reason = f"You said you live in New York City and want help with {category.lower()}"
    if audience_matches:
        reason += f". The NYC directory lists this for {', '.join(audience_matches)}"
    return (
        reason
        + ". This may be relevant, but CareCompass has not confirmed eligibility. "
        "Review the official requirements before applying."
    )


def record_to_benefit(
    record: dict,
    match_reason: str = "",
    include_details: bool = False,
) -> dict:
    external_id = plain_text(record.get("unique_id_number"))
    name = plain_text(record.get("program_name")) or plain_text(
        record.get("plain_language_program_name")
    )
    description = plain_text(record.get("program_description")) or plain_text(
        record.get("brief_excerpt")
    )
    summary = plain_text(record.get("brief_excerpt")) or plain_text(
        record.get("plain_language_program_name")
    )
    required_documents = plain_text(record.get("required_documents_summary"))
    return {
        "id": f"nyc-{external_id}",
        "external_id": external_id,
        "name": name,
        "description": description or summary,
        "eligibility_summary": summary or "Review this NYC program's official requirements.",
        "apply_url": safe_http_url(
            record.get("url_of_online_application"),
            record.get("office_locations_url"),
            record.get("url_of_pdf_application_forms"),
        ),
        "program_type": CATEGORY_TO_PROGRAM_TYPE.get(
            plain_text(record.get("program_category")), "other"
        ),
        "match_reason": match_reason,
        "source": "nyc_open_data",
        "government_agency": plain_text(record.get("government_agency")),
        "source_updated_at": plain_text(record.get("updated_at")) or None,
        "eligibility_details": plain_text(record.get("plain_language_eligibility"))
        if include_details
        else "",
        "application_summary": plain_text(record.get("how_to_apply_summary"))
        if include_details
        else "",
        "federal": False,
        "requirements": (
            [{"description": required_documents, "display_order": 1}]
            if include_details and required_documents
            else []
        ),
    }


def find_nyc_programs(
    intake: IntakeForm,
    existing_program_types: Iterable[str] = (),
    records: Optional[Sequence[dict]] = None,
    limit: int = MAX_NYC_RESULTS,
) -> List[dict]:
    """Rank a small, diverse set of NYC directory resources."""
    if intake.state.upper() != "NY" or intake.nyc_resident is not True:
        return []

    selected_categories = _selected_dataset_categories(intake.help_categories)
    existing_types = {item.lower() for item in existing_program_types}
    candidates: Dict[str, List[Tuple[int, str, dict]]] = {}

    for record in records if records is not None else get_records():
        external_id = plain_text(record.get("unique_id_number"))
        name = plain_text(record.get("program_name"))
        category = plain_text(record.get("program_category"))
        if not external_id or not name or category not in selected_categories:
            continue
        duplicate_type = NYC_NAME_TO_LOCAL_TYPE.get(name.lower())
        if duplicate_type and duplicate_type in existing_types:
            continue

        audience_score, audience_matches = _audience_score(record, intake)
        age_score = _age_score(record, intake)
        score = 10 + audience_score + age_score
        if safe_http_url(record.get("url_of_online_application")):
            score += 1
        reason = _match_reason(record, intake, audience_matches)
        candidates.setdefault(category, []).append((score, name.lower(), record | {"_match_reason": reason}))

    # Keep category selections diverse: take the strongest two from each
    # requested category, then fill remaining slots by overall score.
    chosen: List[Tuple[int, str, dict]] = []
    leftovers: List[Tuple[int, str, dict]] = []
    for category in sorted(candidates):
        ranked = sorted(candidates[category], key=lambda item: (-item[0], item[1]))
        chosen.extend(ranked[:2])
        leftovers.extend(ranked[2:])
    if len(chosen) < limit:
        chosen.extend(sorted(leftovers, key=lambda item: (-item[0], item[1]))[: limit - len(chosen)])
    chosen = sorted(chosen, key=lambda item: (-item[0], item[1]))[:limit]

    return [
        record_to_benefit(item, match_reason=item["_match_reason"])
        for _, _, item in chosen
    ]


def get_nyc_program(program_id: str, records: Optional[Sequence[dict]] = None) -> Optional[dict]:
    for record in records if records is not None else get_records():
        if plain_text(record.get("unique_id_number")) == program_id:
            return record_to_benefit(record, include_details=True)
    return None
