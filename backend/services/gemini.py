"""Small, testable Gemini text/function-calling adapter.

The browser extension sends an already-filtered semantic page summary. This
module sends that text to Gemini and returns only model text plus one optional
function-call payload. It never executes the requested browser action.
"""
from typing import Optional, Tuple

import httpx


DEFAULT_GEMINI_MODEL = "gemini-3.1-flash-lite"
DEFAULT_GEMINI_FALLBACK_MODEL = "gemini-3-flash-preview"
GEMINI_TIMEOUT_MS = 10_000


class GeminiServiceError(RuntimeError):
    """Raised when Gemini is unavailable or returns an unusable response."""


def extract_gemini_response(response, tool_name: str) -> Tuple[str, Optional[dict]]:
    """Extract text and one named function call without executing anything."""
    text_parts = []
    candidates = getattr(response, "candidates", None) or []
    if candidates:
        content = getattr(candidates[0], "content", None)
        for part in getattr(content, "parts", None) or []:
            text = getattr(part, "text", None)
            if isinstance(text, str) and text.strip():
                text_parts.append(text.strip())

    raw_action = None
    try:
        function_calls = getattr(response, "function_calls", None) or []
    except (IndexError, ValueError):
        function_calls = []
    for function_call in function_calls:
        if getattr(function_call, "name", None) != tool_name:
            continue
        args = getattr(function_call, "args", None)
        if hasattr(args, "items"):
            raw_action = dict(args)
        break

    message_text = "\n".join(text_parts).strip()
    if not message_text and raw_action is None:
        raise GeminiServiceError("Gemini returned no usable content")
    return message_text, raw_action


def generate_gemini_content(
    *,
    api_key: str,
    model: str,
    system_prompt: str,
    user_content: str,
    tool_definition: dict,
    fallback_model: Optional[str] = DEFAULT_GEMINI_FALLBACK_MODEL,
) -> Tuple[str, Optional[dict]]:
    """Generate one concise answer and, optionally, one unexecuted tool call."""
    try:
        from google import genai
        from google.genai import errors, types
    except ImportError as exc:
        raise GeminiServiceError("The Google Gen AI SDK is not installed") from exc

    function = types.FunctionDeclaration(
        name=tool_definition["name"],
        description=tool_definition["description"],
        parameters_json_schema=tool_definition["input_schema"],
    )
    tool = types.Tool(function_declarations=[function])
    config = types.GenerateContentConfig(
        system_instruction=system_prompt,
        tools=[tool],
        automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
        temperature=0.2,
        max_output_tokens=512,
    )

    try:
        # The SDK otherwise retries up to five times with no request timeout.
        # Keep this below the extension's own timeout so callers receive a
        # useful error instead of waiting indefinitely.
        http_options = types.HttpOptions(
            timeout=GEMINI_TIMEOUT_MS,
            retry_options=types.HttpRetryOptions(attempts=1),
        )
        models = [model]
        if fallback_model and fallback_model != model:
            models.append(fallback_model)

        with genai.Client(api_key=api_key, http_options=http_options) as client:
            for index, candidate_model in enumerate(models):
                try:
                    response = client.models.generate_content(
                        model=candidate_model,
                        contents=user_content,
                        config=config,
                    )
                    break
                except errors.APIError as exc:
                    has_fallback = index + 1 < len(models)
                    if exc.code == 503 and has_fallback:
                        continue
                    raise
    except errors.APIError as exc:
        raise GeminiServiceError("Gemini API request failed") from exc
    except (httpx.NetworkError, httpx.TimeoutException, OSError) as exc:
        raise GeminiServiceError("Gemini could not be reached") from exc

    return extract_gemini_response(response, tool_definition["name"])
