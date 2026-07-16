"""Read one current program from the NYC Open Data directory."""
from fastapi import APIRouter, HTTPException

from models.schemas import BenefitDetail
from services.nyc_benefits import get_nyc_program

router = APIRouter(prefix="/api/nyc-benefits", tags=["nyc-benefits"])


@router.get("/{program_id}", response_model=BenefitDetail, response_model_by_alias=True)
def get_program(program_id: str):
    program = get_nyc_program(program_id)
    if program is None:
        raise HTTPException(status_code=404, detail="NYC program not found")
    return program
