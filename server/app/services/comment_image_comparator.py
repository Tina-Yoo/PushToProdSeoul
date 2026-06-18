"""
Comment-Image Comparison service (API #2 — pre-vision targeting).

Primary:  Claude LLM for intelligent panel/damage matching with variant handling.
Fallback: Rule-based keyword matching when Claude is unavailable.
"""

import json
import logging
import re

from app.config import settings
from app.schemas.comparison import (
    ClaimInput,
    ClaimResult,
    ComparisonRequest,
    ComparisonResponse,
    EvidenceItem,
    ExteriorDamageEstimate,
    GeometryImage,
    ReviewReason,
    VisionHandoff,
    VisionTarget,
)
from app.services.comment_claim_extractor import normalize_damage_type, normalize_panel

logger = logging.getLogger(__name__)


# ── Claude return format template (module-level to avoid f-string escaping) ──

_CLAUDE_RETURN_FORMAT = """[
  {
    "claim_id": "string",
    "match_status": "matched|candidate_from_close_up_unknown|unmatched|needs_review",
    "match_confidence": 0.0,
    "matched_items": [
      {
        "image_index": 0,
        "image_name": "string",
        "vehicle_view_type": "string",
        "panel_name": "string",
        "damage_type": "string",
        "box_xywh": [0, 0, 0, 0],
        "requires_review_reasons": [],
        "reason": "Korean explanation"
      }
    ],
    "candidate_items": [
      {
        "image_index": 0,
        "image_name": "string",
        "damage_types": [],
        "matched_damage_types": [],
        "candidate_confidence": 0.0,
        "reason": "Korean explanation",
        "question_for_vision": "Korean question",
        "instruction": "Korean instruction"
      }
    ],
    "unmatched_reason": "string or null"
  }
]"""


# ── Utility helpers ───────────────────────────────────────────────────────────

def _build_vis_damage_map(estimate: ExteriorDamageEstimate) -> dict[str, str]:
    """Build {original_image_name: overlay_filename} from vis_damage list."""
    result: dict[str, str] = {}
    if not estimate.images or not estimate.images.vis_damage:
        return result
    for vis in estimate.images.vis_damage:
        marker = "_damage_"
        idx = vis.filename.find(marker)
        if idx >= 0:
            original = vis.filename[idx + len(marker):]
            result[original] = vis.filename
    return result


def _get_geometry_images(estimate: ExteriorDamageEstimate) -> list[GeometryImage]:
    if estimate.meta and estimate.meta.geometry_info:
        return estimate.meta.geometry_info.geometry_images
    return []


def _panels_match(claim_panel: str | None, geometry_panel: str) -> bool:
    """True if claim_panel reasonably refers to geometry_panel, handling name variants."""
    if not claim_panel:
        return False
    # Exact normalization match
    if normalize_panel(claim_panel) == geometry_panel:
        return True
    # Partial keyword match — allows generic names like "rear_door" to match
    # "Back-door-left" or "Back-door-right"
    cp = set(re.split(r"[-_\s]", claim_panel.lower()))
    gp = set(re.split(r"[-_\s]", geometry_panel.lower()))
    # Treat rear/back as synonyms
    cp = {t if t != "rear" else "back" for t in cp}
    gp = {t if t != "rear" else "back" for t in gp}
    # Remove side tokens so generic names still match sided panels
    sides = {"left", "right", "driver", "passenger"}
    cp_core = cp - sides
    gp_core = gp - sides
    return bool(cp_core) and cp_core.issubset(gp_core)


def _damages_match(claim_damage: str | None, geometry_damage: str) -> bool:
    if not claim_damage:
        return False
    return normalize_damage_type(claim_damage) == geometry_damage


# ── Rule-based matching ───────────────────────────────────────────────────────

