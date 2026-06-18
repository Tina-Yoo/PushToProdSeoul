from fastapi import APIRouter

from app.schemas.comment_claims import CommentClaimRequest, CommentClaimResponse
from app.services.comment_claim_extractor import extract_structured_comment_claims

router = APIRouter()


@router.post("/extract-structured-comment-claims", response_model=CommentClaimResponse)
async def extract_comment_claims(request: CommentClaimRequest) -> CommentClaimResponse:
    return await extract_structured_comment_claims(request.estimate_id, request.comment)
