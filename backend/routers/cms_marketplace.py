"""CareCompass proxy for current CMS Marketplace plan estimates."""
from fastapi import APIRouter, HTTPException

from models.schemas import CMSMarketplaceSearchRequest, CMSMarketplaceSearchResponse
from services.cms_marketplace import (
    CMSMarketplaceConfigurationError,
    CMSMarketplaceError,
    CMSMarketplaceLocationError,
    search_marketplace_plans,
)


router = APIRouter(prefix="/api/cms/marketplace", tags=["cms-marketplace"])


@router.post(
    "/search",
    response_model=CMSMarketplaceSearchResponse,
    response_model_by_alias=True,
)
def marketplace_search(request: CMSMarketplaceSearchRequest):
    try:
        return search_marketplace_plans(request)
    except CMSMarketplaceLocationError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except CMSMarketplaceConfigurationError as exc:
        raise HTTPException(
            status_code=503,
            detail="CMS Marketplace plan estimates are not configured.",
        ) from exc
    except CMSMarketplaceError as exc:
        raise HTTPException(
            status_code=503,
            detail="CMS Marketplace plan estimates are temporarily unavailable.",
        ) from exc
