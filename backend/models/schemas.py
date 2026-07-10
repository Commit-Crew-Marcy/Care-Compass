"""Pydantic schemas. Incoming/outgoing JSON is camelCase; Python is snake_case.

Pydantic handles the mapping via alias generators, which is what the
"the FastAPI layer maps between them" line in the spec refers to.
"""
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class CamelModel(BaseModel):
    """Base model: accepts and emits camelCase, stores snake_case internally."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, from_attributes=True)


class IntakeForm(CamelModel):
    """Body of POST /api/eligibility/check. Matches the 5-step questionnaire."""

    age: int = Field(..., ge=0, le=130)
    income: int = Field(..., ge=0)
    state: str = Field(..., min_length=2, max_length=2)
    household_size: int = Field(default=1, ge=1)
    disability_status: bool = False
    veteran_status: bool = False
    insurance_status: bool = False
    current_coverage: List[str] = Field(default_factory=list)


class RequirementOut(CamelModel):
    description: str
    display_order: int


class BenefitCard(CamelModel):
    """Shape of a benefit in list responses (results page cards)."""

    id: int
    name: str
    description: str
    eligibility_summary: str
    apply_url: Optional[str] = None
    program_type: str


class BenefitOut(BenefitCard):
    """Full benefit for GET /api/benefits and /api/benefits/:id."""

    federal: bool


class BenefitDetail(BenefitOut):
    requirements: List[RequirementOut] = Field(default_factory=list)


class MatchedBenefit(BenefitCard):
    """A matched program plus the plain-language reason it matched."""

    match_reason: str


class ChatRequest(CamelModel):
    question: str = Field(..., min_length=1)
    matched_benefits: List[dict] = Field(default_factory=list)


class ChatResponse(CamelModel):
    answer: str


class Message(CamelModel):
    message: str
