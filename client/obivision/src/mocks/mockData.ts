import type {
  ClaudeVisionCheckResult,
  CommentImageComparisonResponse,
  ExtractStructuredCommentClaimsResponse,
  FinalSummarizedResultResponse,
  SkrEstimateResponse,
  SkrSlotClsResponse,
  DamageSummaryImageResponse,
} from "@/types/api";

// 1x1 transparent PNG base64
const MOCK_IMAGE_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

export const mockSlotClsResponse: SkrSlotClsResponse = {
  total_images: 8,
  front_center: [0, 1],
  front_driver: [2],
  front_passenger: [3],
  side_left: [4],
  side_right: [5],
  rear_center: [6],
  rear_driver: [],
  rear_passenger: [],
  other: [],
  non_vehicle: [7],
  request_id: "mock-request-001",
};

export const mockEstimateResponse: SkrEstimateResponse = {
  request_id: "mock-request-001",
  meta: {
    damaged_panels: [
      {
        name: "Front-bumper",
        damages: ["Scratched", "Crushed"],
        repair_types: ["BodyRepair", "Repainting"],
      },
      {
        name: "Hood",
        damages: ["Scratched"],
        repair_types: ["Polishing", "Repainting"],
      },
      {
        name: "Front-door-left",
        damages: ["Crushed"],
        repair_types: ["BodyRepair"],
      },
    ],
    geometry_info: {
      geometry_images: [
        {
          image_name: "car_front.jpg",
          vehicle_view_type: "front",
          geometry_damage_parts: [
            {
              name: "Front-bumper",
              damages: ["Scratched", "Crushed"],
              box_xywh: [100, 200, 150, 80],
            },
          ],
        },
        {
          image_name: "car_hood.jpg",
          vehicle_view_type: "top",
          geometry_damage_parts: [
            {
              name: "Hood",
              damages: ["Scratched"],
              box_xywh: [120, 150, 200, 100],
            },
          ],
        },
      ],
    },
  },
  images: {
    vis_damage: [
      {
        filename: "20260618_140000_damage_car_front.jpg",
        content_type: "image/png",
        data: MOCK_IMAGE_BASE64,
      },
      {
        filename: "20260618_140001_damage_car_hood.jpg",
        content_type: "image/png",
        data: MOCK_IMAGE_BASE64,
      },
    ],
  },
};

export const mockExtractClaimsResponse: ExtractStructuredCommentClaimsResponse = {
  estimate_id: "mock-request-001",
  comment: "전면 범퍼에 스크래치가 있고, 본넷에 찌그러짐이 있습니다.",
  extractor: "claude-opus-4",
  model: "claude-opus-4",
  llm_error: null,
  claims: [
    {
      claim_id: "claim-001",
      side: "front",
      area: "bumper",
      panel: "Front-bumper",
      damage_type: "Scratched",
      severity: "moderate",
      raw_text: "전면 범퍼에 스크래치가 있고",
      confidence: 0.92,
    },
    {
      claim_id: "claim-002",
      side: "front",
      area: "hood",
      panel: "Hood",
      damage_type: "Crushed",
      severity: "minor",
      raw_text: "본넷에 찌그러짐이 있습니다",
      confidence: 0.88,
    },
  ],
};

export const mockComparisonResponse: CommentImageComparisonResponse = {
  estimate_id: "mock-request-001",
  comparison_stage: "comment-image-comparison",
  overall_status: "matched",
  summary: "고객 코멘트와 이미지 분석 결과가 일치합니다.",
  claim_results: [
    {
      claim_id: "claim-001",
      raw_text: "전면 범퍼에 스크래치가 있고",
      status: "matched",
      matched_panels: ["Front-bumper"],
      reasoning: "이미지에서 전면 범퍼 스크래치 확인됨",
    },
    {
      claim_id: "claim-002",
      raw_text: "본넷에 찌그러짐이 있습니다",
      status: "matched",
      matched_panels: ["Hood"],
      reasoning: "이미지에서 본넷 손상 확인됨",
    },
  ],
  vision_handoff: {
    required: false,
    reason: null,
    targets: [],
  },
};

