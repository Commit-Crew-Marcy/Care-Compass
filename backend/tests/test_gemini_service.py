"""Pure response-parsing tests for the Gemini adapter."""
from types import SimpleNamespace

import pytest

from services.gemini import (
    GeminiServiceError,
    extract_gemini_response,
    generate_gemini_content,
)


def response_with(*, texts=(), calls=()):
    parts = [SimpleNamespace(text=text) for text in texts]
    content = SimpleNamespace(parts=parts)
    candidate = SimpleNamespace(content=content)
    return SimpleNamespace(candidates=[candidate], function_calls=list(calls))


def test_extracts_text_and_the_expected_function_call():
    response = response_with(
        texts=("This page explains food assistance.",),
        calls=(
            SimpleNamespace(
                name="suggest_extension_action",
                args={"type": "focus_element", "target": "cc-element-2"},
            ),
        ),
    )

    text, action = extract_gemini_response(response, "suggest_extension_action")

    assert text == "This page explains food assistance."
    assert action == {"type": "focus_element", "target": "cc-element-2"}


def test_ignores_function_calls_with_an_unexpected_name():
    response = response_with(
        texts=("Safe answer.",),
        calls=(SimpleNamespace(name="submit_form", args={"type": "submit_form"}),),
    )
    text, action = extract_gemini_response(response, "suggest_extension_action")
    assert text == "Safe answer."
    assert action is None


def test_rejects_an_empty_gemini_response():
    with pytest.raises(GeminiServiceError):
        extract_gemini_response(response_with(), "suggest_extension_action")


def test_builds_the_official_sdk_request_without_executing_the_tool(monkeypatch):
    from google import genai

    captured = {}
    fake_response = response_with(
        texts=("Short explanation.",),
        calls=(
            SimpleNamespace(
                name="suggest_extension_action",
                args={"type": "scroll_to_element", "target": "cc-element-1"},
            ),
        ),
    )

    class FakeModels:
        def generate_content(self, **kwargs):
            captured.update(kwargs)
            return fake_response

    class FakeClient:
        def __init__(self, api_key):
            captured["api_key"] = api_key
            self.models = FakeModels()

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, traceback):
            return False

    monkeypatch.setattr(genai, "Client", FakeClient)
    text, action = generate_gemini_content(
        api_key="test-key",
        model="test-model",
        system_prompt="Use short sentences.",
        user_content="Explain this page.",
        tool_definition={
            "name": "suggest_extension_action",
            "description": "Suggest one safe action.",
            "input_schema": {
                "type": "object",
                "properties": {"type": {"type": "string"}},
                "required": ["type"],
            },
        },
    )

    assert text == "Short explanation."
    assert action["type"] == "scroll_to_element"
    assert captured["api_key"] == "test-key"
    assert captured["model"] == "test-model"
    assert captured["contents"] == "Explain this page."
    assert captured["config"].automatic_function_calling.disable is True
