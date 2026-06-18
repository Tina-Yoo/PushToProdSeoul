"""
Claude Vision Check service (API #3 — per-panel Vision audit).

For each damaged panel in the exterior damage estimate, this calls Claude Vision
once to judge whether the detected damage types are real and located on that panel.

The prompt/input/output contract is snapshotted in
`claude_vision_check_prompt.md` — keep this file in sync with that document.

If `ANTHROPIC_API_KEY` is missing or a Claude call fails, the panel falls back to
a "not checked" verdict so the endpoint always returns a safe, well-formed result.
"""

import json
import logging
import re

from app.config import settings
from app.schemas.claude_vision_check import (
    ClaudeVerdict,
    ClaudeVisionCheckRequest,
    ClaudeVisionCheckResponse,
    DamageAssessmentImage,
    DamagedPanelResult,
    DamageTypeVerdict,
    GeometryImagesAssessment,
    OriginalImage,
    PerImageRead,
    VisionStats,
)
from app.schemas.comparison import (
    DamagedPanel,
    ExteriorDamageEstimate,
    GeometryImage,
    VisImage,
)

logger = logging.getLogger(__name__)


# ── Prompt building (verbatim from claude_vision_check_prompt.md) ──────────────

def build_system_prompt() -> str:
    return (
        "You audit an automated vehicle exterior-damage estimate. For ONE panel and "
        "its DETECTED DAMAGE TYPES, decide whether each detection is real and located "
        "on that panel, and how confident you are.\n"
        "- You get EVIDENCE images (close-ups / wide views with damage marked) plus "
        "some FAR VIEW context images. Judge ONLY the named panel.\n"
        "- The panel name is given and is one of: Quarter-panel, Front-wheel, "
        "Back-window, Trunk, Front-door, Rocker-panel, Grille, Windshield, "
        "Front-window, Back-door, Headlight, Back-wheel, Back-windshield, Hood, "
        "Fender, Tail-light, License-plate, Front-bumper, Back-bumper, Mirror, Roof "
        "(optionally with -left/-right). Do not relocate the damage to another panel; "
        "judge agreement for THIS panel.\n"
        "- For EACH damage type return agree (is this damage type really present on "
        "this panel?) and a 0..1 confidence.\n"
        "- Also return a per-image read: for each EVIDENCE image (by image_name), does "
        "it show this panel's damage, with a 0..1 confidence. Do NOT return entries "
        "for FAR VIEW context.\n"
        "- A receptionist comment may corroborate; treat it as a hint, not proof.\n"
        "- All reasoning must be concise Korean.\n"
        "- Return ONLY valid JSON, no markdown:\n"
        '{"overall_agree": bool, "overall_confidence": number, "overall_reasoning": '
        'string, "damage_type_verdicts": [{"damage_type": string, "agree": bool, '
        '"confidence": number, "reasoning": string}], "per_image": [{"image_name": '
        'string, "agree": bool, "confidence": number, "reasoning": string}]}'
    )


def build_user_text(
    panel_name: str,
    damage_types: list[str],
    comment_hint: str | None,
) -> str:
    lines = [
        f"PANEL: {panel_name}",
        "DETECTED DAMAGE TYPES: " + ", ".join(damage_types),
    ]
    if comment_hint:
        lines.append(f"RECEPTIONIST COMMENT (corroboration hint): {comment_hint}")
    lines.append(
        "TASK: For this panel, judge each damage type (agree + confidence) and give a "
        "per-image read."
    )
    return "\n".join(lines)


# ── Image resolution helpers ──────────────────────────────────────────────────

def _get_geometry_images(estimate: ExteriorDamageEstimate) -> list[GeometryImage]:
    if estimate.meta and estimate.meta.geometry_info:
        return estimate.meta.geometry_info.geometry_images
    return []


def _build_overlay_map(estimate: ExteriorDamageEstimate) -> dict[str, VisImage]:
    """Map {original_image_name: overlay VisImage} from vis_damage filenames."""
    result: dict[str, VisImage] = {}
    if not estimate.images or not estimate.images.vis_damage:
        return result
    marker = "_damage_"
    for vis in estimate.images.vis_damage:
        idx = vis.filename.find(marker)
        if idx >= 0:
            original = vis.filename[idx + len(marker):]
            result[original] = vis
    return result


def _strip_data_uri(data: str) -> str:
    if data.startswith("data:"):
        comma = data.find(",")
        if comma >= 0:
            return data[comma + 1:]
    return data


