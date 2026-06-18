"""
Final Summary Builder — API #4.

Pure data transformation: no LLM calls.
Converts Vision check result + vehicle_category → estimate document data.
"""

from app.schemas.final_summary import (
    AnalysisResult,
    DamageSection,
    DamageVerdict,
    DocumentInfo,
    EstimateRow,
    EstimateSheet,
    EstimateTotals,
    EvidenceImage,
    FinalSummaryRequest,
    FinalSummaryResponse,
    VehicleInfoOutput,
)


# ── Reference tables ──────────────────────────────────────────────────────────

ALLOWED_VEHICLE_CATEGORIES: set[str] = {
    "경차", "소형", "준중형", "중형", "준대형",
    "특대형", "중형SUV", "대형SUV", "RV/승합", "수입차",
}

# vehicle_category → {cost_key: amount}
PRICING_TABLE: dict[str, dict[str, int]] = {
    "경차":    {"PanelRepairCost": 110_000, "PolishingCost":  70_000, "InteriorCleaningCost": 100_000},
    "소형":    {"PanelRepairCost": 115_000, "PolishingCost":  70_000, "InteriorCleaningCost": 100_000},
    "준중형":  {"PanelRepairCost": 125_000, "PolishingCost":  90_000, "InteriorCleaningCost": 100_000},
    "중형":    {"PanelRepairCost": 135_000, "PolishingCost": 100_000, "InteriorCleaningCost": 100_000},
    "준대형":  {"PanelRepairCost": 150_000, "PolishingCost": 115_000, "InteriorCleaningCost": 150_000},
    "특대형":  {"PanelRepairCost": 174_000, "PolishingCost": 125_000, "InteriorCleaningCost": 150_000},
    "중형SUV": {"PanelRepairCost": 164_000, "PolishingCost": 125_000, "InteriorCleaningCost": 150_000},
    "대형SUV": {"PanelRepairCost": 174_000, "PolishingCost": 125_000, "InteriorCleaningCost": 150_000},
    "RV/승합": {"PanelRepairCost": 164_000, "PolishingCost": 125_000, "InteriorCleaningCost": 150_000},
    "수입차":  {"PanelRepairCost": 220_000, "PolishingCost": 160_000, "InteriorCleaningCost": 200_000},
}

# repair_type → which cost key to apply
REPAIR_TYPE_COST_KEY: dict[str, str] = {
    "Polishing":        "PolishingCost",
    "Repainting":       "PanelRepairCost",
    "BodyRepair":       "PanelRepairCost",
    "InteriorCleaning": "InteriorCleaningCost",
}

PANEL_LABEL_MAP: dict[str, str] = {
    "Back-bumper":          "뒷범퍼",
    "Back-door-left":       "운전석 뒷문",
    "Back-door-right":      "조수석 뒷문",
    "Back-wheel-left":      "운전석 뒷휠",
    "Back-wheel-right":     "조수석 뒷휠",
    "Back-window-left":     "운전석 뒤창문",
    "Back-window-right":    "조수석 뒤창문",
    "Back-windshield":      "뒷유리",
    "Fender-left":          "운전석 펜더",
    "Fender-right":         "조수석 펜더",
    "Front-bumper":         "앞범퍼",
    "Front-door-left":      "운전석 앞문",
    "Front-door-right":     "조수석 앞문",
    "Front-wheel-left":     "운전석 앞휠",
    "Front-wheel-right":    "조수석 앞휠",
    "Front-window-left":    "운전석 앞창문",
    "Front-window-right":   "조수석 앞창문",
    "Grille":               "그릴",
    "Headlight-left":       "운전석 헤드라이트",
    "Headlight-right":      "조수석 헤드라이트",
    "Hood":                 "후드",
    "License-plate":        "번호판",
    "Mirror-left":          "운전석 미러",
    "Mirror-right":         "조수석 미러",
    "Quarter-panel-left":   "운전석 쿼터패널",
    "Quarter-panel-right":  "조수석 쿼터패널",
    "Rocker-panel-left":    "운전석 로커패널",
    "Rocker-panel-right":   "조수석 로커패널",
    "Roof":                 "루프",
    "Tail-light-left":      "운전석 테일라이트",
    "Tail-light-right":     "조수석 테일라이트",
    "Trunk":                "트렁크",
    "Windshield":           "앞유리",
}

