"""Tests for the senior-friendly CareCompass AI Guide (POST /api/ai/chat).

These focus on what can be tested without a live Anthropic or Gemini API call: the
action allowlist, page-context validation, and response-length enforcement
are pure functions, so they're exercised directly. The missing-API-key path
is exercised through the real endpoint since it never reaches the network.
"""
import pytest
from fastapi.testclient import TestClient

from main import app
from models.schemas import ExtensionPageContext, PageContext
from routers.ai import (
    ACTION_TOOL,
    EXTENSION_ACTION_TOOL,
    UNAVAILABLE_MESSAGE,
    enforce_step_limit,
    enforce_word_limit,
    is_approved_route,
    validate_action,
    validate_extension_action,
)


@pytest.fixture(scope="module")
def client():
    return TestClient(app)


# ---------- missing API key ----------


def test_missing_api_key_returns_graceful_503(client, monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    r = client.post("/api/ai/chat", json={"question": "What is SNAP?"})
    assert r.status_code == 503
    assert r.json()["detail"] == UNAVAILABLE_MESSAGE


def test_missing_question_is_rejected(client, monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    r = client.post("/api/ai/chat", json={})
    assert r.status_code == 422


# ---------- approved routes ----------


def test_approved_static_routes_are_accepted():
    for route in ["/", "/questionnaire", "/results", "/login", "/register", "/screenings"]:
        assert is_approved_route(route) is True


def test_approved_benefit_detail_route_pattern():
    assert is_approved_route("/benefits/42") is True
    assert is_approved_route("/benefits/0") is True
    assert is_approved_route("/benefits/nyc-P015en") is True


def test_arbitrary_and_external_urls_are_rejected():
    for route in [
        "https://example.com/phish",
        "/benefits/abc",
        "/admin",
        "//evil.com",
        "",
        None,
    ]:
        assert is_approved_route(route) is False


# ---------- action validation ----------


def test_unsupported_action_type_is_rejected():
    assert validate_action({"type": "submit_form"}, None) is None
    assert validate_action({"type": "delete_screening", "target": "1"}, None) is None
    assert validate_action(None, None) is None


def test_navigate_to_unapproved_route_is_rejected():
    action = validate_action({"type": "navigate_to_route", "target": "https://evil.com"}, None)
    assert action is None


def test_navigate_to_approved_route_is_accepted():
    action = validate_action({"type": "navigate_to_route", "target": "/results"}, None)
    assert action is not None
    assert action.type == "navigate_to_route"
    assert action.target == "/results"
    assert action.requires_confirmation is False


def test_navigate_away_from_unfinished_questionnaire_requires_confirmation():
    context = PageContext(route="/questionnaire", questionnaire_step=3)
    action = validate_action({"type": "navigate_to_route", "target": "/results"}, context)
    assert action is not None
    assert action.requires_confirmation is True


def test_navigate_within_questionnaire_does_not_require_confirmation():
    context = PageContext(route="/questionnaire", questionnaire_step=3)
    action = validate_action({"type": "navigate_to_route", "target": "/questionnaire"}, context)
    assert action is not None
    assert action.requires_confirmation is False


def test_replacing_results_requires_confirmation():
    context = PageContext(route="/results")
    action = validate_action({"type": "navigate_to_route", "target": "/questionnaire"}, context)
    assert action is not None
    assert action.requires_confirmation is True


def test_scroll_to_element_not_in_page_context_is_rejected():
    context = PageContext(
        route="/questionnaire",
        visible_controls=[{"id": "continue-button", "type": "button", "label": "Continue"}],
    )
    assert validate_action({"type": "scroll_to_element", "target": "delete-account-button"}, context) is None


def test_scroll_to_approved_visible_element_is_accepted():
    context = PageContext(
        route="/questionnaire",
        visible_controls=[{"id": "continue-button", "type": "button", "label": "Continue"}],
    )
    action = validate_action({"type": "scroll_to_element", "target": "continue-button"}, context)
    assert action is not None
    assert action.target == "continue-button"


def test_scroll_to_element_with_no_page_context_is_rejected():
    assert validate_action({"type": "scroll_to_element", "target": "anything"}, None) is None


def test_go_back_open_close_take_no_target():
    for action_type in ("go_back", "open_chat", "close_chat"):
        action = validate_action({"type": action_type}, None)
        assert action is not None
        assert action.target is None
        assert action.requires_confirmation is False


def test_action_tool_schema_only_exposes_allowed_types():
    enum_values = set(ACTION_TOOL["input_schema"]["properties"]["type"]["enum"])
    assert enum_values == {
        "navigate_to_route",
        "scroll_to_element",
        "focus_element",
        "go_back",
        "open_chat",
        "close_chat",
    }


# ---------- response-length enforcement ----------


def test_enforce_step_limit_drops_extra_numbered_steps():
    text = "1. First.\n2. Second.\n3. Third.\n4. Fourth.\n5. Fifth."
    result = enforce_step_limit(text, 3)
    assert "1. First." in result
    assert "3. Third." in result
    assert "4. Fourth." not in result
    assert "5. Fifth." not in result


def test_enforce_word_limit_keeps_complete_sentences_under_budget():
    text = "This is one. This is two. This is three. This is four."
    result = enforce_word_limit(text, 6)
    # Must not cut mid-sentence — every kept sentence ends with punctuation.
    assert result.strip().endswith((".", "!", "?"))
    assert len(result.split()) <= 6


def test_enforce_word_limit_is_a_no_op_when_already_short():
    text = "Short answer."
    assert enforce_word_limit(text, 80) == text


def test_enforce_word_limit_falls_back_safely_with_no_punctuation():
    text = " ".join(["word"] * 100)
    result = enforce_word_limit(text, 10)
    assert result.endswith("...")
    assert len(result.split()) <= 11  # 10 words + the ellipsis token


# ---------- page context excludes unlisted/sensitive fields ----------


def test_page_context_drops_fields_outside_the_approved_schema():
    context = PageContext.model_validate(
        {
            "route": "/questionnaire",
            "ssn": "123-45-6789",
            "password": "hunter2",
            "disabilityOtherText": "sensitive free text",
        }
    )
    dumped = context.model_dump()
    assert "ssn" not in dumped
    assert "password" not in dumped
    assert "disability_other_text" not in dumped
    assert "disabilityOtherText" not in dumped


# ---------- browser extension route ----------


def extension_context(allowed_actions=None):
    return ExtensionPageContext(
        url="https://www.benefits.gov/help",
        domain="www.benefits.gov",
        page_title="Benefits help",
        page_text="This page explains how to find help.",
        interactive_elements=[
            {
                "id": "cc-element-1",
                "role": "link",
                "label": "Learn more",
                "tag": "a",
                "href": "https://www.benefits.gov/more",
                "allowedActions": allowed_actions or ["scroll", "focus", "click"],
            }
        ],
    )


def test_extension_missing_api_key_returns_graceful_503(client, monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "website-key-is-not-the-extension-key")
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    response = client.post(
        "/api/ai/extension/chat",
        json={
            "question": "Explain this page.",
            "pageContext": extension_context().model_dump(by_alias=True),
        },
    )
    assert response.status_code == 503
    assert response.json()["detail"] == UNAVAILABLE_MESSAGE


def test_extension_rejects_non_web_page_url(client, monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    context = extension_context().model_dump(by_alias=True)
    context["url"] = "chrome://extensions"
    response = client.post(
        "/api/ai/extension/chat",
        json={"question": "Explain this page.", "pageContext": context},
    )
    assert response.status_code == 422
    assert response.json()["detail"] == "Only regular web pages are supported."


def test_extension_click_requires_captured_click_capability_and_confirmation():
    context = extension_context()
    action = validate_extension_action(
        {"type": "click_element", "target": "cc-element-1"}, context
    )
    assert action is not None
    assert action.requires_confirmation is True

    no_click_context = extension_context(["scroll", "focus"])
    assert validate_extension_action(
        {"type": "click_element", "target": "cc-element-1"}, no_click_context
    ) is None


def test_extension_rejects_unknown_targets_and_unsupported_actions():
    context = extension_context()
    assert validate_extension_action(
        {"type": "scroll_to_element", "target": "missing"}, context
    ) is None
    assert validate_extension_action(
        {"type": "submit_form", "target": "cc-element-1"}, context
    ) is None


def test_extension_tool_schema_only_exposes_safe_navigation_actions():
    enum_values = set(
        EXTENSION_ACTION_TOOL["input_schema"]["properties"]["type"]["enum"]
    )
    assert enum_values == {
        "scroll_to_element",
        "focus_element",
        "click_element",
        "go_back",
    }


def test_extension_uses_gemini_and_returns_a_revalidated_action(client, monkeypatch):
    captured = {}

    def fake_generate(**kwargs):
        captured.update(kwargs)
        return (
            "This page explains benefits. I can move to Learn more.",
            {"type": "scroll_to_element", "target": "cc-element-1"},
        )

    monkeypatch.setenv("GEMINI_API_KEY", "test-gemini-key")
    monkeypatch.setenv("GEMINI_MODEL", "test-gemini-model")
    monkeypatch.setattr("routers.ai.generate_gemini_content", fake_generate)

    response = client.post(
        "/api/ai/extension/chat",
        json={
            "question": "What does this page do?",
            "pageContext": extension_context().model_dump(by_alias=True),
        },
    )

    assert response.status_code == 200
    assert response.json()["message"].startswith("This page explains benefits.")
    assert response.json()["action"] == {
        "type": "scroll_to_element",
        "target": "cc-element-1",
        "requiresConfirmation": False,
    }
    assert captured["api_key"] == "test-gemini-key"
    assert captured["model"] == "test-gemini-model"
    assert captured["tool_definition"]["name"] == "suggest_extension_action"


def test_extension_rejects_an_unsafe_gemini_action(client, monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "test-gemini-key")
    monkeypatch.setattr(
        "routers.ai.generate_gemini_content",
        lambda **kwargs: ("I will submit it.", {"type": "submit_form"}),
    )

    response = client.post(
        "/api/ai/extension/chat",
        json={
            "question": "Submit this form for me.",
            "pageContext": extension_context().model_dump(by_alias=True),
        },
    )

    assert response.status_code == 200
    assert response.json()["message"] == "I cannot perform that action, but I can explain how to do it."
    assert response.json()["action"] is None
