import json
import re

from app.config import settings
from app.schemas.comment_claims import ClaimItem, CommentClaimResponse


# ── Estimate type data ────────────────────────────────────────────────────────

_ESTIMATE_TYPES: dict | None = None


def _get_estimate_types() -> dict:
    global _ESTIMATE_TYPES
    if _ESTIMATE_TYPES is None:
        path = settings.resources_dir / "estimate_type.json"
        with open(path, encoding="utf-8") as f:
            _ESTIMATE_TYPES = json.load(f)
    return _ESTIMATE_TYPES


# ── Code normalization ────────────────────────────────────────────────────────

# Extra aliases for common Claude/user variants → canonical code
_PANEL_EXTRA_ALIASES: dict[str, str] = {
    "rear-bumper": "Back-bumper",
    "rearbumper": "Back-bumper",
    "rear bumper": "Back-bumper",
    "back bumper": "Back-bumper",
    "rear-windshield": "Back-windshield",
    "rear windshield": "Back-windshield",
    "front windshield": "Windshield",
    "front-windshield": "Windshield",
    "rear-door-left": "Back-door-left",
    "rear-door-right": "Back-door-right",
    "rear-wheel-left": "Back-wheel-left",
    "rear-wheel-right": "Back-wheel-right",
    "rear-window-left": "Back-window-left",
    "rear-window-right": "Back-window-right",
}

_DAMAGE_EXTRA_ALIASES: dict[str, str] = {
    "deep-scratch": "DeepScratched",
    "deep-scratched": "DeepScratched",
    "deepscratch": "DeepScratched",
    "deep_scratch": "DeepScratched",
    "deep scratch": "DeepScratched",
    "scratch": "Scratched",
    "scratched": "Scratched",
    "micro-scratch": "MicroScratched",
    "micro-scratched": "MicroScratched",
    "micro scratch": "MicroScratched",
    "rust": "RustSurface",
    "rust-surface": "RustSurface",
    "rust surface": "RustSurface",
    "rust-deep": "RustDeep",
    "deep-rust": "RustDeep",
    "dent": "Crushed",
    "crushed": "Crushed",
    "broken": "Breakage",
    "crack": "Crack",
    "cracked": "Crack",
    "separated": "Separated",
    "separation": "Separated",
    "chip": "Chip",
    "chipped": "Chip",
    "stain": "Stain",
    "stained": "Stain",
    "marker": "Marker",
    "swirl": "Swirl",
    "swirl-mark": "Swirl",
    "touchup": "TouchupPaint",
    "touchup-paint": "TouchupPaint",
    "touch-up": "TouchupPaint",
    "touch up paint": "TouchupPaint",
    "mud": "MudSplash",
    "mud-splash": "MudSplash",
    "tire": "TireDamage",
    "tire-damage": "TireDamage",
}


def _build_lookup(codes: list[str], extra: dict[str, str]) -> dict[str, str]:
    lookup: dict[str, str] = {}
    for code in codes:
        lookup[code] = code
        norm = code.lower().replace(" ", "-").replace("_", "-")
        lookup[norm] = code
        # back ↔ rear variant
        if "back" in norm:
            lookup[norm.replace("back", "rear")] = code
        elif "rear" in norm:
            lookup[norm.replace("rear", "back")] = code
    lookup.update(extra)
    return lookup


_PANEL_LOOKUP: dict[str, str] | None = None
_DAMAGE_LOOKUP: dict[str, str] | None = None


def _panel_lookup() -> dict[str, str]:
    global _PANEL_LOOKUP
    if _PANEL_LOOKUP is None:
        _PANEL_LOOKUP = _build_lookup(_get_estimate_types()["panels"], _PANEL_EXTRA_ALIASES)
    return _PANEL_LOOKUP


def _damage_lookup() -> dict[str, str]:
    global _DAMAGE_LOOKUP
    if _DAMAGE_LOOKUP is None:
        _DAMAGE_LOOKUP = _build_lookup(_get_estimate_types()["damage_types"], _DAMAGE_EXTRA_ALIASES)
    return _DAMAGE_LOOKUP