DAMAGE_TYPE_LABEL_MAP: dict[str, str] = {
    "Chip":           "칩",
    "Stain":          "오염",
    "MudSplash":      "진흙",
    "Swirl":          "스월",
    "MicroScratched": "미세 스크래치",
    "Scratched":      "스크래치",
    "TouchupPaint":   "터치업 도색",
    "DeepScratched":  "깊은 스크래치",
    "RustSurface":    "표면 녹",
    "RustDeep":       "심층 녹",
    "Crack":          "균열",
    "TireDamage":     "타이어 손상",
    "Crushed":        "찌그러짐",
    "Separated":      "분리",
    "Breakage":       "파손",
    "Marker":         "마커",
}

REPAIR_TYPE_LABEL_MAP: dict[str, str] = {
    "Polishing":        "광택",
    "Repainting":       "도색",
    "BodyRepair":       "판금",
    "InteriorCleaning": "실내 청소",
}


# ── Helpers ───────────────────────────────────────────────────────────────────

def _panel_label(panel: str | None) -> str | None:
    if not panel:
        return None
    return PANEL_LABEL_MAP.get(panel, panel)


def _damage_labels(damage_types: list[str]) -> list[str]:
    return [DAMAGE_TYPE_LABEL_MAP.get(dt, dt) for dt in damage_types]


def _repair_labels(repair_types: list[str]) -> list[str]:
    return [REPAIR_TYPE_LABEL_MAP.get(rt, rt) for rt in repair_types]


def _repair_content(damage_type_labels: list[str], repair_type_labels: list[str]) -> str:
    parts = []
    if damage_type_labels:
        parts.append(", ".join(damage_type_labels))
    if repair_type_labels:
        parts.append(", ".join(repair_type_labels))
    return " ".join(parts)


def _is_included_in_estimate(panel_data: dict) -> bool:
    verdict = panel_data.get("claude_verdict")
    if not verdict:
        return True
    # actual format uses "overall_agree"; spec format uses "agree"
    agree = verdict.get("overall_agree")
    if agree is None:
        agree = verdict.get("agree")
    if agree is None:
        return True
    return bool(agree)


def _unit_price(repair_types: list[str], vehicle_category: str) -> int | None:
    prices = PRICING_TABLE.get(vehicle_category)
    if not prices:
        return None
    total = 0
    for rt in repair_types:
        cost_key = REPAIR_TYPE_COST_KEY.get(rt)
        if cost_key and cost_key in prices:
            total += prices[cost_key]
    return total if total > 0 else None


def _requires_review_reasons(panel_data: dict) -> list[str]:
    # actual format: requires_review = {"reasons": [{source, reason}, ...]}
    # spec format:   requires_review_reasons = [{source, reason}, ...]
    rr = panel_data.get("requires_review")
    if isinstance(rr, dict):
        raw = rr.get("reasons") or []
    else:
        raw = panel_data.get("requires_review_reasons") or []

    result = []
    for r in raw:
        if isinstance(r, dict):
            source = r.get("source") or ""
            reason = r.get("reason") or ""
            result.append(f"{source}: {reason}" if source else reason)
        else:
            result.append(str(r))
    return result


# ── Core builders ─────────────────────────────────────────────────────────────

