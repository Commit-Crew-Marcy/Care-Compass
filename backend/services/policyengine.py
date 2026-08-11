"""State program catalog derived from the PolicyEngine US model.

The PolicyEngine household HTTP service is a calculator, not a program-listing
API. CareCompass only needs to know which modeled programs are relevant to a
selected state, so this module exposes a deterministic catalog without Docker,
authentication, or a second running service.

The state TANF names and child-care program names come from the corresponding
aggregator metadata in PolicyEngine US. Federal programs are included for every
state because their model variables apply nationwide, while state programs are
added only where PolicyEngine's model lists an implementation.
"""
from __future__ import annotations

import logging
import os
import threading
from dataclasses import dataclass
from typing import Any, Dict, Optional, Tuple

from models.schemas import PolicyEngineEligibilityRequest, StateCode

SOURCE_REPOSITORY = "https://github.com/PolicyEngine/policyengine-us"
SOURCE_COMMIT = "8ee7b8d2fc62adb7071521032fd43303e1e31fb4"
DEFAULT_CALCULATION_YEAR = 2026

logger = logging.getLogger(__name__)
_warmup_lock = threading.Lock()
_model_warmed = False


STATE_NAMES: Dict[str, str] = {
    "AL": "Alabama", "AK": "Alaska", "AZ": "Arizona", "AR": "Arkansas",
    "CA": "California", "CO": "Colorado", "CT": "Connecticut",
    "DE": "Delaware", "FL": "Florida", "GA": "Georgia", "HI": "Hawaii",
    "ID": "Idaho", "IL": "Illinois", "IN": "Indiana", "IA": "Iowa",
    "KS": "Kansas", "KY": "Kentucky", "LA": "Louisiana", "ME": "Maine",
    "MD": "Maryland", "MA": "Massachusetts", "MI": "Michigan",
    "MN": "Minnesota", "MS": "Mississippi", "MO": "Missouri",
    "MT": "Montana", "NE": "Nebraska", "NV": "Nevada",
    "NH": "New Hampshire", "NJ": "New Jersey", "NM": "New Mexico",
    "NY": "New York", "NC": "North Carolina", "ND": "North Dakota",
    "OH": "Ohio", "OK": "Oklahoma", "OR": "Oregon",
    "PA": "Pennsylvania", "RI": "Rhode Island", "SC": "South Carolina",
    "SD": "South Dakota", "TN": "Tennessee", "TX": "Texas", "UT": "Utah",
    "VT": "Vermont", "VA": "Virginia", "WA": "Washington",
    "WV": "West Virginia", "WI": "Wisconsin", "WY": "Wyoming",
    "DC": "District of Columbia",
}


@dataclass(frozen=True)
class CatalogDefinition:
    id: str
    name: str
    description: str
    program_type: str
    apply_url: str
    model_variable: str


