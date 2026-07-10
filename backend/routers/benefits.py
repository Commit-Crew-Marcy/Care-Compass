"""GET /api/benefits and GET /api/benefits/:id"""
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from db.database import get_db
from db.models import Benefit
from models.schemas import BenefitDetail, BenefitOut

router = APIRouter(prefix="/api/benefits", tags=["benefits"])


def to_out(b: Benefit) -> dict:
    return {
        "id": b.benefit_id,
        "name": b.name,
        "description": b.description,
        "eligibility_summary": b.eligibility_summary,
        "apply_url": b.apply_url,
        "program_type": b.program_type,
        "federal": b.is_federal,
    }


@router.get("", response_model=List[BenefitOut], response_model_by_alias=True)
def list_benefits(
    program_type: Optional[str] = None,
    federal: Optional[bool] = None,
    db: Session = Depends(get_db),
):
    """All benefits, with the optional ?programType= and ?federal= filters
    from the API contract (FastAPI reads them as program_type/federal)."""
    query = db.query(Benefit)
    if program_type is not None:
        query = query.filter(Benefit.program_type == program_type)
    if federal is not None:
        query = query.filter(Benefit.is_federal == federal)
    return [to_out(b) for b in query.all()]


@router.get("/{benefit_id}", response_model=BenefitDetail, response_model_by_alias=True)
def get_benefit(benefit_id: int, db: Session = Depends(get_db)):
    benefit = db.query(Benefit).filter(Benefit.benefit_id == benefit_id).first()
    if benefit is None:
        raise HTTPException(status_code=404, detail="Benefit not found")
    data = to_out(benefit)
    data["requirements"] = [
        {"description": r.description, "display_order": r.display_order}
        for r in benefit.requirements
    ]
    return data