def _build_damage_section(section_no: int, panel_data: dict) -> DamageSection:
    panel = panel_data.get("name")
    damage_types: list[str] = panel_data.get("damages") or []
    repair_types: list[str] = panel_data.get("repair_types") or []
    verdict: dict = panel_data.get("claude_verdict") or {}

    dt_labels = _damage_labels(damage_types)
    rt_labels = _repair_labels(repair_types)

    # actual format: overall_confidence / overall_reasoning
    # spec format:   confidence / reasoning
    confidence = verdict.get("overall_confidence") if verdict.get("overall_confidence") is not None else verdict.get("confidence")
    reasoning = verdict.get("overall_reasoning") or verdict.get("reasoning")
    confidence_percent = round(confidence * 100) if confidence is not None else None

    # evidence_images: list of strings (actual) or list of dicts (spec)
    raw_evidence = verdict.get("evidence_images") or []
    evidence_images = [
        EvidenceImage(image_name=img) if isinstance(img, str)
        else EvidenceImage(image_name=img.get("image_name", ""))
        for img in raw_evidence
    ]

    # damage_verdicts: "damage_type_verdicts" (actual) or "damage_verdicts" (spec)
    raw_verdicts = verdict.get("damage_type_verdicts") or verdict.get("damage_verdicts") or []
    damage_verdicts = [
        DamageVerdict(
            damage_type=dv.get("damage_type", ""),
            agree=bool(dv.get("agree", True)),
            confidence=dv.get("confidence"),
            reasoning=dv.get("reasoning"),
        )
        for dv in raw_verdicts
    ]

    # damage_confidences: compute from verdicts if not directly provided
    damage_confidences: dict = verdict.get("damage_confidences") or {}
    if not damage_confidences and raw_verdicts:
        damage_confidences = {
            dv["damage_type"]: dv["confidence"]
            for dv in raw_verdicts
            if dv.get("damage_type") and dv.get("confidence") is not None
        }

    requires_review_reasons = _requires_review_reasons(panel_data)

    return DamageSection(
        section_no=section_no,
        damage_item_id=f"damage_{section_no:03d}",
        panel=panel,
        panel_label=_panel_label(panel),
        damage_types=damage_types,
        damage_type_labels=dt_labels,
        repair_types=repair_types,
        repair_type_labels=rt_labels,
        confidence=confidence,
        confidence_percent=confidence_percent,
        reasoning=reasoning,
        comment_claim_id=verdict.get("comment_corroboration"),
        evidence_images=evidence_images,
        damage_confidences=damage_confidences,
        damage_verdicts=damage_verdicts,
        requires_review=bool(requires_review_reasons),
        requires_review_reasons=requires_review_reasons,
        included_in_estimate=_is_included_in_estimate(panel_data),
    )


def _build_estimate_sheet(
    damage_sections: list[DamageSection],
    vehicle_category: str | None,
) -> EstimateSheet:
    rows: list[EstimateRow] = []
    row_no = 1

    for section in damage_sections:
        if not section.included_in_estimate:
            continue

        price = _unit_price(section.repair_types, vehicle_category or "") if vehicle_category else None
        repair_content = _repair_content(section.damage_type_labels, section.repair_type_labels)

        rows.append(
            EstimateRow(
                no=row_no,
                damage_item_id=section.damage_item_id,
                damage_part=section.panel_label,
                repair_content=repair_content,
                quantity=1,
                unit_price=price,
                supply_amount=price,
                confidence=section.confidence,
                evidence_images=section.evidence_images,
                pricing_status="priced" if price is not None else "unpriced",
            )
        )
        row_no += 1

    supply_amount = sum(r.supply_amount for r in rows if r.supply_amount is not None)
    vat_amount = round(supply_amount * 0.1)
    total_amount = supply_amount + vat_amount

    return EstimateSheet(
        rows=rows,
        totals=EstimateTotals(
            currency="KRW",
            supply_amount=supply_amount,
            vat_rate=0.1,
            vat_amount=vat_amount,
            total_amount=total_amount,
        ),
    )


# ── Public entry point ────────────────────────────────────────────────────────

