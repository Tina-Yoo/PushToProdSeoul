from pydantic import BaseModel, ConfigDict, Field

from app.schemas.comparison import (
    ComparisonResponse,
    ExteriorDamageEstimate,
    RequiresReview,
)


# ── Original vehicle image input ──────────────────────────────────────────────

class OriginalImage(BaseModel):
    model_config = ConfigDict(extra="ignore")
    image_name: str
    content_type: str | None = None
    data: str | None = None  # base64 — forwarded to Claude Vision as evidence/context


# ── Request ───────────────────────────────────────────────────────────────────

class ClaudeVisionCheckRequest(BaseModel):
    estimate_id: str | None = None
    comment: str | None = None
    original_images: list[OriginalImage] = []
    comparison_result: ComparisonResponse | None = None
    exterior_damage_estimate: ExteriorDamageEstimate


# ── Claude verdict (per panel) ────────────────────────────────────────────────

class DamageTypeVerdict(BaseModel):
    damage_type: str
    agree: bool
    confidence: float = Field(ge=0.0, le=1.0)
    reasoning: str


class PerImageRead(BaseModel):
    image_name: str
    agree: bool
    confidence: float = Field(ge=0.0, le=1.0)
    reasoning: str


class ClaudeVerdict(BaseModel):
    checked: bool = False
    overall_agree: bool | None = None
    overall_confidence: float | None = None
    overall_reasoning: str | None = None
    damage_type_verdicts: list[DamageTypeVerdict] = []
    per_image: list[PerImageRead] = []
    # Original image names mapped back to estimate damage overlay filenames
    # (falls back to original image name when no overlay exists).
    evidence_images: list[str] = []
    error: str | None = None


# ── Response ──────────────────────────────────────────────────────────────────

class DamagedPanelResult(BaseModel):
    name: str
    damages: list[str] = []
    repair_types: list[str] = []
    requires_review: RequiresReview = RequiresReview()
    claude_verdict: ClaudeVerdict


class VisionStats(BaseModel):
    total_panels: int
    checked_panels: int
    agreed_panels: int
    disagreed_panels: int


class DamageAssessmentImage(BaseModel):
    image_name: str
    vehicle_view_type: str | None = None
    overlay_image_ref: str | None = None
    panels: list[str] = []


class GeometryImagesAssessment(BaseModel):
    damage_assessment: list[DamageAssessmentImage] = []


class ClaudeVisionCheckResponse(BaseModel):
    estimate_id: str | None
    overall_status: str
    vision_performed: bool
    stats: VisionStats
    damaged_panels: list[DamagedPanelResult]
    geometry_images: GeometryImagesAssessment