FEDERAL_PROGRAMS: Tuple[CatalogDefinition, ...] = (
    CatalogDefinition(
        "medicare",
        "Medicare",
        "Federal health coverage for older adults and some people with disabilities.",
        "medicare_part_a",
        "https://www.medicare.gov/basics/get-started-with-medicare",
        "is_medicare_eligible",
    ),
    CatalogDefinition(
        "medicare-savings-programs",
        "Medicare Savings Programs",
        "State-administered help with Medicare premiums and other Medicare costs.",
        "msp",
        "https://www.medicare.gov/basics/costs/help/medicare-savings-programs",
        "msp",
    ),
    CatalogDefinition(
        "medicaid",
        "Medicaid",
        "Free or low-cost health coverage administered under federal and state rules.",
        "medicaid",
        "https://www.medicaid.gov/about-us/where-can-people-get-help-medicaid-chip/index.html",
        "medicaid",
    ),
    CatalogDefinition(
        "chip",
        "CHIP (Children's Health Insurance Program)",
        "Free or low-cost health coverage for children in qualifying households.",
        "chip",
        "https://www.insurekidsnow.gov/",
        "chip",
    ),
    CatalogDefinition(
        "aca-ptc",
        "ACA Marketplace premium tax credit",
        "A federal tax credit that can reduce Marketplace health-insurance premiums.",
        "marketplace",
        "https://www.healthcare.gov/lower-costs/",
        "aca_ptc",
    ),
    CatalogDefinition(
        "snap",
        "SNAP (Food Assistance)",
        "Monthly help purchasing groceries under federal and state SNAP rules.",
        "snap",
        "https://www.fns.usda.gov/snap/state-directory",
        "snap",
    ),
    CatalogDefinition(
        "wic",
        "WIC",
        "Nutrition and health support for qualifying pregnant people, infants, and young children.",
        "wic",
        "https://www.fns.usda.gov/wic/program-contacts",
        "wic",
    ),
    CatalogDefinition(
        "school-meals",
        "Free and reduced-price school meals",
        "Meal assistance for children through participating schools and child nutrition programs.",
        "school_lunch",
        "https://www.fns.usda.gov/cn",
        "free_school_meals",
    ),
    CatalogDefinition(
        "csfp",
        "Commodity Supplemental Food Program",
        "USDA food packages for qualifying low-income adults age 60 and older.",
        "food",
        "https://www.fns.usda.gov/csfp",
        "commodity_supplemental_food_program",
    ),
    CatalogDefinition(
        "fdpir",
        "Food Distribution Program on Indian Reservations",
        "USDA food assistance for qualifying households on or near participating reservations.",
        "food",
        "https://www.fns.usda.gov/fdpir",
        "fdpir",
    ),
    CatalogDefinition(
        "ssi",
        "Supplemental Security Income (SSI)",
        "Federal monthly payments for qualifying older adults and people who are blind or disabled.",
        "ssi",
        "https://www.ssa.gov/ssi",
        "ssi",
    ),
    CatalogDefinition(
        "social-security",
        "Social Security benefits",
        "Federal retirement, disability, and survivor benefits based on covered work or family history.",
        "cash",
        "https://www.ssa.gov/benefits/",
        "social_security",
    ),
    CatalogDefinition(
        "eitc",
        "Earned Income Tax Credit (EITC)",
        "A refundable federal income-tax credit for qualifying workers and families.",
        "eitc",
        "https://www.irs.gov/credits-deductions/individuals/earned-income-tax-credit-eitc",
        "eitc",
    ),
    CatalogDefinition(
        "ctc",
        "Child Tax Credit",
        "A federal income-tax credit for households with qualifying children.",
        "ctc",
        "https://www.irs.gov/credits-deductions/individuals/child-tax-credit",
        "ctc",
    ),
    CatalogDefinition(
        "cdcc",
        "Child and Dependent Care Credit",
        "A federal tax credit for qualifying care expenses that allow someone to work or seek work.",
        "child_care",
        "https://www.irs.gov/credits-deductions/individuals/child-and-dependent-care-credit-information",
        "cdcc",
    ),
    CatalogDefinition(
        "housing-assistance",
        "Federal housing assistance",
        "Rental assistance modeled from HUD housing-support programs.",
        "housing",
        "https://www.hud.gov/housing-counseling/rental-assistance",
        "housing_assistance",
    ),
    CatalogDefinition(
        "lifeline",
        "Lifeline phone and internet assistance",
        "A federal discount on qualifying phone or internet service.",
        "cash",
        "https://www.lifelinesupport.org/",
        "lifeline",
    ),
    CatalogDefinition(
        "pell-grant",
        "Federal Pell Grant",
        "Federal grant assistance for qualifying undergraduate students with financial need.",
        "education",
        "https://studentaid.gov/understand-aid/types/grants/pell",
        "pell_grant",
    ),
)


