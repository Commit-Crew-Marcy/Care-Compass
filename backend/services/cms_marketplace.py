"""Server-side adapter for the CMS Marketplace API.

The CMS key is appended only inside this module and is never returned to the
browser. CareCompass sends the minimum household data needed for a plan-price
estimate: ZIP/county, ages, income, tobacco use, pregnancy, relationships, and
whether household members already have minimum essential coverage.
"""
from __future__ import annotations

import logging
import os
from typing import Any, Dict, Iterable, Optional
from urllib.parse import urlparse

import httpx

from models.schemas import CMSMarketplaceSearchRequest


logger = logging.getLogger(__name__)

CMS_MARKETPLACE_API_URL = "https://marketplace.api.healthcare.gov/api/v1"
CMS_MARKETPLACE_SOURCE_URL = "https://developer.cms.gov/marketplace-api/"
CMS_REQUEST_TIMEOUT_SECONDS = 25.0
MAX_RETURNED_PLANS = 5

MEC_COVERAGE = frozenset({"medicare", "medicaid", "employer", "tricare", "va"})


class CMSMarketplaceError(RuntimeError):
    """Base error for a safe, user-facing Marketplace fallback."""


class CMSMarketplaceConfigurationError(CMSMarketplaceError):
    """Raised when the backend has no CMS API key."""


class CMSMarketplaceLocationError(CMSMarketplaceError):
    """Raised when a ZIP code cannot be resolved in the selected state."""


def _api_key() -> str:
    key = os.getenv("CMS_MARKETPLACE_API_KEY", "").strip()
    if not key:
        raise CMSMarketplaceConfigurationError("CMS Marketplace API key is not configured")
    return key


def _request_json(
    method: str,
    path: str,
    *,
    params: Optional[Dict[str, Any]] = None,
    json: Optional[dict] = None,
) -> dict:
    """Call CMS without ever logging a URL that contains the API key."""
    query = dict(params or {})
    query["apikey"] = _api_key()
    try:
        response = httpx.request(
            method,
            f"{CMS_MARKETPLACE_API_URL}{path}",
            params=query,
            json=json,
            timeout=CMS_REQUEST_TIMEOUT_SECONDS,
        )
    except httpx.HTTPError as exc:
        raise CMSMarketplaceError("CMS Marketplace API could not be reached") from exc

    if response.status_code < 200 or response.status_code >= 300:
        logger.warning("CMS Marketplace request failed: status=%s path=%s", response.status_code, path)
        raise CMSMarketplaceError("CMS Marketplace API returned an error")
    try:
        data = response.json()
    except ValueError as exc:
        raise CMSMarketplaceError("CMS Marketplace API returned invalid data") from exc
    if not isinstance(data, dict):
        raise CMSMarketplaceError("CMS Marketplace API returned an unexpected response")
    return data


def _safe_url(value: Any) -> Optional[str]:
    if not isinstance(value, str):
        return None
    parsed = urlparse(value.strip())
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        return None
    return value.strip()


def _number(value: Any) -> Optional[float]:
    try:
        return round(float(value), 2)
    except (TypeError, ValueError):
        return None


def _relationship(value: str, age: int) -> str:
    if value == "self":
        return "Self"
    if value == "spouse":
        return "Spouse"
    if value == "dependent" and age < 26:
        return "Child"
    return "Other Relationship"


def _cms_people(request: CMSMarketplaceSearchRequest) -> list[dict]:
    has_mec = bool(MEC_COVERAGE.intersection(request.current_coverage))
    has_child = any(person.relationship == "dependent" and person.age < 18 for person in request.people)
    aptc_eligible = request.immigration_status != "prefer_not"
    return [
        {
            "age": person.age,
            "aptc_eligible": aptc_eligible,
            "has_mec": has_mec,
            "is_parent": person.relationship in {"self", "spouse"} and has_child,
            "is_pregnant": person.is_pregnant,
            "relationship": _relationship(person.relationship, person.age),
            "uses_tobacco": person.uses_tobacco,
        }
        for person in request.people
    ]


def _preferred_cost(items: Iterable[dict], people_count: int) -> Optional[float]:
    in_network = [
        item for item in items
        if item.get("network_tier") in {"In-Network", "Combined In-Out of Network"}
    ]
    if not in_network:
        return None
    if people_count > 1:
        preferences = (
            lambda item: item.get("family_cost") == "Family",
            lambda item: bool(item.get("family")),
            lambda item: item.get("family_cost") == "Family Per Person",
        )
    else:
        preferences = (
            lambda item: item.get("family_cost") == "Individual",
            lambda item: bool(item.get("individual")),
        )
    for predicate in preferences:
        for item in in_network:
            if predicate(item):
                return _number(item.get("amount"))
    return _number(in_network[0].get("amount"))