def build_final_summary(request: FinalSummaryRequest) -> FinalSummaryResponse:
    pending_inputs: list[str] = []

    # Validate vehicle_category
    if not request.vehicle_category or request.vehicle_category not in ALLOWED_VEHICLE_CATEGORIES:
        pending_inputs.append("valid_vehicle_category")

    # Validate vision result structure
    vision_raw: dict = {}
    if not request.claude_vision_check_result:
        pending_inputs.append("claude_vision_check_result")
    else:
        vision_raw = request.claude_vision_check_result

    base_document_info = DocumentInfo(
        document_no=request.document_no,
        issue_date=request.issue_date,
    )
    base_vehicle_info = VehicleInfoOutput(
        vehicle_category=request.vehicle_category,
        vehicle_name=request.vehicle_info.vehicle_name if request.vehicle_info else None,
        vehicle_no=request.vehicle_info.vehicle_no if request.vehicle_info else None,
    )

    if pending_inputs:
        return FinalSummaryResponse(
            estimate_id=request.estimate_id,
            status="partial",
            message="Required input fields are missing.",
            document_info=base_document_info,
            vehicle_info=base_vehicle_info,
            pending_inputs=pending_inputs,
        )

    # ── Detect format and extract fields ─────────────────────────────────────
    # spec format:   {status, data: {estimate_id, meta: {damaged_panels, ...}}}
    # actual format: {estimate_id, overall_status, damaged_panels, geometry_images, ...}
    if "data" in vision_raw:
        inner: dict = vision_raw.get("data") or {}
        meta: dict = inner.get("meta") or {}
        vision_estimate_id: str | None = inner.get("estimate_id")
    else:
        inner = vision_raw
        meta = vision_raw
        vision_estimate_id = vision_raw.get("estimate_id")

    damaged_panels: list[dict] = meta.get("damaged_panels") or []

    # geometry images: spec path vs actual path
    geometry_images: list = (meta.get("geometry_info") or {}).get("geometry_images") or []
    if not geometry_images:
        geometry_images = (vision_raw.get("geometry_images") or {}).get("damage_assessment") or []

    comment_claims: list = meta.get("comment_claims") or []

    # vehicle_info: request overrides vision result
    vision_vehicle: dict = meta.get("vehicle_info") or {}
    req_vi = request.vehicle_info
    vehicle_no = (req_vi.vehicle_no if req_vi else None) or vision_vehicle.get("vehicle_no")
    vehicle_name = (req_vi.vehicle_name if req_vi else None) or vision_vehicle.get("vehicle_name")

    # ── Build damage sections ─────────────────────────────────────────────────
    damage_sections = [
        _build_damage_section(idx + 1, panel_data)
        for idx, panel_data in enumerate(damaged_panels)
    ]

    # ── Compute analysis_result ───────────────────────────────────────────────
    estimate_damage_count = sum(1 for s in damage_sections if s.included_in_estimate)
    review_damage_count = sum(1 for s in damage_sections if s.requires_review)
    confidences = [s.confidence for s in damage_sections if s.confidence is not None]
    overall_confidence = round(sum(confidences) / len(confidences), 4) if confidences else None

    analysis_result = AnalysisResult(
        overall_status=meta.get("overall_status"),
        headline=meta.get("headline"),
        summary=meta.get("summary"),
        total_damage_count=len(damage_sections),
        estimate_damage_count=estimate_damage_count,
        review_damage_count=review_damage_count,
        image_count=len(geometry_images),
        comment_count=len(comment_claims),
        overall_confidence=overall_confidence,
        model=meta.get("model"),
    )

    # ── Build estimate sheet ──────────────────────────────────────────────────
    estimate_sheet = _build_estimate_sheet(damage_sections, request.vehicle_category)

    estimate_id = request.estimate_id or vision_estimate_id

    return FinalSummaryResponse(
        estimate_id=estimate_id,
        status="ready",
        message="Final estimate document data is ready.",
        document_info=base_document_info,
        vehicle_info=VehicleInfoOutput(
            vehicle_no=vehicle_no,
            vehicle_name=vehicle_name,
            vehicle_category=request.vehicle_category,
        ),
        analysis_result=analysis_result,
        damage_sections=damage_sections,
        estimate_sheet=estimate_sheet,
        pending_inputs=[],
    )