# PolicyEngine's TANF aggregator contains one modeled cash-assistance variable
# for every state and DC. The comments in that source provide the program names
# where a state uses a name other than TANF.
TANF_PROGRAMS: Dict[str, Tuple[str, str]] = {
    "AL": ("al_tanf", "Alabama TANF cash assistance"),
    "AK": ("ak_atap", "Alaska Temporary Assistance Program"),
    "AZ": ("az_tanf", "Arizona TANF cash assistance"),
    "AR": ("ar_tea", "Arkansas Transitional Employment Assistance"),
    "CA": ("ca_tanf", "California CalWORKs cash assistance"),
    "CO": ("co_tanf", "Colorado Works cash assistance"),
    "CT": ("ct_tfa", "Connecticut Temporary Family Assistance"),
    "DE": ("de_tanf", "Delaware TANF cash assistance"),
    "FL": ("fl_tca", "Florida Temporary Cash Assistance"),
    "GA": ("ga_tanf", "Georgia TANF cash assistance"),
    "HI": ("hi_tanf", "Hawaii TANF cash assistance"),
    "ID": ("id_tafi", "Idaho Temporary Assistance for Families"),
    "IL": ("il_tanf", "Illinois TANF cash assistance"),
    "IN": ("in_tanf", "Indiana TANF cash assistance"),
    "IA": ("ia_fip", "Iowa Family Investment Program"),
    "KS": ("ks_tanf", "Kansas TANF cash assistance"),
    "KY": ("ky_ktap", "Kentucky K-TAP"),
    "LA": ("la_fitap", "Louisiana Family Independence TAP"),
    "ME": ("me_tanf", "Maine TANF cash assistance"),
    "MD": ("md_tca", "Maryland Temporary Cash Assistance"),
    "MA": ("ma_tafdc", "Massachusetts TAFDC"),
    "MI": ("mi_fip", "Michigan Family Independence Program"),
    "MN": ("mn_mfip", "Minnesota Family Investment Program"),
    "MS": ("ms_tanf", "Mississippi TANF cash assistance"),
    "MO": ("mo_tanf", "Missouri TANF cash assistance"),
    "MT": ("mt_tanf", "Montana TANF cash assistance"),
    "NE": ("ne_adc", "Nebraska Aid to Dependent Children"),
    "NV": ("nv_tanf", "Nevada TANF cash assistance"),
    "NH": ("nh_fanf", "New Hampshire FANF"),
    "NJ": ("nj_wfnj", "New Jersey WorkFirst New Jersey"),
    "NM": ("nm_works", "New Mexico Works"),
    "NY": ("ny_tanf", "New York Family Assistance"),
    "NC": ("nc_tanf", "North Carolina Work First"),
    "ND": ("nd_tanf", "North Dakota TANF cash assistance"),
    "OH": ("oh_owf", "Ohio Works First"),
    "OK": ("ok_tanf", "Oklahoma TANF cash assistance"),
    "OR": ("or_tanf", "Oregon TANF cash assistance"),
    "PA": ("pa_tanf", "Pennsylvania TANF cash assistance"),
    "RI": ("ri_works", "Rhode Island Works"),
    "SC": ("sc_tanf", "South Carolina Family Independence"),
    "SD": ("sd_tanf", "South Dakota TANF cash assistance"),
    "TN": ("tn_ff", "Tennessee Families First"),
    "TX": ("tx_tanf", "Texas TANF cash assistance"),
    "UT": ("ut_fep", "Utah Family Employment Program"),
    "VT": ("vt_reach_up", "Vermont Reach Up"),
    "VA": ("va_tanf", "Virginia TANF cash assistance"),
    "WA": ("wa_tanf", "Washington WorkFirst cash assistance"),
    "WV": ("wv_works", "West Virginia Works"),
    "WI": ("wi_works", "Wisconsin Works (W-2)"),
    "WY": ("wy_power", "Wyoming POWER"),
    "DC": ("dc_tanf", "DC TANF cash assistance"),
}


