from pydantic import BaseModel


class MarkerInfo(BaseModel):
    marker_no: int
    damage_item_id: str
    panel: str
    panel_label: str | None = None
    damage_type_labels: list[str] = []
    confidence_percent: int | None = None
    requires_review: bool = False
    included_in_estimate: bool = True
    status: str
    x_percent: float
    y_percent: float


class MarkedImageResponse(BaseModel):
    filename: str
    content_type: str = "image/png"
    data: str  # base64-encoded PNG
    marker_count: int
    markers: list[MarkerInfo]