def _match_claim_rule(
    claim: ClaimInput,
    geometry_images: list[GeometryImage],
    vis_damage_map: dict[str, str],
) -> ClaimResult:
    # ── Step 1: direct panel + damage match ──
    matched_evidence: list[EvidenceItem] = []

    for img_idx, geo_img in enumerate(geometry_images):
        for part in geo_img.geometry_damage_parts:
            if not _panels_match(claim.panel, part.name):
                continue
            for dmg in part.damages:
                if not _damages_match(claim.damage_type, dmg.damage_type):
                    continue
                matched_evidence.append(
                    EvidenceItem(
                        evidence_type="direct_panel_damage_match",
                        image_index=img_idx,
                        image_name=geo_img.image_name,
                        vehicle_view_type=geo_img.vehicle_view_type,
                        panel_name=part.name,
                        damage_type=dmg.damage_type,
                        damage_types=[],
                        matched_damage_types=[dmg.damage_type],
                        box_xywh=dmg.box_xywh,
                        requires_review_reasons=geo_img.requires_review.reasons,
                        reason=(
                            f"코멘트의 {claim.panel}/{claim.damage_type} claim과 "
                            f"exterior estimate 결과의 {part.name}/{dmg.damage_type}가 직접 일치합니다."
                        ),
                    )
                )

    if matched_evidence:
        return ClaimResult(
            claim_id=claim.claim_id,
            claim=claim,
            match_status="matched",
            match_confidence=0.98,
            matched_evidence=matched_evidence,
            candidate_evidence=[],
            unmatched_reason=None,
            vision_review_required=False,
            vision_targets=[],
        )

    # ── Step 2: close_up + Unknown candidates ──
    candidate_evidence: list[EvidenceItem] = []

    for img_idx, geo_img in enumerate(geometry_images):
        if geo_img.vehicle_view_type != "close_up":
            continue
        for part in geo_img.geometry_damage_parts:
            if part.name != "Unknown":
                continue
            all_dts = [d.damage_type for d in part.damages]
            matched_dts = [dt for dt in all_dts if _damages_match(claim.damage_type, dt)]
            candidate_evidence.append(
                EvidenceItem(
                    evidence_type="close_up_unknown_damage_candidate",
                    image_index=img_idx,
                    image_name=geo_img.image_name,
                    vehicle_view_type="close_up",
                    panel_name="Unknown",
                    damage_type=None,
                    damage_types=all_dts,
                    matched_damage_types=matched_dts,
                    box_xywh=None,
                    requires_review_reasons=geo_img.requires_review.reasons,
                    reason=(
                        "이 이미지는 close_up이며 panel이 Unknown으로 매칭 실패했습니다. "
                        "claim의 손상 타입과 직접 일치하지는 않지만, "
                        "미매칭 close-up 손상 후보이므로 Vision 검증 대상으로 전달합니다."
                    ),
                )
            )

    if candidate_evidence:
        confidence = 0.6
        vision_targets = [
            VisionTarget(
                target_type="verify_close_up_unknown_against_claim",
                claim_id=claim.claim_id,
                image_index=ev.image_index,
                image_name=ev.image_name,
                vehicle_view_type="close_up",
                panel_name="Unknown",
                overlay_image_ref=vis_damage_map.get(ev.image_name) if ev.image_name else None,
                candidate_confidence=confidence,
                question_for_vision=(
                    f"이 close-up Unknown 손상이 {claim.claim_id}의 "
                    f"{claim.raw_text} 내용과 일치하는지 확인해 주세요."
                ),
                instruction=(
                    "원본 이미지, damage overlay, 코멘트 claim, exterior estimate 결과를 함께 보고 "
                    f"이 손상이 {claim.claim_id}와 일치하는지 판단해 주세요."
                ),
            )
            for ev in candidate_evidence
        ]
        return ClaimResult(
            claim_id=claim.claim_id,
            claim=claim,
            match_status="candidate_from_close_up_unknown",
            match_confidence=confidence,
            matched_evidence=[],
            candidate_evidence=candidate_evidence,
            unmatched_reason="No direct panel/damage match found in wide-view geometry results.",
            vision_review_required=True,
            vision_targets=vision_targets,
        )

    return ClaimResult(
        claim_id=claim.claim_id,
        claim=claim,
        match_status="unmatched",
        match_confidence=0.0,
        matched_evidence=[],
        candidate_evidence=[],
        unmatched_reason="No panel/damage match and no close-up Unknown candidates found.",
        vision_review_required=False,
        vision_targets=[],
    )