# The 2025 PolicyEngine CCDF aggregator explicitly lists these implemented
# state child-care programs. States absent from this mapping are not presented
# as modeled child-care programs in the catalog.
CHILD_CARE_PROGRAMS: Dict[str, Tuple[str, str]] = {
    "AK": ("ak_child_care_subsidies", "Alaska Child Care Assistance Program (PASS)"),
    "AL": ("al_child_care_subsidies", "Alabama Child Care Subsidy Program"),
    "AR": ("ar_child_care_subsidies", "Arkansas School Readiness Assistance"),
    "AZ": ("az_child_care_subsidies", "Arizona Child Care Assistance Program"),
    "CA": ("ca_child_care_subsidies", "California Child Care"),
    "CO": ("co_child_care_subsidies", "Colorado Child Care Assistance Program"),
    "CT": ("ct_child_care_subsidies", "Connecticut Care 4 Kids"),
    "DC": ("dc_child_care_subsidies", "DC Child Care Subsidy Program"),
    "DE": ("de_child_care_subsidies", "Delaware Purchase of Care"),
    "FL": ("fl_child_care_subsidies", "Florida School Readiness Program"),
    "GA": ("ga_child_care_subsidies", "Georgia Childcare and Parent Services"),
    "HI": ("hi_child_care_subsidies", "Hawaii Child Care Subsidy"),
    "IA": ("ia_child_care_subsidies", "Iowa Child Care Assistance"),
    "ID": ("id_child_care_subsidies", "Idaho Child Care Program"),
    "IN": ("in_child_care_subsidies", "Indiana CCDF Voucher Program"),
    "KS": ("ks_child_care_subsidies", "Kansas Child Care Assistance Program"),
    "KY": ("ky_child_care_subsidies", "Kentucky Child Care Assistance Program"),
    "LA": ("la_child_care_subsidies", "Louisiana Child Care Assistance Program"),
    "MA": ("ma_child_care_subsidies", "Massachusetts Child Care Financial Assistance"),
    "MD": ("md_child_care_subsidies", "Maryland Child Care Scholarship"),
    "ME": ("me_child_care_subsidies", "Maine Child Care Affordability Program"),
    "MI": ("mi_child_care_subsidies", "Michigan Child Development and Care Program"),
    "MN": ("mn_child_care_subsidies", "Minnesota Child Care Assistance Program"),
    "MO": ("mo_child_care_subsidies", "Missouri Child Care Subsidy"),
    "MS": ("ms_child_care_subsidies", "Mississippi Child Care Payment Program"),
    "MT": ("mt_child_care_subsidies", "Montana Best Beginnings Child Care Scholarship"),
    "NC": ("nc_child_care_subsidies", "North Carolina Subsidized Child Care Assistance"),
    "ND": ("nd_child_care_subsidies", "North Dakota Child Care Assistance Program"),
    "NE": ("ne_child_care_subsidies", "Nebraska Child Care Subsidy"),
    "NH": ("nh_child_care_subsidies", "New Hampshire Child Care Scholarship Program"),
    "NJ": ("nj_child_care_subsidies", "New Jersey Child Care Assistance Program"),
    "NM": ("nm_child_care_subsidies", "New Mexico Child Care Assistance Program"),
    "NV": ("nv_child_care_subsidies", "Nevada Child Care and Development Program"),
    "OH": ("oh_child_care_subsidies", "Ohio Publicly Funded Child Care"),
    "OK": ("ok_child_care_subsidies", "Oklahoma Child Care Subsidy Program"),
    "PA": ("pa_child_care_subsidies", "Pennsylvania Child Care Works"),
    "RI": ("ri_child_care_subsidies", "Rhode Island Child Care Assistance Program"),
    "SC": ("sc_child_care_subsidies", "South Carolina Child Care Scholarship Program"),
    "SD": ("sd_child_care_subsidies", "South Dakota Child Care Assistance"),
    "VA": ("va_child_care_subsidies", "Virginia Child Care Subsidy Program"),
    "VT": ("vt_child_care_subsidies", "Vermont Child Care Financial Assistance Program"),
    "WA": ("wa_child_care_subsidies", "Washington Working Connections Child Care"),
    "WV": ("wv_child_care_subsidies", "West Virginia Child Care Assistance Program"),
}