def _resolve_image_bytes(
    image_name: str,
    overlay_map: dict[str, VisImage],
    original_map: dict[str, OriginalImage],
    prefer_overlay: bool,
) -> tuple[str, str] | None:
    """Return (base64_data, media_type) for an image, overlay-first when requested."""
    overlay = overlay_map.get(image_name)
    original = original_map.get(image_name)

    candidates = []
    if prefer_overlay:
        candidates = [overlay, original]
    else:
        candidates = [original, overlay]

    for cand in candidates:
        if cand is not None and cand.data:
            media = cand.content_type or "image/jpeg"
            return _strip_data_uri(cand.data), media
    return None


def _panel_name_eq(a: str, b: str) -> bool:
    return a.strip().lower() == b.strip().lower()


def _image_has_panel(geo: GeometryImage, panel_name: str) -> bool:
    return any(_panel_name_eq(p.name, panel_name) for p in geo.geometry_damage_parts)


# ── Anthropic Vision call ─────────────────────────────────────────────────────

# Cap far-view context images per panel to keep the Vision payload bounded.
_MAX_FAR_VIEW = 4


async def ask_panel_vision(
    client,
    panel_name: str,
    damage_types: list[str],
    comment_hint: str | None,
    evidence: list[dict],
    far_views: list[dict],
) -> dict:
    """Call Claude Vision for one panel and return the parsed JSON verdict."""
    content: list[dict] = []

    for ev in evidence:
        content.append({"type": "text", "text": f"EVIDENCE image_name={ev['image_name']}"})
        content.append(
            {
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": ev["media_type"],
                    "data": ev["data"],
                },
            }
        )

    for fv in far_views:
        content.append({"type": "text", "text": f"FAR VIEW (context only) {fv['label']}"})
        content.append(
            {
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": fv["media_type"],
                    "data": fv["data"],
                },
            }
        )

    content.append({"type": "text", "text": build_user_text(panel_name, damage_types, comment_hint)})

    response = await client.messages.create(
        model=settings.claude_model,
        max_tokens=2000,
        system=build_system_prompt(),
        messages=[{"role": "user", "content": content}],
    )

    raw = response.content[0].text.strip()
    raw = re.sub(r"^```(?:json)?\s*", "", raw)
    raw = re.sub(r"\s*```$", "", raw)
    return json.loads(raw)


def _parse_verdict(data: dict, evidence_images: list[str]) -> ClaudeVerdict:
    return ClaudeVerdict(
        checked=True,
        overall_agree=data.get("overall_agree"),
        overall_confidence=data.get("overall_confidence"),
        overall_reasoning=data.get("overall_reasoning"),
        damage_type_verdicts=[
            DamageTypeVerdict(
                damage_type=v.get("damage_type", ""),
                agree=bool(v.get("agree", False)),
                confidence=float(v.get("confidence", 0.0)),
                reasoning=v.get("reasoning", ""),
            )
            for v in (data.get("damage_type_verdicts") or [])
        ],
        per_image=[
            PerImageRead(
                image_name=p.get("image_name", ""),
                agree=bool(p.get("agree", False)),
                confidence=float(p.get("confidence", 0.0)),
                reasoning=p.get("reasoning", ""),
            )
            for p in (data.get("per_image") or [])
        ],
        evidence_images=evidence_images,
    )


# ── Per-panel orchestration ───────────────────────────────────────────────────

async def _check_panel(
    client,
    panel: DamagedPanel,
    geometry_images: list[GeometryImage],
    overlay_map: dict[str, VisImage],
    original_map: dict[str, OriginalImage],
    comment_hint: str | None,
) -> DamagedPanelResult:
    # EVIDENCE: geometry images that contain this panel. Bytes prefer overlay.
    evidence: list[dict] = []
    evidence_original_names: list[str] = []
    evidence_image_names: set[str] = set()

    for geo in geometry_images:
        if not _image_has_panel(geo, panel.name):
            continue
        evidence_image_names.add(geo.image_name)
        resolved = _resolve_image_bytes(geo.image_name, overlay_map, original_map, prefer_overlay=True)
        if resolved is None:
            continue
        data, media = resolved
        evidence_original_names.append(geo.image_name)
        evidence.append({"image_name": geo.image_name, "data": data, "media_type": media})

    # FAR VIEW: wide context shots not used as evidence for this panel.
    far_views: list[dict] = []
    for geo in geometry_images:
        if geo.image_name in evidence_image_names:
            continue
        if geo.vehicle_view_type == "close_up":
            continue
        resolved = _resolve_image_bytes(geo.image_name, overlay_map, original_map, prefer_overlay=False)
        if resolved is None:
            continue
        data, media = resolved
        overlay = overlay_map.get(geo.image_name)
        label = overlay.filename if overlay else geo.image_name
        far_views.append({"label": label, "data": data, "media_type": media})
        if len(far_views) >= _MAX_FAR_VIEW:
            break

    # Public evidence_images: original names mapped back to overlay filenames.
    evidence_images = [
        overlay_map[name].filename if name in overlay_map else name
        for name in evidence_original_names
    ]

    base = DamagedPanelResult(
        name=panel.name,
        damages=panel.damages,
        repair_types=panel.repair_types,
        requires_review=panel.requires_review,
        claude_verdict=ClaudeVerdict(checked=False, evidence_images=evidence_images),
    )

    if not evidence:
        base.claude_verdict.error = "No resolvable evidence image bytes for this panel."
        return base

    try:
        data = await ask_panel_vision(
            client,
            panel_name=panel.name,
            damage_types=panel.damages,
            comment_hint=comment_hint,
            evidence=evidence,
            far_views=far_views,
        )
        base.claude_verdict = _parse_verdict(data, evidence_images)
    except Exception as exc:
        logger.warning("Claude Vision failed for panel %s: %s", panel.name, exc)
        base.claude_verdict.error = f"Claude Vision call failed: {exc}"

    return base