export const mockClaudeVisionCheckResult: ClaudeVisionCheckResult = {
  status: "completed",
  message: "AI 검증 완료",
  data: {
    request_id: "mock-request-001",
    estimate_id: "mock-request-001",
    comment: "전면 범퍼에 스크래치가 있고, 본넷에 찌그러짐이 있습니다.",
    meta: {
      vehicle_info: {
        vehicle_no: null,
        vehicle_name: "중형",
        vehicle_category: "중형",
      },
      overall_status: "all_verified",
      headline: "3건의 손상 확인",
      summary: "AI 분석 결과 총 3건의 손상이 확인되었습니다.",
      stats: {
        total_damages: 3,
        verified: 3,
        needs_review: 0,
      },
      decider: "vision",
      model: "claude-opus-4",
      comment_claims: [
        { claim_id: "claim-001", raw_text: "전면 범퍼에 스크래치가 있고" },
        { claim_id: "claim-002", raw_text: "본넷에 찌그러짐이 있습니다" },
      ],
      damaged_panels: [
        {
          name: "Front-bumper",
          damages: ["Scratched", "Crushed"],
          repair_types: ["BodyRepair", "Repainting"],
          requires_review_reasons: [],
          claude_verdict: {
            agree: true,
            confidence: 0.95,
            reasoning: "전면 범퍼에 명확한 스크래치와 찌그러짐이 관찰됨",
            evidence_images: ["car_front.jpg"],
            comment_corroboration: "claim-001",
            damage_confidences: {
              Scratched: 0.93,
              Crushed: 0.87,
            },
            damage_verdicts: [
              {
                damage_type: "Scratched",
                agree: true,
                confidence: 0.93,
                reasoning: "범퍼 표면에 여러 스크래치 확인",
              },
              {
                damage_type: "Crushed",
                agree: true,
                confidence: 0.87,
                reasoning: "범퍼 하단 변형 확인",
              },
            ],
          },
        },
        {
          name: "Hood",
          damages: ["Scratched"],
          repair_types: ["Polishing", "Repainting"],
          requires_review_reasons: [],
          claude_verdict: {
            agree: true,
            confidence: 0.91,
            reasoning: "본넷에 스크래치 손상 확인됨",
            evidence_images: ["car_hood.jpg"],
            comment_corroboration: "claim-002",
            damage_confidences: {
              Scratched: 0.91,
            },
            damage_verdicts: [
              {
                damage_type: "Scratched",
                agree: true,
                confidence: 0.91,
                reasoning: "본넷 중앙부에 스크래치 확인",
              },
            ],
          },
        },
        {
          name: "Front-door-left",
          damages: ["Crushed"],
          repair_types: ["BodyRepair"],
          requires_review_reasons: [],
          claude_verdict: {
            agree: true,
            confidence: 0.88,
            reasoning: "운전석 앞문에 찌그러짐 확인",
            evidence_images: ["car_front.jpg"],
            comment_corroboration: null,
            damage_confidences: {
              Crushed: 0.88,
            },
            damage_verdicts: [
              {
                damage_type: "Crushed",
                agree: true,
                confidence: 0.88,
                reasoning: "앞문 하단부 변형 확인",
              },
            ],
          },
        },
      ],
      geometry_info: {
        geometry_images: [
          {
            image_name: "car_front.jpg",
            image_size: [1920, 1080],
            vehicle_view_type: "front",
            overlay_image_ref: null,
            damage_assessment: null,
          },
          {
            image_name: "car_hood.jpg",
            image_size: [1920, 1080],
            vehicle_view_type: "top",
            overlay_image_ref: null,
            damage_assessment: null,
          },
        ],
      },
    },
  },
};

