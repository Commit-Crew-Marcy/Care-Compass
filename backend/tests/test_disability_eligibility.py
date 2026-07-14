"""Tests that disability_details / disability_other_text do not affect eligibility.

The rules engine reads only intake.disability_status (bool). These tests confirm
that adding the new descriptive fields to an otherwise identical request produces
the same matched-benefit set, and that the endpoint accepts the new fields cleanly.
"""
import json
import pytest
from fastapi.testclient import TestClient

from main import app
from routers.screenings import to_out

BASE_INTAKE = {
    "age": 50,
    "income": 18000,
    "state": "NY",
    "householdSize": 1,
    "disabilityStatus": True,
    "veteranStatus": False,
    "isPregnant": False,
    "hasChildrenUnder18": False,
    "hasChildrenUnder5": False,
    "immigrationStatus": "citizen",
    "yearsInUs": None,
    "insuranceStatus": False,
    "currentCoverage": [],
}


@pytest.fixture(scope="module")
def client():
    return TestClient(app)


# ---- eligibility matching is unchanged by descriptive fields ----

def test_disability_details_do_not_change_eligibility(client):
    """Identical disabilityStatus produces identical matched-benefit sets."""
    r_bare = client.post("/api/eligibility/check", json=BASE_INTAKE)
    r_with_details = client.post("/api/eligibility/check", json={
        **BASE_INTAKE,
        "disabilityDetails": ["hearing", "vision", "mobility"],
        "disabilityOtherText": "Uses a hearing aid",
    })
    assert r_bare.status_code == 200
    assert r_with_details.status_code == 200
    ids_bare = {b["id"] for b in r_bare.json()}
    ids_with = {b["id"] for b in r_with_details.json()}
    assert ids_bare == ids_with, (
        "disabilityDetails must not change matched programs"
    )


def test_disability_false_unaffected_by_details(client):
    """disabilityStatus=False with vs without details → same outcomes."""
    no_disability = {**BASE_INTAKE, "disabilityStatus": False}
    r1 = client.post("/api/eligibility/check", json=no_disability)
    r2 = client.post("/api/eligibility/check", json={
        **no_disability,
        "disabilityDetails": [],
        "disabilityOtherText": None,
    })
    assert r1.status_code == 200
    assert r2.status_code == 200
    assert {b["id"] for b in r1.json()} == {b["id"] for b in r2.json()}


def test_endpoint_accepts_disability_details_without_422(client):
    """New descriptive fields are accepted — no validation rejection."""
    r = client.post("/api/eligibility/check", json={
        **BASE_INTAKE,
        "disabilityDetails": ["memory", "errands", "other"],
        "disabilityOtherText": "Chronic fatigue",
    })
    assert r.status_code == 200


def test_endpoint_accepts_empty_disability_details(client):
    r = client.post("/api/eligibility/check", json={
        **BASE_INTAKE,
        "disabilityDetails": [],
        "disabilityOtherText": None,
    })
    assert r.status_code == 200


# ---- to_out correctly serialises the new columns ----

def test_to_out_includes_disability_fields():
    """to_out returns disability_details as a list and disability_other_text as a string."""
    class _FakeScreening:
        screening_id = 1
        name = "Test"
        age = 50
        income = 18000
        state = "NY"
        household_size = 1
        disability_status = True
        disability_details = '["hearing","vision"]'
        disability_other_text = "Uses a hearing aid"
        veteran_status = False
        is_pregnant = False
        has_children_under_18 = False
        has_children_under_5 = False
        immigration_status = "citizen"
        years_in_us = None
        insurance_status = False
        current_coverage = "[]"
        matched_benefits = "[]"

    result = to_out(_FakeScreening())
    assert result["disability_details"] == ["hearing", "vision"]
    assert result["disability_other_text"] == "Uses a hearing aid"


def test_to_out_handles_null_disability_fields():
    """to_out is safe when the columns are NULL (existing screenings)."""
    class _OldScreening:
        screening_id = 2
        name = "Old screening"
        age = 35
        income = 45000
        state = "CA"
        household_size = 2
        disability_status = False
        disability_details = None      # pre-v3 row, column is NULL
        disability_other_text = None
        veteran_status = False
        is_pregnant = False
        has_children_under_18 = False
        has_children_under_5 = False
        immigration_status = "prefer_not"
        years_in_us = None
        insurance_status = False
        current_coverage = "[]"
        matched_benefits = "[]"

    result = to_out(_OldScreening())
    assert result["disability_details"] == []
    assert result["disability_other_text"] is None