def normalize_panel(value: str | None) -> str | None:
    if not value:
        return None
    lu = _panel_lookup()
    if value in lu:
        return lu[value]
    norm = value.lower().replace(" ", "-").replace("_", "-")
    return lu.get(norm)


def normalize_damage_type(value: str | None) -> str | None:
    if not value:
        return None
    lu = _damage_lookup()
    if value in lu:
        return lu[value]
    norm = value.lower().replace(" ", "-").replace("_", "-")
    return lu.get(norm)


# ── Claude LLM extraction ─────────────────────────────────────────────────────

async def _extract_with_claude(comment: str) -> tuple[list[ClaimItem], str]:
    import anthropic as anthropic_sdk

    types = _get_estimate_types()
    panels_str = ", ".join(types["panels"])
    damage_types_str = ", ".join(types["damage_types"])

    prompt = (
        f"Extract vehicle damage claims from the comment below.\n\n"
        f"Allowed panel codes (use ONLY these or null):\n{panels_str}\n\n"
        f"Allowed damage_type codes (use ONLY these or null):\n{damage_types_str}\n\n"
        f"Allowed side values: driver, passenger, left, right, front, rear, or null\n"
        f"Allowed area values: front, rear, side, roof, underbody, or null\n"
        f"Allowed severity values: low, moderate, high, or null\n\n"
        f"Comment: {comment}\n\n"
        f"Return a JSON array only. Each element must have exactly:\n"
        f'- claim_id: "claim_001", "claim_002", ...\n'
        f"- side: string from allowed side values or null\n"
        f"- area: string from allowed area values or null\n"
        f"- panel: string from allowed panel codes or null\n"
        f"- damage_type: string from allowed damage_type codes or null\n"
        f"- severity: string from allowed severity values or null\n"
        f"- raw_text: relevant excerpt from the original comment\n"
        f"- confidence: float 0.0-1.0"
    )

    client = anthropic_sdk.AsyncAnthropic(api_key=settings.anthropic_api_key)
    response = await client.messages.create(
        model=settings.claude_model,
        max_tokens=1024,
        system="You are a vehicle damage claim extractor. Return ONLY valid JSON arrays with no markdown or explanation.",
        messages=[{"role": "user", "content": prompt}],
    )

    raw = response.content[0].text.strip()
    # Strip markdown code block if present
    raw = re.sub(r"^```(?:json)?\s*", "", raw)
    raw = re.sub(r"\s*```$", "", raw)

    raw_claims: list[dict] = json.loads(raw)
    claims = []
    for i, item in enumerate(raw_claims):
        claims.append(
            ClaimItem(
                claim_id=item.get("claim_id") or f"claim_{i + 1:03d}",
                side=item.get("side"),
                area=item.get("area"),
                panel=normalize_panel(item.get("panel")),
                damage_type=normalize_damage_type(item.get("damage_type")),
                severity=item.get("severity"),
                raw_text=item.get("raw_text", ""),
                confidence=float(item.get("confidence", 0.9)),
            )
        )

    return claims, settings.claude_model


# ── Rule-based fallback ───────────────────────────────────────────────────────

_SIDE_PATTERNS: list[tuple[str, str]] = [
    (r"운전석|드라이버", "driver"),
    (r"조수석", "passenger"),
    (r"왼쪽|좌측|\bleft\b", "left"),
    (r"오른쪽|우측|\bright\b", "right"),
]

_AREA_PATTERNS: list[tuple[str, str]] = [
    (r"앞|전면|전방|\bfront\b", "front"),
    (r"뒤|뒷|후면|후방|\brear\b|\bback\b", "rear"),
    (r"옆|측면|\bside\b", "side"),
    (r"지붕|루프|\broof\b", "roof"),
    (r"하부|underbody", "underbody"),
]

