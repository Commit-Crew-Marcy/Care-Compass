"""POST /api/eligibility/check — the core MVP endpoint."""
from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from db.database import get_db
from db.models import Benefit
from engine.rules import match_benefits
from models.schemas import IntakeForm, MatchedBenefit

router = APIRouter(prefix="/api/eligibility", tags=["eligibility"])


@router.post("/check", response_model=List[MatchedBenefit], response_model_by_alias=True)
def check_eligibility(intake: IntakeForm, db: Session = Depends(get_db)):
    """Run the intake form against every benefit's rules and return matches.

    Pydantic validates the body automatically — missing or malformed fields
    return the 422 documented in the API contract without extra code here.
    """
    benefits = db.query(Benefit).all()
    return match_benefits(benefits, intake)
