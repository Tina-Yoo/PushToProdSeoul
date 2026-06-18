from fastapi import APIRouter, HTTPException

from app.schemas.final_summary import FinalSummaryResponse
from app.schemas.marked_image import MarkedImageResponse
from app.services.image_marker import generate_marked_image

router = APIRouter()


@router.post("/damage-summary-marked-image", response_model=MarkedImageResponse)
def damage_summary_marked_image(request: FinalSummaryResponse) -> MarkedImageResponse:
    try:
        return generate_marked_image(request)
    except FileNotFoundError as e:
        raise HTTPException(status_code=500, detail=str(e))