REFUNDABLE_CREDIT_STATES = frozenset({
    "AL", "AR", "AZ", "CA", "CO", "CT", "DC", "DE", "GA", "HI", "IA",
    "ID", "IL", "IN", "KS", "KY", "LA", "MA", "MD", "ME", "MI", "MN",
    "MO", "MS", "MT", "ND", "NE", "NH", "NJ", "NM", "NY", "OH", "OK",
    "OR", "PA", "RI", "SC", "UT", "VA", "VT", "WA", "WI", "WV",
})


def _program_card(
    definition: CatalogDefinition,
    state: StateCode,
    state_name: str,
    *,
    scope: str = "federal",
) -> dict:
    if scope == "state":
        availability = f"PolicyEngine US contains a modeled {state_name} rule for this program."
        reason = (
            f"We showed this because you selected {state_name} and PolicyEngine US "
            "includes this program in its state model. Review the official requirements "
            "to find out whether your household may qualify."
        )
    else:
        availability = f"PolicyEngine US models this nationwide program for households in {state_name}."
        reason = (
            f"We showed this because PolicyEngine US models this nationwide program for "
            f"households in {state_name}. Review the official requirements to find out "
            "whether your household may qualify."
        )
    return {
        "id": f"policyengine-{state.lower()}-{definition.id}",
        "name": definition.name,
        "description": definition.description,
        "eligibility_summary": availability,
        "match_reason": reason,
        "program_type": definition.program_type,
        "apply_url": definition.apply_url,
        "source": "policyengine",
        "scope": scope,
        "state": state if scope == "state" else None,
    }


def get_program_catalog(state: StateCode) -> dict:
    """Return modeled federal and state programs for a state, without calculating."""
    state_name = STATE_NAMES[state]
    programs = [
        _program_card(program, state, state_name)
        for program in FEDERAL_PROGRAMS
    ]

    tanf_variable, tanf_name = TANF_PROGRAMS[state]
    programs.append(_program_card(
        CatalogDefinition(
            "tanf",
            tanf_name,
            "The state's Temporary Assistance for Needy Families cash-assistance program.",
            "tanf",
            "https://www.acf.hhs.gov/ofa/map/about/help-families",
            tanf_variable,
        ),
        state,
        state_name,
        scope="state",
    ))

    child_care = CHILD_CARE_PROGRAMS.get(state)
    if child_care:
        variable, name = child_care
        programs.append(_program_card(
            CatalogDefinition(
                "child-care-subsidy",
                name,
                "State assistance that can reduce qualifying child-care costs.",
                "child_care",
                "https://childcare.gov/state-resources-home",
                variable,
            ),
            state,
            state_name,
            scope="state",
        ))

    if state in REFUNDABLE_CREDIT_STATES:
        programs.append(_program_card(
            CatalogDefinition(
                "refundable-tax-credits",
                f"{state_name} refundable tax credits",
                "Refundable state income-tax credits represented in the PolicyEngine US model.",
                "state_tax_credit",
                "https://www.taxadmin.org/state-tax-agencies",
                f"{state.lower()}_refundable_credits",
            ),
            state,
            state_name,
            scope="state",
        ))

    return {
        "state": state,
        "state_name": state_name,
        "programs": programs,
        "source_repository": SOURCE_REPOSITORY,
        "source_commit": SOURCE_COMMIT,
        "catalog_note": (
            "This lists benefit and credit program variables modeled by PolicyEngine US. "
            "It does not calculate eligibility or estimated benefit amounts."
        ),
    }


@dataclass(frozen=True)
class ModelMetric:
    """PolicyEngine result fields used to score one catalog program."""

    eligibility_entity: Optional[str] = None
    eligibility_variable: Optional[str] = None
    amount_entity: Optional[str] = None
    amount_variable: Optional[str] = None