# (pattern, damage_type, severity)
_DAMAGE_PATTERNS: list[tuple[str, str, str | None]] = [
    (r"깊은\s*스크래치|딥\s*스크래치|deep\s*scratch", "DeepScratched", "high"),
    (r"마이크로\s*스크래치|미세\s*스크래치|micro\s*scratch", "MicroScratched", "low"),
    (r"스크래치|긁힘|긁혀|\bscratch\b", "Scratched", "moderate"),
    (r"찌그러짐|찌그러|찌부러|함몰|\bdent\b|\bcrush", "Crushed", None),
    (r"균열|크랙|\bcrack\b", "Crack", None),
    (r"파손|부서짐|깨짐|\bbreak", "Breakage", None),
    (r"깊은\s*녹|심한\s*녹|deep\s*rust", "RustDeep", "high"),
    (r"녹슬|부식|\brust\b", "RustSurface", None),
    (r"오염|얼룩|\bstain\b", "Stain", None),
    (r"\bchip\b|칩|돌빠짐", "Chip", None),
    (r"분리|떨어짐|\bseparat", "Separated", None),
    (r"\bmarker\b|마커", "Marker", None),
    (r"도장|터치업|touch.?up", "TouchupPaint", None),
    (r"\bswirl\b|스월", "Swirl", None),
    (r"진흙|\bmud\b", "MudSplash", None),
    (r"타이어\s*손상|tire\s*damage", "TireDamage", None),
]

# (pattern, part_type, area_override)
_PART_PATTERNS: list[tuple[str, str, str | None]] = [
    (r"앞범퍼|전면\s*범퍼|front.?bumper", "bumper", "front"),
    (r"뒤범퍼|뒷범퍼|후범퍼|후면\s*범퍼|rear.?bumper|back.?bumper", "bumper", "rear"),
    (r"범퍼|\bbumper\b", "bumper", None),
    (r"앞\s*문|앞\s*도어|front.?door", "door", "front"),
    (r"뒷\s*문|뒷\s*도어|rear.?door|back.?door", "door", "rear"),
    (r"도어|\b문\b|\bdoor\b", "door", None),
    (r"앞\s*유리|전면\s*유리|\bwindshield\b|front.?glass", "windshield", "front"),
    (r"뒷\s*유리|후면\s*유리|rear.?glass|back.?glass|back.?windshield", "windshield", "rear"),
    (r"사이드\s*유리|side.?window|\bwindow\b|유리", "window", None),
    (r"휠|바퀴|\bwheel\b", "wheel", None),
    (r"후드|본네트|보닛|\bhood\b|\bbonnet\b", "hood", None),
    (r"트렁크|\btrunk\b", "trunk", None),
    (r"펜더|\bfender\b", "fender", None),
    (r"그릴|\bgrille\b|\bgrill\b", "grille", None),
    (r"헤드라이트|전조등|\bheadlight\b", "headlight", None),
    (r"테일라이트|후미등|tail.?light", "taillight", None),
    (r"미러|사이드\s*미러|\bmirror\b", "mirror", None),
    (r"루프|지붕|\broof\b", "roof", None),
    (r"쿼터\s*패널|quarter.?panel", "quarter-panel", None),
    (r"로커\s*패널|사이드실|rocker.?panel", "rocker-panel", None),
    (r"번호판|license.?plate", "license-plate", None),
]


