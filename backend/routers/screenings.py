"""Saved screenings — the user-generated resource with full CRUD.

POST   /api/screenings      — Create a saved screening
GET    /api/screenings      — Read all of the logged-in user's screenings
GET    /api/screenings/:id  — Read one
PUT    /api/screenings/:id  — Update (rename or change answers; re-runs matching)
DELETE /api/screenings/:id  — Delete

Every route requires authentication, and users can only ever see or touch
their own rows (the ownership check in get_owned_screening).
"""
import json
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from core.security import get_current_user
from db.database import get_db
from db.models import Benefit, Screening, User
from engine.rules import match_benefits
from models.schemas import IntakeForm, Message, ScreeningCreate, ScreeningOut, ScreeningUpdate

router = APIRouter(prefix="/api/screenings", tags=["screenings"])


def to_out(s: Screening) -> dict:
    return {
        "id": s.screening_id,
        "name": s.name,
        "age": s.age,
        "income": s.income,
        "state": s.state,
        "household_size": s.household_size,
        "disability_status": s.disability_status,
        "disability_details": json.loads(s.disability_details or "[]"),
        "disability_other_text": s.disability_other_text,
        "veteran_status": s.veteran_status,
        "is_pregnant": s.is_pregnant,
        "has_children_under_18": s.has_children_under_18,
        "has_children_under_5": s.has_children_under_5,
        "immigration_status": s.immigration_status,
        "years_in_us": s.years_in_us,
        "insurance_status": s.insurance_status,
        "current_coverage": json.loads(s.current_coverage or "[]"),
        "matched_benefits": json.loads(s.matched_benefits or "[]"),
    }


def get_owned_screening(screening_id: int, user: User, db: Session) -> Screening:
    s = db.query(Screening).filter(Screening.screening_id == screening_id).first()
    if s is None or s.user_id != user.user_id:
        # 404 for someone else's row too, so ids can't be probed
        raise HTTPException(status_code=404, detail="Screening not found")
    return s


@router.post("", response_model=ScreeningOut, response_model_by_alias=True, status_code=201)
def create_screening(
    body: ScreeningCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    s = Screening(
        user_id=user.user_id,
        name=body.name,
        age=body.age,
        income=body.income,
        state=body.state.upper(),
        household_size=body.household_size,
        disability_status=body.disability_status,
        disability_details=json.dumps(body.disability_details),
        disability_other_text=body.disability_other_text,
        veteran_status=body.veteran_status,
        is_pregnant=body.is_pregnant,
        has_children_under_18=body.has_children_under_18,
        has_children_under_5=body.has_children_under_5,
        immigration_status=body.immigration_status,
        years_in_us=body.years_in_us,
        insurance_status=body.insurance_status,
        current_coverage=json.dumps(body.current_coverage),
        matched_benefits=json.dumps(body.matched_benefits),
    )
    db.add(s)
    db.commit()
    db.refresh(s)
    return to_out(s)


@router.get("", response_model=List[ScreeningOut], response_model_by_alias=True)
def list_screenings(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.query(Screening).filter(Screening.user_id == user.user_id).all()
    return [to_out(s) for s in rows]


@router.get("/{screening_id}", response_model=ScreeningOut, response_model_by_alias=True)
def get_screening(
    screening_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return to_out(get_owned_screening(screening_id, user, db))


@router.put("/{screening_id}", response_model=ScreeningOut, response_model_by_alias=True)
def update_screening(
    screening_id: int,
    body: ScreeningUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    s = get_owned_screening(screening_id, user, db)

    changes = body.model_dump(exclude_unset=True)
    answers_changed = False
    for field, value in changes.items():
        if field == "current_coverage":
            s.current_coverage = json.dumps(value)
            answers_changed = True
        elif field == "disability_details":
            # Descriptive only — store as JSON but do NOT re-run eligibility matching
            s.disability_details = json.dumps(value)
        elif field == "disability_other_text":
            # Descriptive only — store as plain text, no re-matching needed
            s.disability_other_text = value
        elif field == "state":
            s.state = value.upper()
            answers_changed = True
        elif field == "name":
            s.name = value
        else:
            setattr(s, field, value)
            answers_changed = True

    # If any eligibility answer changed, re-run the matching engine so the
    # saved results stay in sync with the saved answers.
    if answers_changed:
        intake = IntakeForm(
            age=s.age,
            income=s.income,
            state=s.state,
            household_size=s.household_size,
            disability_status=s.disability_status,
            veteran_status=s.veteran_status,
            is_pregnant=s.is_pregnant,
            has_children_under_18=s.has_children_under_18,
            has_children_under_5=s.has_children_under_5,
            immigration_status=s.immigration_status,
            years_in_us=s.years_in_us,
            insurance_status=s.insurance_status,
            current_coverage=json.loads(s.current_coverage or "[]"),
        )
        benefits = db.query(Benefit).all()
        s.matched_benefits = json.dumps(match_benefits(benefits, intake))

    db.commit()
    db.refresh(s)
    return to_out(s)


@router.delete("/{screening_id}", response_model=Message, response_model_by_alias=True)
def delete_screening(
    screening_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    s = get_owned_screening(screening_id, user, db)
    db.delete(s)
    db.commit()
    return {"message": "Screening deleted"}
