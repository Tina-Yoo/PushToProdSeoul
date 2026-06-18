"""
Image Marker service — API #5.

Draws semi-transparent colored overlays on cardefault.jpg for each damage panel.
No LLM calls. Pure Pillow image processing.

Image orientation (cardefault.jpg):
  Left  = car front,  Right = car rear
  Top   = passenger side (right),  Bottom = driver side (left)
"""

import base64
import io

from PIL import Image, ImageDraw, ImageFont

from app.config import settings
from app.schemas.final_summary import DamageSection, FinalSummaryResponse
from app.schemas.marked_image import MarkedImageResponse, MarkerInfo


# ── Panel coordinate table ────────────────────────────────────────────────────
# (center_x%, center_y%, width%, height%) — all relative to image dimensions

PANEL_COORDS: dict[str, tuple[float, float, float, float]] = {
    # ── Front ──────────────────────────────────────────────────────────────────
    "Front-bumper":        (4.8,  50.0,  7.0, 38.0),
    "Grille":              (6.0,  50.0,  4.0, 22.0),
    "Headlight-right":     (8.0,  13.0,  7.0, 10.0),
    "Headlight-left":      (8.0,  87.0,  7.0, 10.0),
    "Hood":                (18.0, 50.0, 22.0, 55.0),
    "Fender-right":        (16.0, 16.0, 14.0, 16.0),
    "Fender-left":         (16.0, 84.0, 14.0, 16.0),
    "Front-wheel-right":   (21.0,  9.0,  8.0, 12.0),
    "Front-wheel-left":    (21.0, 91.0,  8.0, 12.0),
    # ── Windshield / mirrors ───────────────────────────────────────────────────
    "Windshield":          (29.0, 50.0, 11.0, 52.0),
    "Mirror-right":        (31.0,  5.0,  5.0,  6.0),
    "Mirror-left":         (31.0, 95.0,  5.0,  6.0),
    # ── Front doors / windows ─────────────────────────────────────────────────
    "Front-window-right":  (38.0, 14.0, 10.0, 14.0),
    "Front-window-left":   (38.0, 86.0, 10.0, 14.0),
    "Front-door-right":    (43.0, 19.0, 18.0, 26.0),
    "Front-door-left":     (43.0, 81.0, 18.0, 26.0),
    # ── Center / roof / rocker ────────────────────────────────────────────────
    "Rocker-panel-right":  (51.0,  7.0, 28.0,  8.0),
    "Rocker-panel-left":   (51.0, 93.0, 28.0,  8.0),
    "Roof":                (51.0, 50.0, 32.0, 42.0),
    # ── Back doors / windows ──────────────────────────────────────────────────
    "Back-door-right":     (60.0, 19.0, 18.0, 26.0),
    "Back-door-left":      (63.0, 81.5, 18.0, 26.0),
    "Back-window-right":   (66.0, 14.0, 10.0, 14.0),
    "Back-window-left":    (66.0, 86.0, 10.0, 14.0),
    # ── Rear ──────────────────────────────────────────────────────────────────
    "Back-windshield":     (72.0, 50.0, 11.0, 52.0),
    "Quarter-panel-right": (78.5, 18.5, 14.0, 16.0),
    "Quarter-panel-left":  (78.5, 81.5, 14.0, 16.0),
    "Back-wheel-right":    (80.0,  9.0,  8.0, 12.0),
    "Back-wheel-left":     (80.0, 91.0,  8.0, 12.0),
    "Trunk":               (86.0, 50.0, 18.0, 55.0),
    "Tail-light-right":    (93.5, 13.0,  6.0, 10.0),
    "Tail-light-left":     (93.5, 87.0,  6.0, 10.0),
    "Back-bumper":         (96.2, 50.0,  7.0, 38.0),
    "License-plate":       (97.0, 50.0,  4.0,  8.0),
}


# ── Colors (RGBA) ─────────────────────────────────────────────────────────────

_COLOR_INCLUDED     = (220,  50,  50, 160)  # red   — confirmed in estimate
_COLOR_NEEDS_REVIEW = (240, 140,  20, 160)  # orange — in estimate but needs review
_COLOR_EXCLUDED     = (130, 130, 130, 130)  # gray  — not in estimate