def _plan_summary(plan: dict, people_count: int) -> dict:
    issuer = plan.get("issuer") if isinstance(plan.get("issuer"), dict) else {}
    quality = plan.get("quality_rating") if isinstance(plan.get("quality_rating"), dict) else {}
    premium = _number(plan.get("premium"))
    premium_with_credit = _number(plan.get("premium_w_credit"))
    return {
        "id": str(plan.get("id") or ""),
        "name": str(plan.get("name") or "Marketplace health plan"),
        "issuer": str(issuer.get("name") or ""),
        "metal_level": str(plan.get("metal_level") or ""),
        "plan_type": str(plan.get("type") or ""),
        "premium": premium,
        "premium_with_credit": premium_with_credit,
        "monthly_savings": (
            round(max(0.0, premium - premium_with_credit), 2)
            if premium is not None and premium_with_credit is not None
            else None
        ),
        "deductible": _preferred_cost(plan.get("deductibles") or [], people_count),
        "maximum_out_of_pocket": _preferred_cost(plan.get("moops") or [], people_count),
        "cost_scope": "Family" if people_count > 1 else "Individual",
        "quality_rating": (
            int(quality.get("global_rating"))
            if quality.get("available") and isinstance(quality.get("global_rating"), (int, float))
            and quality.get("global_rating") > 0
            else None
        ),
        "hsa_eligible": bool(plan.get("hsa_eligible")),
        "guaranteed_rate": bool(plan.get("guaranteed_rate")),
        "benefits_url": _safe_url(plan.get("benefits_url")),
        "brochure_url": _safe_url(plan.get("brochure_url")),
        "network_url": _safe_url(plan.get("network_url")),
        "issuer_url": _safe_url(issuer.get("individual_url")),
    }


def search_marketplace_plans(request: CMSMarketplaceSearchRequest) -> dict:
    """Return a small, price-sorted set of current Marketplace plans."""
    years = _request_json("GET", "/market-years")
    year = int(years.get("current") or max(years.get("supported") or []))

    # The geography endpoint covers every state, while plan search only covers
    # states served by the federal platform (plus CMS-supported state models).
    # A plain SBM response therefore needs an official-state-Marketplace
    # handoff instead of being presented as a temporary API outage.
    state_data = _request_json(
        "GET",
        f"/states/{request.state}",
        params={"year": year},
    )
    marketplace_model = str(
        state_data.get("marketplace") or state_data.get("marketplace_model") or ""
    )
    marketplace_name = str(
        state_data.get("hix_name") or "Health Insurance Marketplace"
    )
    marketplace_url = (
        _safe_url(state_data.get("hix_url"))
        or "https://www.healthcare.gov/see-plans/"
    )

    county_data = _request_json(
        "GET",
        f"/counties/by/zip/{request.zip_code}",
        params={"year": year},
    )
    counties = [
        county for county in county_data.get("counties", [])
        if str(county.get("state", "")).upper() == request.state
    ]
    if request.county_fips:
        counties = [county for county in counties if county.get("fips") == request.county_fips]
    if not counties:
        raise CMSMarketplaceLocationError(
            "The ZIP code did not match a county in the selected state"
        )
    county = counties[0]
    place = {
        "countyfips": county["fips"],
        "state": request.state,
        "zipcode": request.zip_code,
    }
    base_response = {
        "available": True,
        "year": year,
        "state": request.state,
        "state_name": str(state_data.get("name") or request.state),
        "zip_code": request.zip_code,
        "county_fips": str(county.get("fips") or ""),
        "county_name": str(county.get("name") or ""),
        "county_options": [
            {"fips": str(item.get("fips") or ""), "name": str(item.get("name") or "")}
            for item in counties
        ],
        "marketplace_name": marketplace_name,
        "marketplace_url": marketplace_url,
        "marketplace_model": marketplace_model,
        "source_url": CMS_MARKETPLACE_SOURCE_URL,
    }

    if marketplace_model.upper() == "SBM":
        return {
            **base_response,
            "plan_estimates_available": False,
            "total": 0,
            "plans": [],
            "people_assessed": 0,
            "medicaid_chip_estimate_count": 0,
        }

    people = _cms_people(request)
    household = {
        "income": request.income,
        "people": people,
        "has_married_couple": any(person.relationship == "spouse" for person in request.people),
    }

    estimates_data = _request_json(
        "POST",
        "/households/eligibility/estimates",
        json={"household": household, "place": place, "year": year},
    )
    plans_data = _request_json(
        "POST",
        "/plans/search",
        json={
            "household": household,
            "market": "Individual",
            "place": place,
            "year": year,
            "offset": 0,
            "order": "asc",
            "sort": "premium",
            "filter": {"division": "HealthCare"},
        },
    )
    estimates = estimates_data.get("estimates") or []
    plans = [
        _plan_summary(plan, len(request.people))
        for plan in (plans_data.get("plans") or [])[:MAX_RETURNED_PLANS]
        if plan.get("id")
    ]
    return {
        **base_response,
        "plan_estimates_available": True,
        "total": int(plans_data.get("total") or 0),
        "plans": plans,
        "people_assessed": len(estimates),
        "medicaid_chip_estimate_count": sum(
            bool(estimate.get("is_medicaid_chip")) for estimate in estimates
        ),
    }