def _build_damage_assessment(
    geometry_images: list[GeometryImage],
    overlay_map: dict[str, VisImage],
) -> GeometryImagesAssessment:
    return GeometryImagesAssessment(
        damage_assessment=[
            DamageAssessmentImage(
                image_name=geo.image_name,
                vehicle_view_type=geo.vehicle_view_type,
                overlay_image_ref=(
                    overlay_map[geo.image_name].filename
                    if geo.image_name in overlay_map
                    else None
                ),
                panels=[p.name for p in geo.geometry_damage_parts],
            )
            for geo in geometry_images
        ]
    )


def _overall_status(vision_performed: bool, stats: VisionStats) -> str:
    if not vision_performed or stats.checked_panels == 0:
        return "vision_not_performed"
    if stats.disagreed_panels == 0:
        return "verified"
    if stats.agreed_panels == 0:
        return "disputed"
    return "needs_review"


# ── Public entry point ────────────────────────────────────────────────────────

async def run_claude_vision_check(
    request: ClaudeVisionCheckRequest,
) -> ClaudeVisionCheckResponse:
    estimate = request.exterior_damage_estimate
    geometry_images = _get_geometry_images(estimate)
    overlay_map = _build_overlay_map(estimate)
    original_map = {img.image_name: img for img in request.original_images}

    damaged_panels = (estimate.meta.damaged_panels if estimate.meta else None) or []
    comment_hint = request.comment or None

    vision_performed = bool(settings.anthropic_api_key)

    panel_results: list[DamagedPanelResult] = []

    if vision_performed:
        import anthropic as anthropic_sdk

        client = anthropic_sdk.AsyncAnthropic(api_key=settings.anthropic_api_key)
        for panel in damaged_panels:
            panel_results.append(
                await _check_panel(
                    client,
                    panel,
                    geometry_images,
                    overlay_map,
                    original_map,
                    comment_hint,
                )
            )
    else:
        # No API key — return safe "not checked" verdicts with overlay mapping.
        for panel in damaged_panels:
            evidence_images = [
                overlay_map[geo.image_name].filename
                if geo.image_name in overlay_map
                else geo.image_name
                for geo in geometry_images
                if _image_has_panel(geo, panel.name)
            ]
            panel_results.append(
                DamagedPanelResult(
                    name=panel.name,
                    damages=panel.damages,
                    repair_types=panel.repair_types,
                    requires_review=panel.requires_review,
                    claude_verdict=ClaudeVerdict(
                        checked=False,
                        evidence_images=evidence_images,
                        error="ANTHROPIC_API_KEY not configured; Vision check skipped.",
                    ),
                )
            )

    checked = sum(1 for r in panel_results if r.claude_verdict.checked)
    agreed = sum(
        1 for r in panel_results if r.claude_verdict.checked and r.claude_verdict.overall_agree
    )
    disagreed = sum(
        1
        for r in panel_results
        if r.claude_verdict.checked and r.claude_verdict.overall_agree is False
    )
    stats = VisionStats(
        total_panels=len(panel_results),
        checked_panels=checked,
        agreed_panels=agreed,
        disagreed_panels=disagreed,
    )

    return ClaudeVisionCheckResponse(
        estimate_id=request.estimate_id,
        overall_status=_overall_status(vision_performed, stats),
        vision_performed=vision_performed,
        stats=stats,
        damaged_panels=panel_results,
        geometry_images=_build_damage_assessment(geometry_images, overlay_map),
    )
