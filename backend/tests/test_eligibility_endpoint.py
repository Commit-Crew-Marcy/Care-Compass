"""Regression tests for POST /api/eligibility/check.

Covers the exact payload reported as failing on the Review step, a second
valid senior questionnaire shape, and the 422 behavior for malformed input.
"""
import pytest
from fastapi.testclient import TestClient

from main import app

# The exact payload from the bug report — a 67-year-old, single-person
# household in CT with no disability/veteran/insurance flags set.
REPORTED_PAYLOAD = {
    "age": 67,
    "income": 68888,
    "state": "CT",
    "householdSize": 1,
    "disabilityStatus": False,
    "veteranStatus": False,
    "isPregnant": False,
    "hasChildrenUnder18": False,
    "hasChildrenUnder5": False,
    "immigrationStatus": "prefer_not",
    "yearsInUs": None,
    "insuranceStatus": False,
    "currentCoverage": [],
}


@pytest.fixture(scope="module")
def client():
    return TestClient(app)


def test_reported_payload_returns_200(client):
    r = client.post("/api/eligibility/check", json=REPORTED_PAYLOAD)
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_valid_senior_questionnaire_returns_json_list(client):
    payload = {
        **REPORTED_PAYLOAD,
        "age": 70,
        "income": 15000,
        "state": "NY",
        "insuranceStatus": True,
        "currentCoverage": ["medicare"],
    }
    r = client.post("/api/eligibility/check", json=payload)
    assert r.status_code == 200
    body = r.json()
    assert isinstance(body, list)
    assert all("id" in b and "matchReason" in b for b in body)


def test_malformed_request_returns_422(client):
    bad_payload = {**REPORTED_PAYLOAD, "age": "not-a-number", "state": "C"}
    r = client.post("/api/eligibility/check", json=bad_payload)
    assert r.status_code == 422
    body = r.json()
    assert "detail" in body
    assert isinstance(body["detail"], list)


def test_missing_required_field_returns_422(client):
    incomplete = {k: v for k, v in REPORTED_PAYLOAD.items() if k != "state"}
    r = client.post("/api/eligibility/check", json=incomplete)
    assert r.status_code == 422
