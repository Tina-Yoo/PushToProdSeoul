from pydantic import BaseModel, Field


class CommentClaimRequest(BaseModel):
    estimate_id: str | None = None
    comment: str


class ClaimItem(BaseModel):
    claim_id: str
    side: str | None
    area: str | None
    panel: str | None
    damage_type: str | None
    severity: str | None
    raw_text: str
    confidence: float = Field(ge=0.0, le=1.0)


class CommentClaimResponse(BaseModel):
    estimate_id: str | None
    comment: str
    extractor: str
    model: str | None
    llm_error: str | None
    claims: list[ClaimItem]