export const mockFinalSummarizedResult: FinalSummarizedResultResponse = {
  estimate_id: "mock-request-001",
  status: "success",
  message: "견적 생성 완료",
  document_info: {
    document_no: "EST-2026-001",
    issue_date: "2026-06-18",
  },
  vehicle_info: {
    vehicle_no: null,
    vehicle_name: "중형",
    vehicle_category: "중형",
  },
  analysis_result: {
    overall_status: "all_verified",
    headline: "3건의 손상 확인",
    summary: "AI 분석 결과 총 3건의 손상이 확인되었습니다.",
    total_damage_count: 3,
    estimate_damage_count: 3,
    review_damage_count: 0,
    image_count: 7,
    comment_count: 2,
    overall_confidence: 0.91,
    model: "claude-opus-4",
  },
  damage_sections: [
    {
      section_no: 1,
      damage_item_id: "damage-001",
      panel: "Front-bumper",
      panel_label: "전면 범퍼",
      damage_types: ["Scratched", "Crushed"],
      damage_type_labels: ["스크래치", "찌그러짐"],
      repair_types: ["BodyRepair", "Repainting"],
      repair_type_labels: ["판금", "도장"],
      confidence: 0.95,
      confidence_percent: 95,
      reasoning: "전면 범퍼에 명확한 스크래치와 찌그러짐이 관찰됨",
      evidence_images: [{ image_name: "car_front.jpg" }],
      damage_confidences: {
        Scratched: 0.93,
        Crushed: 0.87,
      },
      damage_verdicts: [
        {
          damage_type: "Scratched",
          agree: true,
          confidence: 0.93,
          reasoning: "범퍼 표면에 여러 스크래치 확인",
        },
        {
          damage_type: "Crushed",
          agree: true,
          confidence: 0.87,
          reasoning: "범퍼 하단 변형 확인",
        },
      ],
      requires_review: false,
      requires_review_reasons: [],
      included_in_estimate: true,
    },
    {
      section_no: 2,
      damage_item_id: "damage-002",
      panel: "Hood",
      panel_label: "본넷",
      damage_types: ["Scratched"],
      damage_type_labels: ["스크래치"],
      repair_types: ["Polishing", "Repainting"],
      repair_type_labels: ["광택", "도장"],
      confidence: 0.91,
      confidence_percent: 91,
      reasoning: "본넷에 스크래치 손상 확인됨",
      evidence_images: [{ image_name: "car_hood.jpg" }],
      damage_confidences: {
        Scratched: 0.91,
      },
      damage_verdicts: [
        {
          damage_type: "Scratched",
          agree: true,
          confidence: 0.91,
          reasoning: "본넷 중앙부에 스크래치 확인",
        },
      ],
      requires_review: false,
      requires_review_reasons: [],
      included_in_estimate: true,
    },
    {
      section_no: 3,
      damage_item_id: "damage-003",
      panel: "Front-door-left",
      panel_label: "운전석 앞문",
      damage_types: ["Crushed"],
      damage_type_labels: ["찌그러짐"],
      repair_types: ["BodyRepair"],
      repair_type_labels: ["판금"],
      confidence: 0.88,
      confidence_percent: 88,
      reasoning: "운전석 앞문에 찌그러짐 확인",
      evidence_images: [{ image_name: "car_front.jpg" }],
      damage_confidences: {
        Crushed: 0.88,
      },
      damage_verdicts: [
        {
          damage_type: "Crushed",
          agree: true,
          confidence: 0.88,
          reasoning: "앞문 하단부 변형 확인",
        },
      ],
      requires_review: false,
      requires_review_reasons: [],
      included_in_estimate: true,
    },
  ],
  estimate_sheet: {
    rows: [
      {
        no: 1,
        damage_item_id: "damage-001",
        damage_part: "전면 범퍼",
        repair_content: "판금 + 도장",
        quantity: 1,
        unit_price: 350000,
        supply_amount: 350000,
        confidence: 0.95,
        evidence_images: [{ image_name: "car_front.jpg" }],
        pricing_status: "estimated",
      },
      {
        no: 2,
        damage_item_id: "damage-002",
        damage_part: "본넷",
        repair_content: "광택 + 도장",
        quantity: 1,
        unit_price: 280000,
        supply_amount: 280000,
        confidence: 0.91,
        evidence_images: [{ image_name: "car_hood.jpg" }],
        pricing_status: "estimated",
      },
      {
        no: 3,
        damage_item_id: "damage-003",
        damage_part: "운전석 앞문",
        repair_content: "판금",
        quantity: 1,
        unit_price: 200000,
        supply_amount: 200000,
        confidence: 0.88,
        evidence_images: [{ image_name: "car_front.jpg" }],
        pricing_status: "estimated",
      },
    ],
    totals: {
      currency: "KRW",
      supply_amount: 830000,
      vat_rate: 0.1,
      vat_amount: 83000,
      total_amount: 913000,
    },
  },
  pending_inputs: [],
};

export const mockDamageSummaryImage: DamageSummaryImageResponse = {
  filename: "mock-request-001_marked_damage_summary.png",
  content_type: "image/png",
  data: MOCK_IMAGE_BASE64,
  marker_count: 3,
  markers: [
    {
      marker_no: 1,
      damage_item_id: "damage-001",
      panel: "Front-bumper",
      panel_label: "전면 범퍼",
      damage_type_labels: ["스크래치", "찌그러짐"],
      confidence_percent: 95,
      requires_review: false,
      included_in_estimate: true,
      status: "included",
      x_percent: 50,
      y_percent: 70,
    },
    {
      marker_no: 2,
      damage_item_id: "damage-002",
      panel: "Hood",
      panel_label: "본넷",
      damage_type_labels: ["스크래치"],
      confidence_percent: 91,
      requires_review: false,
      included_in_estimate: true,
      status: "included",
      x_percent: 50,
      y_percent: 50,
    },
    {
      marker_no: 3,
      damage_item_id: "damage-003",
      panel: "Front-door-left",
      panel_label: "운전석 앞문",
      damage_type_labels: ["찌그러짐"],
      confidence_percent: 88,
      requires_review: false,
      included_in_estimate: true,
      status: "included",
      x_percent: 30,
      y_percent: 60,
    },
  ],
};