# Only variables that can be interpreted responsibly from the current
# questionnaire are requested. Catalog-only entries stay in the response with
# the neutral "Check eligibility" status instead of inheriting model defaults
# for information CareCompass never asked the user to provide.
MODEL_METRICS: Dict[str, ModelMetric] = {
    "medicare": ModelMetric("person", "is_medicare_eligible"),
    "medicare-savings-programs": ModelMetric("person", "msp_eligible"),
    "medicaid": ModelMetric("person", "is_medicaid_eligible"),
    "chip": ModelMetric("person", "is_chip_eligible"),
    "aca-ptc": ModelMetric(
        "person", "is_aca_ptc_eligible", "tax_unit", "aca_ptc"
    ),
    "snap": ModelMetric("spm_unit", "is_snap_eligible", "spm_unit", "snap"),
    "wic": ModelMetric("person", "is_wic_eligible", "person", "wic"),
    "school-meals": ModelMetric(
        amount_entity="spm_unit", amount_variable="school_meal_net_subsidy"
    ),
    "csfp": ModelMetric(
        "person",
        "commodity_supplemental_food_program_eligible",
        "person",
        "commodity_supplemental_food_program",
    ),
    "ssi": ModelMetric("person", "is_ssi_eligible", "person", "ssi"),
    "eitc": ModelMetric("tax_unit", "eitc_eligible", "tax_unit", "eitc"),
    "ctc": ModelMetric(amount_entity="tax_unit", amount_variable="ctc_value"),
    "housing-assistance": ModelMetric(
        "spm_unit",
        "is_eligible_for_housing_assistance",
        "spm_unit",
        "housing_assistance",
    ),
    "lifeline": ModelMetric(
        "spm_unit", "is_lifeline_eligible", "spm_unit", "lifeline"
    ),
    "tanf": ModelMetric(amount_entity="spm_unit", amount_variable="tanf"),
    "child-care-subsidy": ModelMetric(
        amount_entity="spm_unit", amount_variable="child_care_subsidies"
    ),
    "refundable-tax-credits": ModelMetric(
        amount_entity="household",
        amount_variable="household_refundable_state_tax_credits",
    ),
}

IMMIGRATION_SENSITIVE_PROGRAMS = frozenset({
    "medicaid",
    "chip",
    "aca-ptc",
    "snap",
    "wic",
    "ssi",
    "tanf",
    "child-care-subsidy",
})

IMMIGRATION_STATUS_MAP = {
    "citizen": "CITIZEN",
    "green_card": "LEGAL_PERMANENT_RESIDENT",
    "refugee_asylee": "REFUGEE",
}

NON_MARKETPLACE_COVERAGE = frozenset({
    "medicare", "medicaid", "employer", "tricare", "va"
})


def _calculation_year() -> int:
    raw = os.getenv("POLICYENGINE_YEAR", str(DEFAULT_CALCULATION_YEAR))
    try:
        year = int(raw)
    except ValueError:
        return DEFAULT_CALCULATION_YEAR
    return year if 2020 <= year <= 2100 else DEFAULT_CALCULATION_YEAR


def _model_people(request: PolicyEngineEligibilityRequest) -> list[dict]:
    """Translate questionnaire members into PolicyEngine person inputs."""
    other_work_income = sum(
        member.annual_employment_income for member in request.additional_people
    )
    primary_work_income = max(0.0, request.income - other_work_income)
    mapped_status = IMMIGRATION_STATUS_MAP.get(request.immigration_status)

    def common_person_inputs(
        *, age: int, income: float, disabled: bool, pregnant: bool
    ) -> dict:
        person = {
            "age": age,
            "employment_income": income,
            "is_disabled": disabled,
            "is_pregnant": pregnant,
            # School enrollment is not asked separately yet. Treat a
            # school-age child as enrolled only for this clearly labeled
            # preliminary estimate; official program review is still needed.
            "is_in_k12_school": 5 <= age <= 18,
        }
        # Visa and "prefer not to say" cover multiple PolicyEngine enum
        # values, so guessing one would create false eligibility claims.
        if mapped_status:
            person["immigration_status"] = mapped_status
        if request.years_in_us is not None:
            person["years_since_us_entry"] = request.years_in_us
        return person

    people = [
        {
            **common_person_inputs(
                age=request.age,
                income=primary_work_income,
                disabled=request.disability_status,
                pregnant=request.is_pregnant,
            ),
            "is_tax_unit_head": True,
        }
    ]
    for member in request.additional_people:
        relationship_flags = (
            {"is_tax_unit_spouse": True}
            if member.relationship == "spouse"
            else {"is_tax_unit_dependent": True}
        )
        people.append({
            **common_person_inputs(
                age=member.age,
                income=member.annual_employment_income,
                disabled=member.is_disabled,
                pregnant=member.is_pregnant,
            ),
            **relationship_flags,
        })
    return people


