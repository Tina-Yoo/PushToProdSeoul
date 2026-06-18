from typing import Any

from pydantic import BaseModel, ConfigDict, Field


# ── Claim input (from API #1 output) ─────────────────────────────────────────

class ClaimInput(BaseModel):
    claim_id: str
    side: str | None = None
    area: str | None = None
    panel: str | None = None
    damage_type: str | None = None
    severity: str | None = None
    raw_text: str
    confidence: float = Field(ge=0.0, le=1.0)


# ── Exterior Damage Estimate input ────────────────────────────────────────────

class ReviewReason(BaseModel):
    model_config = ConfigDict(extra="ignore")
    source: str
    reason: str


class RequiresReview(BaseModel):
    model_config = ConfigDict(extra="ignore")
    reasons: list[ReviewReason] = []


class GeometryDamageItem(BaseModel):
    model_config = ConfigDict(extra="ignore")
    damage_type: str
    severity: str | None = None
    box_xywh: list[float] | None = None
    polygons: Any = None


class GeometryDamagePart(BaseModel):
    model_config = ConfigDict(extra="ignore")
    name: str
    damages: list[GeometryDamageItem] = []
    box_xywh: list[float] | None = None
    polygons: Any = None


class GeometryImage(BaseModel):
    model_config = ConfigDict(extra="ignore")
    image_name: str
    image_size: list[int] | None = None
    vehicle_view_type: str
    geometry_damage_parts: list[GeometryDamagePart] = []
    requires_review: RequiresReview = RequiresReview()


class GeometryInfo(BaseModel):
    model_config = ConfigDict(extra="ignore")
    geometry_images: list[GeometryImage] = []
    match_list: Any = None


class DamagedPanel(BaseModel):
    model_config = ConfigDict(extra="ignore")
    name: str
    damages: list[str] = []
    repair_types: list[str] = []
    requires_review: RequiresReview = RequiresReview()


class VehicleInfo(BaseModel):
    model_config = ConfigDict(extra="ignore")
    vehicle_category: str | None = None
    vehicle_no: str | None = None


class EstimateMeta(BaseModel):
    model_config = ConfigDict(extra="ignore")
    total_images: int | None = None
    vehicle_info: VehicleInfo | None = None
    damaged_panels: list[DamagedPanel] | None = None
    geometry_info: GeometryInfo | None = None
    error_msg: str | None = None
    return_detail_visualization: bool | None = None


class VisImage(BaseModel):
    model_config = ConfigDict(extra="ignore")
    filename: str
    content_type: str | None = None
    data: str | None = None  # base64 — accepted but never forwarded to LLM


class EstimateImages(BaseModel):
    model_config = ConfigDict(extra="ignore")
    vis_damage: list[VisImage] | None = None


class ExteriorDamageEstimate(BaseModel):
    model_config = ConfigDict(extra="ignore")
    request_id: str | None = None
    meta: EstimateMeta | None = None
    images: EstimateImages | None = None


# ── Request ───────────────────────────────────────────────────────────────────

class ComparisonRequest(BaseModel):
    estimate_id: str | None = None
    comment: str | None = None
    claims: list[ClaimInput]
    exterior_damage_estimate: ExteriorDamageEstimate


# ── Response ──────────────────────────────────────────────────────────────────

class EvidenceItem(BaseModel):
    evidence_type: str
    image_index: int | None = None
    image_name: str | None = None
    vehicle_view_type: str | None = None
    panel_name: str | None = None
    damage_type: str | None = None
    damage_types: list[str] = []
    matched_damage_types: list[str] = []
    box_xywh: list[float] | None = None
    requires_review_reasons: list[ReviewReason] = []
    reason: str


class VisionTarget(BaseModel):
    target_type: str
    claim_id: str
    image_index: int | None = None
    image_name: str | None = None
    vehicle_view_type: str | None = None
    panel_name: str | None = None
    overlay_image_ref: str | None = None
    candidate_confidence: float | None = None
    question_for_vision: str | None = None
    instruction: str | None = None


class ClaimResult(BaseModel):
    claim_id: str
    claim: ClaimInput
    match_status: str
    match_confidence: float
    matched_evidence: list[EvidenceItem] = []
    candidate_evidence: list[EvidenceItem] = []
    unmatched_reason: str | None = None
    vision_review_required: bool
    vision_targets: list[VisionTarget] = []


class VisionHandoff(BaseModel):
    required: bool
    reason: str | None = None
    targets: list[VisionTarget] = []


class ComparisonResponse(BaseModel):
    estimate_id: str | None
    comparison_stage: str = "pre_vision_targeting"
    overall_status: str
    summary: str
    claim_results: list[ClaimResult]
    vision_handoff: VisionHandoff