def _build_response(estimate_id: str | None, claim_results: list[ClaimResult]) -> ComparisonResponse:
    all_matched = all(r.match_status == "matched" for r in claim_results)
    any_vision = any(r.vision_review_required for r in claim_results)
    some_matched = any(r.match_status == "matched" for r in claim_results)
    matched_count = sum(1 for r in claim_results if r.match_status == "matched")
    total = len(claim_results)

    if all_matched:
        overall_status = "matched"
        summary = f"All {total} claim(s) have direct matches."
    elif any_vision:
        overall_status = "needs_vision_review"
        summary = (
            f"{matched_count}/{total} claims have direct matches. "
            "Unmatched claims include close-up Unknown candidates and need Claude Vision review."
        )
    elif some_matched:
        overall_status = "partially_matched"
        summary = f"{matched_count}/{total} claims matched. Some claims could not be matched."
    else:
        overall_status = "unmatched"
        summary = "No claims matched. No close-up Unknown candidates found either."

    all_targets = [t for r in claim_results for t in r.vision_targets]

    return ComparisonResponse(
        estimate_id=estimate_id,
        comparison_stage="pre_vision_targeting",
        overall_status=overall_status,
        summary=summary,
        claim_results=claim_results,
        vision_handoff=VisionHandoff(
            required=any_vision,
            reason=(
                "Some claims were not directly matched, but close-up Unknown damage candidates exist."
                if any_vision
                else None
            ),
            targets=all_targets,
        ),
    )


def _rule_based_compare(request: ComparisonRequest) -> ComparisonResponse:
    geometry_images = _get_geometry_images(request.exterior_damage_estimate)
    vis_damage_map = _build_vis_damage_map(request.exterior_damage_estimate)

    claim_results = [
        _match_claim_rule(claim, geometry_images, vis_damage_map)
        for claim in request.claims
    ]
    return _build_response(request.estimate_id, claim_results)


# ── Claude LLM matching ───────────────────────────────────────────────────────

def _geometry_summary_for_llm(
    geometry_images: list[GeometryImage],
    vis_damage_map: dict[str, str],
) -> list[dict]:
    """Compact geometry summary — strips base64, keeps structure."""
    return [
        {
            "image_index": idx,
            "image_name": geo.image_name,
            "vehicle_view_type": geo.vehicle_view_type,
            "overlay_image_ref": vis_damage_map.get(geo.image_name),
            "requires_review_reasons": [
                {"source": r.source, "reason": r.reason}
                for r in geo.requires_review.reasons
            ],
            "parts": [
                {
                    "name": part.name,
                    "box_xywh": part.box_xywh,
                    "damages": [
                        {"damage_type": d.damage_type, "box_xywh": d.box_xywh}
                        for d in part.damages
                    ],
                }
                for part in geo.geometry_damage_parts
            ],
        }
        for idx, geo in enumerate(geometry_images)
    ]