def _run_policyengine_calculation(**kwargs):
    """Lazy import keeps ordinary API startup fast and makes fallback safe."""
    try:
        import policyengine as pe
    except ImportError as exc:  # pragma: no cover - exercised via service fallback
        raise RuntimeError("PolicyEngine is not installed") from exc
    if pe.us is None:  # pragma: no cover - defensive for a core-only install
        raise RuntimeError("PolicyEngine US is not installed")
    return pe.us.calculate_household(**kwargs)


def warm_policyengine_model() -> None:
    """Load the model once while the user is completing the questionnaire."""
    global _model_warmed
    if _model_warmed:
        return
    with _warmup_lock:
        if _model_warmed:
            return
        try:
            import policyengine as pe
            if pe.us is not None:
                # Accessing the pinned model forces country-package setup but
                # does not calculate or retain any household information.
                _ = pe.us.model
                _model_warmed = True
        except Exception as exc:  # warm-up is best effort; scoring has fallback
            logger.warning("PolicyEngine warm-up unavailable: %s", type(exc).__name__)


def _requested_variables() -> list[str]:
    variables = set()
    for metric in MODEL_METRICS.values():
        if metric.eligibility_variable:
            variables.add(metric.eligibility_variable)
        if metric.amount_variable:
            variables.add(metric.amount_variable)
    return sorted(variables)


def _values_for(result: Any, entity: str, variable: str) -> list[Any]:
    entity_result = getattr(result, entity)
    if isinstance(entity_result, list):
        return [getattr(item, variable) for item in entity_result]
    return [getattr(entity_result, variable)]


def _as_bool(value: Any) -> bool:
    if isinstance(value, str):
        return value.strip().lower() in {"true", "1", "yes"}
    return bool(value)


def _annual_amount(result: Any, metric: ModelMetric) -> Optional[float]:
    if not metric.amount_entity or not metric.amount_variable:
        return None
    values = _values_for(result, metric.amount_entity, metric.amount_variable)
    try:
        amount = sum(float(value or 0) for value in values)
    except (TypeError, ValueError):
        return None
    return round(max(0.0, amount), 2)


def _program_key(program: dict, state: StateCode) -> str:
    return program["id"].removeprefix(f"policyengine-{state.lower()}-")


def _neutral_program(program: dict, year: int, reason: str) -> dict:
    return {
        **program,
        "eligibility_status": "check_eligibility",
        "eligibility_label": "Check eligibility",
        "calculation_reason": reason,
        "calculation_year": year,
        "model_calculated": False,
        "estimated_annual_amount": None,
    }


