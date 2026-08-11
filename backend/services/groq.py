"""Single-call Groq fallback adapter for the browser extension.

The fallback returns text only. It never requests or executes browser tools;
page actions remain exclusive to the primary Gemini path and its existing
validation pipeline.
"""
from typing import Final

import httpx


DEFAULT_GROQ_MODEL: Final = "openai/gpt-oss-20b"
GROQ_BASE_URL: Final = "https://api.groq.com/openai/v1"
# Groq starts after the primary hedge delay, leaving this much of the shared
# five-second user-facing deadline.
GROQ_TIMEOUT_SECONDS: Final = 3.75
GROQ_MAX_OUTPUT_TOKENS: Final = 512


class GroqServiceError(RuntimeError):
    """Raised when Groq is unavailable or returns no usable text."""


def generate_groq_content(
    *,
    api_key: str,
    model: str,
    system_prompt: str,
    user_content: str,
) -> str:
    """Generate one text-only fallback response with no SDK retries."""
    try:
        from openai import OpenAI, OpenAIError
    except ImportError as exc:
        raise GroqServiceError("The OpenAI SDK is not installed") from exc

    try:
        with OpenAI(
            api_key=api_key,
            base_url=GROQ_BASE_URL,
            timeout=GROQ_TIMEOUT_SECONDS,
            max_retries=0,
        ) as client:
            response = client.responses.create(
                model=model,
                instructions=system_prompt,
                input=user_content,
                max_output_tokens=GROQ_MAX_OUTPUT_TOKENS,
                reasoning={"effort": "low"},
            )
    except (OpenAIError, httpx.HTTPError, OSError) as exc:
        raise GroqServiceError("Groq could not generate a response") from exc

    message_text = str(getattr(response, "output_text", "") or "").strip()
    if not message_text:
        raise GroqServiceError("Groq returned no usable content")
    return message_text
