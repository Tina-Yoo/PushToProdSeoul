from fastapi import APIRouter

from app.routers import comment_claims, comparison

router = APIRouter()

router.include_router(comment_claims.router, prefix="/api/v1", tags=["comment-claims"])
router.include_router(comparison.router, prefix="/api/v1", tags=["comparison"])

# 추후 추가:
# from app.routers import marked_image, final_summary, claude_vision_check
# router.include_router(claude_vision_check.router, prefix="/api/v1", tags=["claude-vision-check"])
# router.include_router(marked_image.router, prefix="/api/v1", tags=["marked-image"])
# router.include_router(final_summary.router, prefix="/api/v1", tags=["final-summary"])