def _score_program(
    program: dict,
    state: StateCode,
    request: PolicyEngineEligibilityRequest,
    result: Any,
    year: int,
) -> dict:
    key = _program_key(program, state)
    metric = MODEL_METRICS.get(key)
    if not metric:
        return _neutral_program(
            program,
            year,
            "This program is represented in the PolicyEngine US model, but the current "
            "questionnaire does not collect enough information to score it safely. Check "
            "the official requirements for a complete decision.",
        )

    if (
        key in IMMIGRATION_SENSITIVE_PROGRAMS
        and request.immigration_status in {"visa", "prefer_not"}
    ):
        return _neutral_program(
            program,
            year,
            "Your immigration answer covers several different official categories, so "
            "CareCompass did not guess. Check this program's eligibility requirements.",
        )

    if (
        key in {"aca-ptc", "chip"}
        and request.insurance_status
        and NON_MARKETPLACE_COVERAGE.intersection(request.current_coverage)
    ):
        return _neutral_program(
            program,
            year,
            "Your current health coverage can affect this program. CareCompass did not "
            "guess at the plan-level details, so check the official eligibility rules.",
        )

    eligible = False
    if metric.eligibility_entity and metric.eligibility_variable:
        values = _values_for(
            result,
            metric.eligibility_entity,
            metric.eligibility_variable,
        )
        eligible = any(_as_bool(value) for value in values)

    amount = _annual_amount(result, metric)
    likely = eligible or (amount is not None and amount > 0)
    if likely:
        reason = (
            f"PolicyEngine's {year} rules estimated a positive result using the household "
            "information you provided. This is a preliminary estimate, not an official decision."
        )
    else:
        reason = (
            f"PolicyEngine's {year} rules did not estimate a positive result from the answers "
            "provided. Official eligibility may use details this questionnaire does not collect, "
            "so it is still worth checking the program requirements."
        )
    return {
        **program,
        "eligibility_status": "likely_eligible" if likely else "check_eligibility",
        "eligibility_label": "Likely eligible" if likely else "Check eligibility",
        "calculation_reason": reason,
        "calculation_year": year,
        "model_calculated": True,
        "estimated_annual_amount": amount if amount and amount > 0 else None,
    }


def calculate_program_eligibility(request: PolicyEngineEligibilityRequest) -> dict:
    """Score the state catalog with a local PolicyEngine household calculation.

    A failed or unavailable model never prevents the questionnaire from
    returning results. Every catalog entry falls back to a conservative Check
    eligibility status that sends the user to the official requirements.
    """
    catalog = get_program_catalog(request.state)
    year = _calculation_year()
    spouse_present = any(
        member.relationship == "spouse" for member in request.additional_people
    )
    dependent_present = any(
        member.relationship != "spouse" for member in request.additional_people
    )
    filing_status = (
        "JOINT" if spouse_present
        else "HEAD_OF_HOUSEHOLD" if dependent_present
        else "SINGLE"
    )

    try:
        result = _run_policyengine_calculation(
            people=_model_people(request),
            tax_unit={"filing_status": filing_status},
            household={"state_code": request.state},
            year=year,
            extra_variables=_requested_variables(),
        )
    except Exception as exc:  # model errors must degrade to catalog results
        logger.warning("PolicyEngine household calculation unavailable: %s", type(exc).__name__)
        fallback_reason = (
            "CareCompass could not run the PolicyEngine estimate right now. Check the "
            "official program requirements; the program catalog is still available."
        )
        return {
            "state": catalog["state"],
            "state_name": catalog["state_name"],
            "programs": [
                _neutral_program(program, year, fallback_reason)
                for program in catalog["programs"]
            ],
            "source_repository": catalog["source_repository"],
            "source_commit": catalog["source_commit"],
            "calculation_year": year,
            "calculation_available": False,
            "calculation_note": (
                "PolicyEngine scoring was unavailable, so every modeled program is shown "
                "with a Check eligibility status."
            ),
        }

    programs = [
        _score_program(program, request.state, request, result, year)
        for program in catalog["programs"]
    ]
    return {
        "state": catalog["state"],
        "state_name": catalog["state_name"],
        "programs": programs,
        "source_repository": catalog["source_repository"],
        "source_commit": catalog["source_commit"],
        "calculation_year": year,
        "calculation_available": True,
        "calculation_note": (
            "PolicyEngine estimates use the questionnaire answers and model defaults for "
            "details not collected by CareCompass. They are not official determinations."
        ),
    }
