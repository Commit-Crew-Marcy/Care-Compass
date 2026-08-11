"""Request/response tests for the single-call Groq fallback adapter."""
from types import SimpleNamespace

import httpx
import pytest

from services.groq import (
    DEFAULT_GROQ_MODEL,
    GROQ_BASE_URL,
    GROQ_MAX_OUTPUT_TOKENS,
    GROQ_TIMEOUT_SECONDS,
    GroqServiceError,
    generate_groq_content,
)


def call_groq(**overrides):
    arguments = {
        "api_key": "test-groq-key",
        "model": DEFAULT_GROQ_MODEL,
        "system_prompt": "Use short sentences.",
        "user_content": "Explain this page.",
    }
    arguments.update(overrides)
    return generate_groq_content(**arguments)


def test_default_model_is_gpt_oss_20b():
    assert DEFAULT_GROQ_MODEL == "openai/gpt-oss-20b"


def test_builds_one_text_only_responses_api_request(monkeypatch):
    import openai

    captured = {"call_count": 0}

    class FakeResponses:
        def create(self, **kwargs):
            captured["call_count"] += 1
            captured.update(kwargs)
            return SimpleNamespace(output_text="  This page explains benefits.  ")

    class FakeClient:
        def __init__(self, **kwargs):
            captured["client"] = kwargs
            self.responses = FakeResponses()

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, traceback):
            return False

    monkeypatch.setattr(openai, "OpenAI", FakeClient)

    message = call_groq()

    assert message == "This page explains benefits."
    assert captured["client"] == {
        "api_key": "test-groq-key",
        "base_url": GROQ_BASE_URL,
        "timeout": GROQ_TIMEOUT_SECONDS,
        "max_retries": 0,
    }
    assert captured["model"] == DEFAULT_GROQ_MODEL
    assert captured["instructions"] == "Use short sentences."
    assert captured["input"] == "Explain this page."
    assert captured["max_output_tokens"] == GROQ_MAX_OUTPUT_TOKENS
    assert captured["reasoning"] == {"effort": "low"}
    assert captured["call_count"] == 1


def test_rejects_an_empty_groq_response(monkeypatch):
    import openai

    class FakeResponses:
        def create(self, **kwargs):
            return SimpleNamespace(output_text="")

    class FakeClient:
        def __init__(self, **kwargs):
            self.responses = FakeResponses()

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, traceback):
            return False

    monkeypatch.setattr(openai, "OpenAI", FakeClient)

    with pytest.raises(GroqServiceError):
        call_groq()


def test_wraps_provider_errors(monkeypatch):
    import openai

    class FailedResponses:
        def create(self, **kwargs):
            raise openai.APIConnectionError(
                request=httpx.Request("POST", f"{GROQ_BASE_URL}/responses")
            )

    class FakeClient:
        def __init__(self, **kwargs):
            self.responses = FailedResponses()

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, traceback):
            return False

    monkeypatch.setattr(openai, "OpenAI", FakeClient)

    with pytest.raises(GroqServiceError):
        call_groq()
