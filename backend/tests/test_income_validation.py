"""Tests for income validation on POST /api/eligibility/check.

Valid income: integer, 0 – 10,000,000.
Pydantic rejects out-of-range or non-integer values with HTTP 422.
"""
import pytest
from fastapi.testclient import TestClient

from main import app

# Minimal valid intake — only income is varied across tests.
BASE_INTAKE = {
    "age": 35,
    "income": 45000,
    "state": "NY",
    "householdSize": 1,
    "disabilityStatus": False,
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


def _post(client, income):
    return client.post("/api/eligibility/check", json={**BASE_INTAKE, "income": income})


# ---- valid incomes ----

def test_income_zero_accepted(client):
    assert _post(client, 0).status_code == 200


def test_income_45000_accepted(client):
    assert _post(client, 45000).status_code == 200


def test_income_10000000_accepted(client):
    assert _post(client, 10_000_000).status_code == 200


# ---- invalid incomes ----

def test_income_above_max_rejected(client):
    resp = _post(client, 10_000_001)
    assert resp.status_code == 422


def test_income_negative_rejected(client):
    resp = _post(client, -1)
    assert resp.status_code == 422


def test_income_decimal_rejected(client):
    # Pydantic v2 rejects floats with a fractional part for int fields.
    resp = _post(client, 45000.50)
    assert resp.status_code == 422
