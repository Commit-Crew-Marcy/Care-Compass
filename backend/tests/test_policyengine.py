"""Contract tests for the PolicyEngine US state program catalog."""
from types import SimpleNamespace

from fastapi.testclient import TestClient

from main import app
from models.schemas import PolicyEngineEligibilityRequest
import services.policyengine as policyengine_service
from services.policyengine import (
    FEDERAL_PROGRAMS,
    SOURCE_COMMIT,
    STATE_NAMES,
    TANF_PROGRAMS,
    get_program_catalog,
)


def _fake_model_result():
    person = SimpleNamespace(
        is_medicare_eligible=False,
        msp_eligible=False,
        is_medicaid_eligible=True,
        is_chip_eligible=False,
        is_aca_ptc_eligible=True,
        is_wic_eligible=False,
        wic=0,
        commodity_supplemental_food_program_eligible=False,
        commodity_supplemental_food_program=0,
        is_ssi_eligible=False,
        ssi=0,
    )
    spouse = SimpleNamespace(**vars(person))
    return SimpleNamespace(
        person=[person, spouse],
        tax_unit=SimpleNamespace(
            aca_ptc=1_200,
            eitc_eligible=True,
            eitc=5_454,
            ctc_value=0,
        ),
        spm_unit=SimpleNamespace(
            is_snap_eligible=True,
            snap=3_205,
            school_meal_net_subsidy=780,
            is_lifeline_eligible=True,
            lifeline=111,
            is_eligible_for_housing_assistance=False,
            housing_assistance=0,
            tanf=0,
            child_care_subsidies=0,
        ),
        household=SimpleNamespace(
            household_refundable_state_tax_credits=450,
        ),
    )


def test_every_state_and_dc_has_nationwide_programs_and_a_state_tanf_program():
    assert len(STATE_NAMES) == 51
    assert set(TANF_PROGRAMS) == set(STATE_NAMES)

    for state in STATE_NAMES:
        catalog = get_program_catalog(state)
        programs = catalog["programs"]
        assert len(programs) >= len(FEDERAL_PROGRAMS) + 1
        assert any(program["program_type"] == "medicaid" for program in programs)
        assert any(
            program["program_type"] == "tanf" and program["scope"] == "state"
            for program in programs
        )


def test_arizona_catalog_includes_named_state_programs_and_no_calculation_fields():
    catalog = get_program_catalog("AZ")
    programs = {program["name"]: program for program in catalog["programs"]}

    assert catalog["state_name"] == "Arizona"
    assert catalog["source_commit"] == SOURCE_COMMIT
    assert "Arizona TANF cash assistance" in programs
    assert "Arizona Child Care Assistance Program" in programs
    assert "Arizona refundable tax credits" in programs
    assert "Arizona" in programs["Arizona Child Care Assistance Program"]["match_reason"]
    assert all("model_variable" not in program for program in programs.values())
    assert all("estimated_annual_amount" not in program for program in programs.values())
    assert all("eligible" not in program for program in programs.values())


def test_catalog_endpoint_requires_only_the_state_and_never_calls_docker():
    response = TestClient(app).get("/api/policyengine/programs/AZ")

    assert response.status_code == 200
    body = response.json()
    assert body["state"] == "AZ"
    assert body["stateName"] == "Arizona"
    assert body["programs"]
    assert "does not calculate eligibility" in body["catalogNote"]


def test_catalog_endpoint_rejects_unknown_state_codes():
    response = TestClient(app).get("/api/policyengine/programs/ZZ")
    assert response.status_code == 422


def test_questionnaire_answers_are_mapped_to_a_policyengine_household(monkeypatch):
    captured = {}

    def fake_calculation(**kwargs):
        captured.update(kwargs)
        return _fake_model_result()

    monkeypatch.setattr(
        policyengine_service,
        "_run_policyengine_calculation",
        fake_calculation,
    )
    request = PolicyEngineEligibilityRequest.model_validate({
        "age": 40,
        "income": 50_000,
        "state": "AZ",
        "householdSize": 2,
        "disabilityStatus": False,
        "isPregnant": False,
        "immigrationStatus": "citizen",
        "insuranceStatus": False,
        "currentCoverage": [],
        "additionalPeople": [{
            "relationship": "spouse",
            "age": 38,
            "annualEmploymentIncome": 20_000,
            "isDisabled": False,
            "isPregnant": False,
        }],
    })

    response = policyengine_service.calculate_program_eligibility(request)
    assert captured["household"] == {"state_code": "AZ"}
    assert captured["tax_unit"] == {"filing_status": "JOINT"}
    assert captured["people"][0]["employment_income"] == 30_000
    assert captured["people"][0]["is_tax_unit_head"] is True
    assert captured["people"][1]["employment_income"] == 20_000
    assert captured["people"][1]["is_tax_unit_spouse"] is True
    assert captured["people"][0]["is_in_k12_school"] is False
    assert captured["people"][1]["is_in_k12_school"] is False
    assert response["calculation_available"] is True
    snap = next(program for program in response["programs"] if program["program_type"] == "snap")
    assert snap["eligibility_status"] == "likely_eligible"
    assert snap["estimated_annual_amount"] == 3_205
    lifeline = next(program for program in response["programs"] if program["program_type"] == "cash" and program["name"].startswith("Lifeline"))
    assert lifeline["eligibility_status"] == "likely_eligible"
    assert lifeline["estimated_annual_amount"] == 111
    school_meals = next(program for program in response["programs"] if program["program_type"] == "school_lunch")
    assert school_meals["eligibility_status"] == "likely_eligible"
    state_credits = next(program for program in response["programs"] if program["program_type"] == "state_tax_credit")
    assert state_credits["eligibility_status"] == "likely_eligible"
    assert state_credits["estimated_annual_amount"] == 450
    housing = next(program for program in response["programs"] if program["program_type"] == "housing")
    assert housing["eligibility_status"] == "check_eligibility"
    assert housing["model_calculated"] is True


def test_ambiguous_immigration_answer_stays_neutral(monkeypatch):
    monkeypatch.setattr(
        policyengine_service,
        "_run_policyengine_calculation",
        lambda **_: _fake_model_result(),
    )
    request = PolicyEngineEligibilityRequest.model_validate({
        "age": 40,
        "income": 20_000,
        "state": "AZ",
        "immigrationStatus": "prefer_not",
    })

    response = policyengine_service.calculate_program_eligibility(request)
    snap = next(program for program in response["programs"] if program["program_type"] == "snap")

    assert snap["eligibility_status"] == "check_eligibility"
    assert snap["model_calculated"] is False
    assert "did not guess" in snap["calculation_reason"]


def test_model_failure_returns_check_eligibility_catalog_fallback(monkeypatch):
    def unavailable(**_):
        raise RuntimeError("model unavailable")

    monkeypatch.setattr(
        policyengine_service,
        "_run_policyengine_calculation",
        unavailable,
    )
    response = TestClient(app).post("/api/policyengine/eligibility", json={
        "age": 30,
        "income": 25_000,
        "state": "CT",
        "householdSize": 1,
        "immigrationStatus": "citizen",
    })

    assert response.status_code == 200
    body = response.json()
    assert body["calculationAvailable"] is False
    assert body["programs"]
    assert all(program["eligibilityStatus"] == "check_eligibility" for program in body["programs"])
    assert all(program["eligibilityLabel"] == "Check eligibility" for program in body["programs"])
