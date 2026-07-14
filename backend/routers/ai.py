"""POST /api/ai/chat — proxies user questions to the Anthropic API.

The system prompt is built SERVER-SIDE with the user's matched benefits,
and raw user input is only ever placed in the user message — never
concatenated into the system prompt. The API key lives in the
ANTHROPIC_API_KEY environment variable and never reaches the frontend.
"""
import json
import os

from fastapi import APIRouter, HTTPException

from models.schemas import ChatRequest, ChatResponse

router = APIRouter(prefix="/api/ai", tags=["ai"])

SYSTEM_PROMPT = (
    "You are the CareCompass benefits assistant. You explain U.S. government "
    "benefit programs (healthcare, food, family, and money programs) in short, "
    "plain language for people of every age and background, including older "
    "adults, families, and people who just arrived in the United States. If "
    "the user writes in a language other than English, answer in that "
    "language. Keep answers under 120 words, avoid jargon, and never invent "
    "eligibility decisions; the matching engine already decided those. Be "
    "reassuring and practical about immigration questions: name the general "
    "rule (like the 5-year wait for green card holders, or that WIC and "
    "Emergency Medicaid are open regardless of status) and point people to "
    "the official agency for their exact case. You are an informational "
    "guide, not legal or medical advice; remind users to confirm details "
    "with the official agency when it matters.\n\n"
    "The user's matched benefits from the eligibility engine are:\n{context}"
)


@router.post("/chat", response_model=ChatResponse, response_model_by_alias=True)
def chat(body: ChatRequest):
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=503,
            detail="AI service unavailable: ANTHROPIC_API_KEY is not configured.",
        )

    try:
        import anthropic
    except ImportError:
        raise HTTPException(status_code=503, detail="AI service unavailable: anthropic package not installed.")

    context = json.dumps(body.matched_benefits, indent=2) if body.matched_benefits else "None provided."

    try:
        client = anthropic.Anthropic(api_key=api_key)
        response = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=1024,
            system=SYSTEM_PROMPT.format(context=context),
            messages=[{"role": "user", "content": body.question}],
        )
        answer = "".join(block.text for block in response.content if block.type == "text")
        return {"answer": answer}
    except anthropic.APIError as exc:
        raise HTTPException(status_code=503, detail=f"AI service unavailable: {exc}")