def _resolve_panel(side: str | None, area: str | None, part: str | None) -> str | None:
    if not part:
        return None

    # driver → left, passenger → right for panel suffix
    side_lr: str | None = {"driver": "left", "passenger": "right", "left": "left", "right": "right"}.get(side or "")

    if part == "bumper":
        return "Front-bumper" if area == "front" else "Back-bumper" if area == "rear" else None

    if part == "door":
        prefix = "Front" if area == "front" else "Back" if area == "rear" else None
        if prefix and side_lr:
            return f"{prefix}-door-{side_lr}"
        return None

    if part == "wheel":
        prefix = "Front" if area == "front" else "Back" if area == "rear" else None
        if prefix and side_lr:
            return f"{prefix}-wheel-{side_lr}"
        return None

    if part == "window":
        prefix = "Front" if area == "front" else "Back" if area == "rear" else None
        if prefix and side_lr:
            return f"{prefix}-window-{side_lr}"
        return None

    if part == "windshield":
        return "Back-windshield" if area == "rear" else "Windshield"

    if part == "fender":
        return f"Fender-{side_lr}" if side_lr else None

    if part == "headlight":
        return f"Headlight-{side_lr}" if side_lr else None

    if part == "taillight":
        return f"Tail-light-{side_lr}" if side_lr else None

    if part == "mirror":
        return f"Mirror-{side_lr}" if side_lr else None

    if part == "quarter-panel":
        return f"Quarter-panel-{side_lr}" if side_lr else None

    if part == "rocker-panel":
        return f"Rocker-panel-{side_lr}" if side_lr else None

    simple_map = {"hood": "Hood", "trunk": "Trunk", "roof": "Roof", "grille": "Grille", "license-plate": "License-plate"}
    return simple_map.get(part)


def _split_comment(comment: str) -> list[str]:
    parts = re.split(r"(?:있고|이고|하고|이며|이나|그리고|또한)[,\s]|[,，]", comment)
    return [p.strip() for p in parts if len(p.strip()) >= 4]


def _extract_clause(text: str, claim_id: str) -> ClaimItem | None:
    side = next((val for pat, val in _SIDE_PATTERNS if re.search(pat, text, re.I)), None)
    area = next((val for pat, val in _AREA_PATTERNS if re.search(pat, text, re.I)), None)
    damage_type, severity = None, None
    for pat, dt, sev in _DAMAGE_PATTERNS:
        if re.search(pat, text, re.I):
            damage_type, severity = dt, sev
            break

    part_type, part_area = None, None
    for pat, pt, pa in _PART_PATTERNS:
        if re.search(pat, text, re.I):
            part_type, part_area = pt, pa
            break

    if part_area and not area:
        area = part_area

    panel = _resolve_panel(side, area, part_type)

    if not damage_type and not panel:
        return None

    found = sum(x is not None for x in [side, area, panel, damage_type])
    confidence = round(min(0.45 + found * 0.1, 0.85), 2)

    return ClaimItem(
        claim_id=claim_id,
        side=side,
        area=area,
        panel=panel,
        damage_type=damage_type,
        severity=severity,
        raw_text=text.strip(),
        confidence=confidence,
    )


def _extract_with_fallback(comment: str) -> list[ClaimItem]:
    clauses = _split_comment(comment) or [comment]
    claims, n = [], 1
    for clause in clauses:
        item = _extract_clause(clause, f"claim_{n:03d}")
        if item:
            claims.append(item)
            n += 1
    return claims


# ── Public entry point ────────────────────────────────────────────────────────

async def extract_structured_comment_claims(
    estimate_id: str | None,
    comment: str,
) -> CommentClaimResponse:
    if not settings.anthropic_api_key:
        return CommentClaimResponse(
            estimate_id=estimate_id,
            comment=comment,
            extractor="local_rule_based_fallback",
            model=None,
            llm_error="ANTHROPIC_API_KEY is not configured.",
            claims=_extract_with_fallback(comment),
        )

    try:
        claims, model_used = await _extract_with_claude(comment)
        return CommentClaimResponse(
            estimate_id=estimate_id,
            comment=comment,
            extractor="claude_claim_extractor",
            model=model_used,
            llm_error=None,
            claims=claims,
        )
    except Exception as e:
        return CommentClaimResponse(
            estimate_id=estimate_id,
            comment=comment,
            extractor="local_rule_based_fallback",
            model=None,
            llm_error=str(e),
            claims=_extract_with_fallback(comment),
        )
