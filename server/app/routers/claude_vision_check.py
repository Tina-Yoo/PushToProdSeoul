from fastapi import APIRouter

from app.schemas.claude_vision_check import (
    ClaudeVisionCheckRequest,
    ClaudeVisionCheckResponse,
)
from app.services.claude_vision_check import run_claude_vision_check

router = APIRouter()


@router.post("/claude-vision-check-result", response_model=ClaudeVisionCheckResponse)
async def claude_vision_check_result(
    request: ClaudeVisionCheckRequest,
) -> ClaudeVisionCheckResponse:
    return await run_claude_vision_check(request)