def _status_and_color(section: DamageSection) -> tuple[str, tuple[int, int, int, int]]:
    if not section.included_in_estimate:
        return "excluded", _COLOR_EXCLUDED
    if section.requires_review:
        return "needs_review", _COLOR_NEEDS_REVIEW
    return "included", _COLOR_INCLUDED


# ── Font helpers ──────────────────────────────────────────────────────────────

def _load_font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = [
        "C:/Windows/Fonts/arialbd.ttf",
        "C:/Windows/Fonts/arial.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
    ]
    for path in candidates:
        try:
            return ImageFont.truetype(path, size)
        except (IOError, OSError):
            continue
    # Pillow >= 10.1 supports size param; older versions don't
    try:
        return ImageFont.load_default(size=size)
    except TypeError:
        return ImageFont.load_default()


def _text_center(draw: ImageDraw.ImageDraw, text: str, font) -> tuple[int, int]:
    """Return (half-width, half-height) for centering."""
    try:
        bbox = draw.textbbox((0, 0), text, font=font)
        return (bbox[2] - bbox[0]) // 2, (bbox[3] - bbox[1]) // 2
    except AttributeError:
        # Pillow < 8.0 fallback
        w, h = draw.textsize(text, font=font)  # type: ignore[attr-defined]
        return w // 2, h // 2


# ── Core drawing ──────────────────────────────────────────────────────────────

_MIN_OVERLAY_PX = 18  # minimum pixel size for any dimension


def _draw_overlay(
    draw: ImageDraw.ImageDraw,
    cx: int,
    cy: int,
    pw: int,
    ph: int,
    color: tuple[int, int, int, int],
    label: str,
) -> None:
    pw = max(pw, _MIN_OVERLAY_PX)
    ph = max(ph, _MIN_OVERLAY_PX)

    x0, y0 = cx - pw // 2, cy - ph // 2
    x1, y1 = cx + pw // 2, cy + ph // 2

    outline = (*color[:3], min(255, color[3] + 60))
    draw.rectangle([x0, y0, x1, y1], fill=color, outline=outline, width=2)

    font_size = max(10, min(int(min(pw, ph) * 0.42), 48))
    font = _load_font(font_size)
    hw, hh = _text_center(draw, label, font)

    # Outline: draw 8-directional shadow for readability
    for dx, dy in ((-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)):
        draw.text((cx - hw + dx, cy - hh + dy), label, font=font, fill=(0, 0, 0, 230))
    draw.text((cx - hw, cy - hh), label, font=font, fill=(255, 255, 255, 255))


# ── Public entry point ────────────────────────────────────────────────────────

def generate_marked_image(request: FinalSummaryResponse) -> MarkedImageResponse:
    image_path = settings.resources_dir / "cardefault.jpg"
    if not image_path.exists():
        raise FileNotFoundError(f"Base image not found: {image_path}")

    img = Image.open(image_path).convert("RGBA")
    iw, ih = img.size

    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)

    markers: list[MarkerInfo] = []
    marker_no = 1

    for section in request.damage_sections or []:
        if not section.panel or section.panel not in PANEL_COORDS:
            continue

        cx_pct, cy_pct, w_pct, h_pct = PANEL_COORDS[section.panel]
        status, color = _status_and_color(section)

        cx = int(iw * cx_pct / 100)
        cy = int(ih * cy_pct / 100)
        pw = int(iw * w_pct / 100)
        ph = int(ih * h_pct / 100)

        _draw_overlay(draw, cx, cy, pw, ph, color, str(marker_no))

        markers.append(
            MarkerInfo(
                marker_no=marker_no,
                damage_item_id=section.damage_item_id or f"damage_{marker_no:03d}",
                panel=section.panel,
                panel_label=section.panel_label,
                damage_type_labels=section.damage_type_labels or [],
                confidence_percent=section.confidence_percent,
                requires_review=section.requires_review,
                included_in_estimate=section.included_in_estimate,
                status=status,
                x_percent=cx_pct,
                y_percent=cy_pct,
            )
        )
        marker_no += 1

    result = Image.alpha_composite(img, overlay).convert("RGB")

    buf = io.BytesIO()
    result.save(buf, format="PNG", optimize=False)
    b64 = base64.b64encode(buf.getvalue()).decode("utf-8")

    est_id = request.estimate_id or "unknown"
    filename = f"{est_id}_marked_damage_summary.png"

    return MarkedImageResponse(
        filename=filename,
        content_type="image/png",
        data=b64,
        marker_count=len(markers),
        markers=markers,
    )
