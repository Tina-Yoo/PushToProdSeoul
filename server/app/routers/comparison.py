from fastapi import APIRouter

from app.schemas.comparison import ComparisonRequest, ComparisonResponse
from app.services.comment_image_comparator import compare_comment_image

router = APIRouter()


@router.post("/comment-image-comparison-result", response_model=ComparisonResponse)
async def comment_image_comparison(request: ComparisonRequest) -> ComparisonResponse:
    return await compare_comment_image(request)
