"""Contract tests for the NYC Benefits and Programs dataset adapter."""
from fastapi.testclient import TestClient

from main import app
from models.schemas import IntakeForm
from services.nyc_benefits import find_nyc_programs, get_nyc_program, plain_text


SAMPLE_RECORDS = [
    {
        "unique_id_number": "P015en",
        "program_name": "Senior Citizen Rent Increase Exemption",
        "program_category": "Housing",
        "population_served": "Older Adults",
        "age_group": "Caregiver",
        "plain_language_program_name": "Rent freeze for seniors",
        "program_description": "<p>A <strong>rent freeze</strong> for seniors.</p>",
        "brief_excerpt": "<p>Help seniors stay in their home.</p>",
        "plain_language_eligibility": "<ol><li>Be 62 or older</li><li>Live in NYC</li></ol>",
        "how_to_apply_summary": "<p>Apply through the NYC Rent Freeze program.</p>",
        "url_of_online_application": "https://www.nyc.gov/rentfreeze",
        "required_documents_summary": "<p>Proof of age and rent.</p>",
        "government_agency": "NYC Department of Finance",
        "updated_at": "2026-05-01T12:00:00.000",
    },
    {
        "unique_id_number": "P011en",
        "program_name": "Qualified Health Plans",
        "program_category": "Health",
        "population_served": "All New Yorkers, regardless of immigration status",
        "age_group": "Everyone",
        "plain_language_program_name": "Private health insurance plans",
        "program_description": "<p>Health coverage.</p>",
        "brief_excerpt": "<p>Private health coverage through New York State.</p>",
        "plain_language_eligibility": "<p>Live in New York State.</p>",
        "url_of_online_application": "https://nystateofhealth.ny.gov/",
    },
    {
        "unique_id_number": "P007en",
        "program_name": "Supplemental Nutrition Assistance Program",
        "program_category": "Food",
        "population_served": "NULL",
        "age_group": "Everyone",
        "brief_excerpt": "<p>Money for groceries.</p>",
        "url_of_online_application": "https://a069-access.nyc.gov/",
    },
]


def intake(**changes):
    values = {
        "age": 70,
        "income": 30000,
        "state": "NY",
        "nycResident": True,
        "helpCategories": ["housing"],
        "householdSize": 1,
        "disabilityStatus": False,
        "veteranStatus": False,
        "isPregnant": False,
        "hasChildrenUnder18": False,
        "hasChildrenUnder5": False,
        "immigrationStatus": "prefer_not",
        "insuranceStatus": False,
        "currentCoverage": [],
    }
    values.update(changes)
    return IntakeForm.model_validate(values)


def test_html_from_dataset_is_converted_to_plain_text():
    assert plain_text("<p>Use <strong>simple</strong> text.</p>") == "Use simple text."
    assert plain_text("NULL") == ""


def test_only_selected_categories_are_returned_for_confirmed_nyc_residents():
    results = find_nyc_programs(intake(), records=SAMPLE_RECORDS)
    assert [item["id"] for item in results] == ["nyc-P015en"]
    assert results[0]["source"] == "nyc_open_data"
    assert "has not confirmed eligibility" in results[0]["match_reason"]
    assert "<" not in results[0]["description"]


def test_nyc_directory_is_not_used_without_explicit_nyc_residency():
    assert find_nyc_programs(intake(nycResident=False), records=SAMPLE_RECORDS) == []
    assert find_nyc_programs(intake(state="NJ", nycResident=False), records=SAMPLE_RECORDS) == []


def test_existing_rules_engine_program_is_not_duplicated():
    results = find_nyc_programs(
        intake(helpCategories=["food"]),
        existing_program_types={"snap"},
        records=SAMPLE_RECORDS,
    )
    assert results == []


def test_detail_mapping_includes_official_eligibility_and_documents():
    detail = get_nyc_program("P015en", records=SAMPLE_RECORDS)
    assert detail["id"] == "nyc-P015en"
    assert detail["federal"] is False
    assert "Be 62 or older" in detail["eligibility_details"]
    assert detail["requirements"][0]["description"] == "Proof of age and rent."


def test_eligibility_endpoint_merges_nyc_results_without_changing_response_shape(monkeypatch):
    nyc_card = {
        "id": "nyc-P011en",
        "name": "Qualified Health Plans",
        "description": "Health coverage.",
        "eligibility_summary": "Private health coverage through New York State.",
        "apply_url": "https://nystateofhealth.ny.gov/",
        "program_type": "health",
        "match_reason": "This official NYC directory program may be relevant.",
        "source": "nyc_open_data",
        "external_id": "P011en",
    }
    monkeypatch.setattr("routers.eligibility.find_nyc_programs", lambda *args, **kwargs: [nyc_card])

    client = TestClient(app)
    response = client.post(
        "/api/eligibility/check",
        json=intake(helpCategories=["health"]).model_dump(by_alias=True),
    )
    assert response.status_code == 200
    body = response.json()
    assert isinstance(body, list)
    assert any(item["id"] == "nyc-P011en" and item["source"] == "nyc_open_data" for item in body)


def test_nyc_detail_endpoint_uses_the_same_benefit_shape(monkeypatch):
    detail = get_nyc_program("P015en", records=SAMPLE_RECORDS)
    monkeypatch.setattr("routers.nyc_benefits.get_nyc_program", lambda program_id: detail)
    response = TestClient(app).get("/api/nyc-benefits/P015en")
    assert response.status_code == 200
    assert response.json()["id"] == "nyc-P015en"
    assert response.json()["eligibilityDetails"]
