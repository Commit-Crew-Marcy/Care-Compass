"""CareCompass endpoint for the PolicyEngine US state program catalog."""
from fastapi import APIRouter, BackgroundTasks, status

from models.schemas import (
    Message,
    PolicyEngineEligibilityRequest,
    PolicyEngineEligibilityResponse,
    PolicyEngineProgramCatalog,
    StateCode,
)
from services.policyengine import (
    calculate_program_eligibility,
    get_program_catalog,
    warm_policyengine_model,
)

router = APIRouter(prefix="/api/policyengine", tags=["policyengine"])


@router.get(
    "/programs/{state}",
    response_model=PolicyEngineProgramCatalog,
    response_model_by_alias=True,
)
def policyengine_programs(state: StateCode):
    return get_program_catalog(state)


@router.post(
    "/eligibility",
    response_model=PolicyEngineEligibilityResponse,
    response_model_by_alias=True,
)
def policyengine_eligibility(request: PolicyEngineEligibilityRequest):
    return calculate_program_eligibility(request)


@router.post(
    "/warmup",
    response_model=Message,
    status_code=status.HTTP_202_ACCEPTED,
)
def policyengine_warmup(background_tasks: BackgroundTasks):
    background_tasks.add_task(warm_policyengine_model)
    return {"message": "PolicyEngine warm-up started."}
