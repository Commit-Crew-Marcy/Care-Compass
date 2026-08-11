"""Contract tests for the server-side CMS Marketplace adapter."""
from fastapi.testclient import TestClient

from main import app
from models.schemas import CMSMarketplaceSearchRequest
import services.cms_marketplace as cms_service


def request_body(**changes):
    values = {
        "state": "LA",
        "zipCode": "70802",
        "income": 52_000,
        "immigrationStatus": "citizen",
        "currentCoverage": [],
        "people": [
            {
                "age": 32,
                "relationship": "self",
                "isPregnant": False,
                "usesTobacco": False,
            },
            {
                "age": 8,
                "relationship": "dependent",
                "isPregnant": False,
                "usesTobacco": False,
            },
        ],
    }
    values.update(changes)
    return values


def test_marketplace_adapter_maps_household_and_returns_safe_plan_fields(monkeypatch):
    calls = []

    def fake_request(method, path, *, params=None, json=None):
        calls.append((method, path, params, json))
        if path == "/market-years":
            return {"current": 2026, "supported": [2025, 2026]}
        if path.startswith("/counties/by/zip/"):
            return {"counties": [{"fips": "22033", "name": "East Baton Rouge County", "state": "LA"}]}
        if path == "/households/eligibility/estimates":
            return {"estimates": [
                {"aptc": 420, "is_medicaid_chip": False},
                {"aptc": 0, "is_medicaid_chip": True},
            ]}
        if path == "/plans/search":
            return {
                "total": 59,
                "plans": [{
                    "id": "19636LA0230012",
                    "name": "Community Blue Bronze",
                    "issuer": {
                        "name": "HMO Louisiana",
                        "individual_url": "https://issuer.example/plan",
                    },
                    "metal_level": "Bronze",
                    "type": "POS",
                    "premium": 900.61,
                    "premium_w_credit": 480.61,
                    "hsa_eligible": True,
                    "guaranteed_rate": True,
                    "benefits_url": "https://issuer.example/sbc.pdf",
                    "quality_rating": {"available": True, "global_rating": 3},
                    "deductibles": [{
                        "network_tier": "In-Network",
                        "family_cost": "Family",
                        "family": True,
                        "amount": 12_000,
                    }],
                    "moops": [{
                        "network_tier": "In-Network",
                        "family_cost": "Family",
                        "family": True,
                        "amount": 18_000,
                    }],
                }],
            }
        if path == "/states/LA":
            return {
                "hix_name": "HealthCare.gov",
                "hix_url": "https://www.healthcare.gov/see-plans/",
                "marketplace": "FFM",
            }
        raise AssertionError(f"unexpected CMS request: {path}")

    monkeypatch.setattr(cms_service, "_request_json", fake_request)
    request = CMSMarketplaceSearchRequest.model_validate(request_body())
    response = cms_service.search_marketplace_plans(request)

    assert response["year"] == 2026
    assert response["county_fips"] == "22033"
    assert response["total"] == 59
    assert response["medicaid_chip_estimate_count"] == 1
    plan = response["plans"][0]
    assert plan["premium_with_credit"] == 480.61
    assert plan["monthly_savings"] == 420
    assert plan["deductible"] == 12_000
    assert plan["maximum_out_of_pocket"] == 18_000
    assert plan["quality_rating"] == 3

    estimate_call = next(call for call in calls if call[1] == "/households/eligibility/estimates")
    people = estimate_call[3]["household"]["people"]
    assert people[0]["relationship"] == "Self"
    assert people[0]["is_parent"] is True
    assert people[1]["relationship"] == "Child"
    assert people[0]["aptc_eligible"] is True


def test_marketplace_request_keeps_api_key_server_side(monkeypatch):
    captured = {}

    class Response:
        status_code = 200

        @staticmethod
        def json():
            return {"current": 2026}

    def fake_httpx_request(method, url, **kwargs):
        captured.update({"method": method, "url": url, **kwargs})
        return Response()

    monkeypatch.setenv("CMS_MARKETPLACE_API_KEY", "server-secret")
    monkeypatch.setattr(cms_service.httpx, "request", fake_httpx_request)

    assert cms_service._request_json("GET", "/market-years") == {"current": 2026}
    assert captured["params"]["apikey"] == "server-secret"
    assert "server-secret" not in captured["url"]


def test_state_based_marketplace_returns_official_handoff_without_plan_search(monkeypatch):
    calls = []

    def fake_request(method, path, *, params=None, json=None):
        calls.append(path)
        if path == "/market-years":
            return {"current": 2026, "supported": [2025, 2026]}
        if path == "/states/NY":
            return {
                "name": "New York",
                "marketplace_model": "SBM",
                "hix_name": "NY State of Health",
                "hix_url": "https://nystateofhealth.ny.gov/",
            }
        if path == "/counties/by/zip/10001":
            return {"counties": [{"fips": "36061", "name": "New York County", "state": "NY"}]}
        raise AssertionError(f"state Marketplace handoff should not call {path}")

    monkeypatch.setattr(cms_service, "_request_json", fake_request)
    request = CMSMarketplaceSearchRequest.model_validate(request_body(
        state="NY",
        zipCode="10001",
    ))
    response = cms_service.search_marketplace_plans(request)

    assert response["plan_estimates_available"] is False
    assert response["state_name"] == "New York"
    assert response["marketplace_name"] == "NY State of Health"
    assert response["marketplace_url"] == "https://nystateofhealth.ny.gov/"
    assert response["marketplace_model"] == "SBM"
    assert response["plans"] == []
    assert "/households/eligibility/estimates" not in calls
    assert "/plans/search" not in calls


def test_marketplace_endpoint_validates_zip_and_returns_camel_case(monkeypatch):
    monkeypatch.setattr(
        "routers.cms_marketplace.search_marketplace_plans",
        lambda request: {
            "available": True,
            "year": 2026,
            "state": request.state,
            "zip_code": request.zip_code,
            "county_fips": "22033",
            "county_name": "East Baton Rouge County",
            "county_options": [{"fips": "22033", "name": "East Baton Rouge County"}],
            "marketplace_name": "HealthCare.gov",
            "marketplace_url": "https://www.healthcare.gov/see-plans/",
            "marketplace_model": "FFM",
            "total": 0,
            "plans": [],
            "people_assessed": 1,
            "medicaid_chip_estimate_count": 0,
            "source_url": cms_service.CMS_MARKETPLACE_SOURCE_URL,
        },
    )
    client = TestClient(app)
    response = client.post("/api/cms/marketplace/search", json=request_body(people=[{
        "age": 32,
        "relationship": "self",
    }]))

    assert response.status_code == 200
    assert response.json()["countyFips"] == "22033"
    invalid = client.post(
        "/api/cms/marketplace/search",
        json=request_body(zipCode="7080"),
    )
    assert invalid.status_code == 422


def test_marketplace_endpoint_degrades_to_503_without_exposing_internal_error(monkeypatch):
    def unavailable(_request):
        raise cms_service.CMSMarketplaceError("do not expose upstream details")

    monkeypatch.setattr("routers.cms_marketplace.search_marketplace_plans", unavailable)
    response = TestClient(app).post("/api/cms/marketplace/search", json=request_body())

    assert response.status_code == 503
    assert response.json()["detail"] == "CMS Marketplace plan estimates are temporarily unavailable."
    assert "upstream" not in response.text