async def _compare_with_claude(
    request: ComparisonRequest,
    preliminary: ComparisonResponse,
) -> ComparisonResponse:
    import anthropic as anthropic_sdk

    geometry_images = _get_geometry_images(request.exterior_damage_estimate)
    vis_damage_map = _build_vis_damage_map(request.exterior_damage_estimate)

    claims_data = [
        {
            "claim_id": c.claim_id,
            "side": c.side,
            "area": c.area,
            "panel": c.panel,
            "damage_type": c.damage_type,
            "severity": c.severity,
            "raw_text": c.raw_text,
        }
        for c in request.claims
    ]

    geometry_data = _geometry_summary_for_llm(geometry_images, vis_damage_map)

    hints = [
        {
            "claim_id": r.claim_id,
            "rule_match_status": r.match_status,
            "rule_match_confidence": r.match_confidence,
        }
        for r in preliminary.claim_results
    ]

    prompt = (
        "Compare structured vehicle damage claims against exterior damage estimate results.\n\n"
        "## Task\n"
        "For each claim, determine:\n"
        "1. Direct match — claim.panel matches a geometry part.name AND claim.damage_type matches a part damage\n"
        "   - Handle name variants: back_bumper=Back-bumper, rear_door=Back-door-left/right, "
        "deep_scratch=DeepScratched, dent=Crushed\n"
        "   - match_status='matched', match_confidence=0.90-0.99\n"
        "2. No direct match but close_up+Unknown candidate exists\n"
        "   - vehicle_view_type='close_up' AND part.name='Unknown'\n"
        "   - match_status='candidate_from_close_up_unknown', match_confidence=0.45-0.95\n"
        "   - Adjust confidence: 0.85-0.95 if damage types strongly compatible, "
        "0.65-0.84 if loosely related, 0.45-0.64 if weak candidate\n"
        "3. No match, no candidates: match_status='unmatched', match_confidence=0.0\n\n"
        "Write reason, question_for_vision, instruction in Korean.\n\n"
        "## Estimate ID\n"
        + str(request.estimate_id or "(none)")
        + "\n\n## Original Comment\n"
        + (request.comment or "(not provided)")
        + "\n\n## Claims\n"
        + json.dumps(claims_data, ensure_ascii=False, indent=2)
        + "\n\n## Geometry Images (no base64)\n"
        + json.dumps(geometry_data, ensure_ascii=False, indent=2)
        + "\n\n## Rule-Based Hints (use as reference)\n"
        + json.dumps(hints, ensure_ascii=False, indent=2)
        + "\n\n## Return JSON array only (no markdown, no explanation):\n"
        + _CLAUDE_RETURN_FORMAT
    )

    client = anthropic_sdk.AsyncAnthropic(api_key=settings.anthropic_api_key)
    response = await client.messages.create(
        model=settings.claude_model,
        max_tokens=4096,
        system=(
            "You are a vehicle damage comparison expert. "
            "Return ONLY valid JSON arrays with no markdown or explanation."
        ),
        messages=[{"role": "user", "content": prompt}],
    )

    raw = response.content[0].text.strip()
    raw = re.sub(r"^```(?:json)?\s*", "", raw)
    raw = re.sub(r"\s*```$", "", raw)

    claude_items: list[dict] = json.loads(raw)

    if len(claude_items) != len(request.claims):
        raise ValueError(
            f"Claude returned {len(claude_items)} results for {len(request.claims)} claims"
        )

    claim_map = {c.claim_id: c for c in request.claims}
    claim_results: list[ClaimResult] = []

    for item in claude_items:
        cid = item["claim_id"]
        original_claim = claim_map[cid]

        matched_evidence = [
            EvidenceItem(
                evidence_type="direct_panel_damage_match",
                image_index=m.get("image_index"),
                image_name=m.get("image_name"),
                vehicle_view_type=m.get("vehicle_view_type"),
                panel_name=m.get("panel_name"),
                damage_type=m.get("damage_type"),
                damage_types=[],
                matched_damage_types=[m["damage_type"]] if m.get("damage_type") else [],
                box_xywh=m.get("box_xywh"),
                requires_review_reasons=[
                    ReviewReason(**r) for r in (m.get("requires_review_reasons") or [])
                ],
                reason=m.get("reason", ""),
            )
            for m in (item.get("matched_items") or [])
        ]

        candidate_evidence: list[EvidenceItem] = []
        vision_targets: list[VisionTarget] = []

        for c in item.get("candidate_items") or []:
            img_name = c.get("image_name")
            ev = EvidenceItem(
                evidence_type="close_up_unknown_damage_candidate",
                image_index=c.get("image_index"),
                image_name=img_name,
                vehicle_view_type="close_up",
                panel_name="Unknown",
                damage_type=None,
                damage_types=c.get("damage_types") or [],
                matched_damage_types=c.get("matched_damage_types") or [],
                box_xywh=None,
                requires_review_reasons=[],
                reason=c.get("reason", ""),
            )
            candidate_evidence.append(ev)
            vision_targets.append(
                VisionTarget(
                    target_type="verify_close_up_unknown_against_claim",
                    claim_id=cid,
                    image_index=c.get("image_index"),
                    image_name=img_name,
                    vehicle_view_type="close_up",
                    panel_name="Unknown",
                    overlay_image_ref=vis_damage_map.get(img_name) if img_name else None,
                    candidate_confidence=c.get("candidate_confidence"),
                    question_for_vision=c.get("question_for_vision"),
                    instruction=c.get("instruction"),
                )
            )

        match_status = item.get("match_status", "unmatched")
        vision_review_required = match_status in ("candidate_from_close_up_unknown", "needs_review")

        claim_results.append(
            ClaimResult(
                claim_id=cid,
                claim=original_claim,
                match_status=match_status,
                match_confidence=float(item.get("match_confidence", 0.0)),
                matched_evidence=matched_evidence,
                candidate_evidence=candidate_evidence,
                unmatched_reason=item.get("unmatched_reason"),
                vision_review_required=vision_review_required,
                vision_targets=vision_targets,
            )
        )

    return _build_response(request.estimate_id, claim_results)


# ── Public entry point ────────────────────────────────────────────────────────

async def compare_comment_image(request: ComparisonRequest) -> ComparisonResponse:
    preliminary = _rule_based_compare(request)

    if not settings.anthropic_api_key:
        return preliminary

    try:
        return await _compare_with_claude(request, preliminary)
    except Exception as exc:
        logger.warning("Claude comparison failed, using rule-based fallback: %s", exc)
        return preliminary
