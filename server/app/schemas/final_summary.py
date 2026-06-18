from typing import Any

from pydantic import BaseModel, ConfigDict, Field


# ── Request ───────────────────────────────────────────────────────────────────

class VehicleInfoInput(BaseModel):
    model_config = ConfigDict(extra="ignore")
    vehicle_name: str | None = None
    vehicle_no: str | None = None


class FinalSummaryRequest(BaseModel):
    estimate_id: str | None = None
    document_no: str | None = None
    issue_date: str | None = None
    vehicle_category: str | None = None
    vehicle_info: VehicleInfoInput | None = None
    claude_vision_check_result: dict[str, Any] | None = None


# ── Response ──────────────────────────────────────────────────────────────────

class DocumentInfo(BaseModel):
    document_no: str | None = None
    issue_date: str | None = None


class VehicleInfoOutput(BaseModel):
    vehicle_no: str | None = None
    vehicle_name: str | None = None
    vehicle_category: str | None = None


class AnalysisResult(BaseModel):
    overall_status: str | None = None
    headline: str | None = None
    summary: str | None = None
    total_damage_count: int = 0
    estimate_damage_count: int = 0
    review_damage_count: int = 0
    image_count: int = 0
    comment_count: int = 0
    overall_confidence: float | None = None
    model: str | None = None


class EvidenceImage(BaseModel):
    image_name: str


class DamageVerdict(BaseModel):
    damage_type: str
    agree: bool
    confidence: float | None = None
    reasoning: str | None = None


class DamageSection(BaseModel):
    section_no: int
    damage_item_id: str
    panel: str | None = None
    panel_label: str | None = None
    damage_types: list[str] = []
    damage_type_labels: list[str] = []
    repair_types: list[str] = []
    repair_type_labels: list[str] = []
    confidence: float | None = None
    confidence_percent: int | None = None
    reasoning: str | None = None
    comment_claim_id: str | None = None
    evidence_images: list[EvidenceImage] = []
    damage_confidences: dict[str, float] = {}
    damage_verdicts: list[DamageVerdict] = []
    requires_review: bool = False
    requires_review_reasons: list[str] = []
    included_in_estimate: bool = True


class EstimateRow(BaseModel):
    no: int
    damage_item_id: str
    damage_part: str | None = None
    repair_content: str
    quantity: int = 1
    unit_price: int | None = None
    supply_amount: int | None = None
    confidence: float | None = None
    evidence_images: list[EvidenceImage] = []
    pricing_status: str  # "priced" | "unpriced"


class EstimateTotals(BaseModel):
    currency: str = "KRW"
    supply_amount: int
    vat_rate: float = 0.1
    vat_amount: int
    total_amount: int


class EstimateSheet(BaseModel):
    rows: list[EstimateRow]
    totals: EstimateTotals


class FinalSummaryResponse(BaseModel):
    estimate_id: str | None = None
    status: str
    message: str
    document_info: DocumentInfo
    vehicle_info: VehicleInfoOutput
    analysis_result: AnalysisResult | None = None
    damage_sections: list[DamageSection] = []
    estimate_sheet: EstimateSheet | None = None
    pending_inputs: list[str] = []
