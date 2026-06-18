// Health Check
export interface HealthResponse {
  status: string;
  timestamp?: string;
}

// SKR Slot Classification Response
export interface SkrSlotClsResponse {
  total_images: number;
  front_center: number[];
  front_driver: number[];
  front_passenger: number[];
  side_left: number[];
  side_right: number[];
  rear_center: number[];
  rear_driver: number[];
  rear_passenger: number[];
  other: number[];
  non_vehicle: number[];
  request_id: string;
}

// SKR Estimate Response
export interface SkrEstimateResponse {
  request_id: string;
  meta: {
    damaged_panels: Array<{
      name: string;
      damages: string[];
      repair_types: string[];
    }>;
    geometry_info: {
      geometry_images: Array<{
        image_name: string;
        vehicle_view_type: string;
        geometry_damage_parts: Array<{
          name: string;
          damages: string[];
          box_xywh: number[];
        }>;
      }>;
    };
    estimated_repair_cost?: unknown;
    vehicle_info?: unknown;
  };
  images: {
    vis_damage?: Array<{
      filename: string;
      content_type: string;
      data: string;
    }>;
  };
}

// Structured Comment Claims
export interface StructuredClaim {
  claim_id: string;
  side: string | null;
  area: string | null;
  panel: string | null;
  damage_type: string | null;
  severity: string | null;
  raw_text: string;
  confidence: number;
}

export interface ExtractStructuredCommentClaimsResponse {
  estimate_id: string | null;
  comment: string;
  extractor: string;
  model: string | null;
  llm_error: string | null;
  claims: StructuredClaim[];
}

// Comment-Image Comparison
export interface ComparisonClaimResult {
  claim_id: string;
  raw_text: string;
  status: string;
  matched_panels?: string[];
  reasoning?: string;
}

export interface CommentImageComparisonResponse {
  estimate_id: string | null;
  comparison_stage: string;
  overall_status: string;
  summary: string;
  claim_results: ComparisonClaimResult[];
  vision_handoff: {
    required: boolean;
    reason: string | null;
    targets: unknown[];
  };
}

// Claude Vision Check
export interface ClaudeVisionCheckDamageVerdict {
  damage_type: string;
  agree: boolean;
  confidence: number;
  reasoning: string;
}

export interface ClaudeVisionCheckResult {
  status: string;
  message?: string;
  data: {
    request_id?: string | null;
    estimate_id?: string | null;
    comment?: string | null;
    meta: {
      vehicle_info?: {
        vehicle_no?: string | null;
        vehicle_name?: string | null;
        vehicle_category?: string | null;
      } | null;
      overall_status?: string | null;
      headline?: string | null;
      summary?: string | null;
      stats?: Record<string, number> | null;
      decider?: string | null;
      model?: string | null;
      comment_claims?: Array<{
        claim_id: string;
        raw_text: string;
      }>;
      damaged_panels: Array<{
        name: string;
        damages: string[];
        repair_types: string[];
        requires_review_reasons: string[];
        claude_verdict: {
          agree: boolean;
          confidence: number;
          reasoning: string;
          evidence_images: string[];
          comment_corroboration: string | null;
          damage_confidences: Record<string, number>;
          damage_verdicts: ClaudeVisionCheckDamageVerdict[];
        };
      }>;
      geometry_info?: {
        geometry_images: Array<{
          image_name: string;
          image_size?: [number, number];
          vehicle_view_type?: string;
          overlay_image_ref?: string | null;
          damage_assessment?: unknown | null;
        }>;
      } | null;
    };
  };
}

// Final Summarized Result
export interface FinalSummarizedResultResponse {
  estimate_id: string | null;
  status: string;
  message: string;
  document_info: {
    document_no: string | null;
    issue_date: string | null;
  };
  vehicle_info: {
    vehicle_no: string | null;
    vehicle_name: string | null;
    vehicle_category: string | null;
  };
  analysis_result: {
    overall_status: string | null;
    headline: string | null;
    summary: string | null;
    total_damage_count: number;
    estimate_damage_count: number;
    review_damage_count: number;
    image_count: number;
    comment_count: number;
    overall_confidence: number | null;
    model: string | null;
  };
  damage_sections: Array<{
    section_no: number;
    damage_item_id: string;
    panel: string | null;
    panel_label: string | null;
    damage_types: string[];
    damage_type_labels: string[];
    repair_types: string[];
    repair_type_labels: string[];
    confidence: number | null;
    confidence_percent: number | null;
    reasoning: string | null;
    evidence_images: Array<{ image_name: string }>;
    damage_confidences: Record<string, number>;
    damage_verdicts: ClaudeVisionCheckDamageVerdict[];
    requires_review: boolean;
    requires_review_reasons: string[];
    included_in_estimate: boolean;
  }>;
  estimate_sheet: {
    rows: Array<{
      no: number;
      damage_item_id: string;
      damage_part: string | null;
      repair_content: string;
      quantity: number;
      unit_price: number | null;
      supply_amount: number | null;
      confidence: number | null;
      evidence_images: Array<{ image_name: string }>;
      pricing_status: string;
    }>;
    totals: {
      currency: string;
      supply_amount: number;
      vat_rate: number;
      vat_amount: number;
      total_amount: number;
    };
  };
  pending_inputs: string[];
}

// Damage Summary Image Response
export interface DamageSummaryImageResponse {
  filename: string;
  content_type: string;
  data: string;
  marker_count: number;
  markers: Array<{
    marker_no: number;
    damage_item_id: string;
    panel: string;
    panel_label: string;
    damage_type_labels: string[];
    confidence_percent: number;
    requires_review: boolean;
    included_in_estimate: boolean;
    status: "included" | "needs_review" | "excluded";
    x_percent: number;
    y_percent: number;
  }>;
}

// API Request Types
export interface ClaudeVisionCheckRequest {
  estimate_id?: string | null;
  comment?: string | null;
  comparison_result: CommentImageComparisonResponse;
  exterior_damage_estimate: SkrEstimateResponse;
  images?: Record<string, string> | null;
}

export interface FinalSummarizedResultRequest {
  vehicle_category: string;
  claude_vision_check_result: ClaudeVisionCheckResult;
  estimate_id?: string | null;
  vehicle_info?: {
    vehicle_name?: string;
  } | null;
}
