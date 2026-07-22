"""Small, testable Gemini text/function-calling adapter.

The browser extension sends an already-filtered semantic page summary. This
module sends that text to Gemini and returns only model text plus one optional
function-call payload. It never executes the requested browser action.
"""
import logging
from typing import Optional, Tuple

logger = logging.getLogger(__name__)

DEFAULT_GEMINI_MODEL = "gemini-3.5-flash"


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
        # Thinking models spend part of max_output_tokens on hidden reasoning
        # before the visible reply — with a short reply budget that can
        # consume the whole cap and return empty text. These replies are
        # short, low-stakes explanations, not tasks that need deliberation.
        thinking_config=types.ThinkingConfig(thinking_budget=0),
    )

    try:
        with genai.Client(api_key=api_key) as client:
            response = client.models.generate_content(
                model=model,
                contents=user_content,
                config=config,
            )
    except errors.APIError as exc:
        logger.error(f"Gemini call failed: {exc}")
        raise GeminiServiceError("Gemini API request failed") from exc
    except OSError as exc:
        logger.error(f"Gemini call failed: {exc}")
        raise GeminiServiceError("Gemini could not be reached") from exc

    return extract_gemini_response(response, tool_definition["name"])
