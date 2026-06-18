from fastapi import APIRouter

from app.routers import claude_vision_check, comment_claims, comparison,  final_summary, marked_image

router = APIRouter()

router.include_router(comment_claims.router, prefix="/api/v1", tags=["comment-claims"])
router.include_router(comparison.router, prefix="/api/v1", tags=["comparison"])
router.include_router(claude_vision_check.router, prefix="/api/v1", tags=["claude-vision-check"])
router.include_router(final_summary.router, prefix="/api/v1", tags=["final-summary"])
router.include_router(marked_image.router, prefix="/api/v1", tags=["marked-image"])
