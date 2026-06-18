import estimateTypeMatch from "@/asset/estimateTypeMatch.json";
import type {
  ClaudeVisionCheckRequest,
  ClaudeVisionCheckResult,
  CommentImageComparisonResponse,
  DamageSummaryImageResponse,
  ExtractStructuredCommentClaimsResponse,
  FinalSummarizedResultRequest,
  FinalSummarizedResultResponse,
  HealthResponse,
  SkrEstimateResponse,
  SkrSlotClsResponse,
  StructuredClaim,
} from "@/types/api";

// API Configuration
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://112.220.206.226:8100";
const COMMENT_API_BASE_URL = import.meta.env.VITE_COMMENT_API_BASE_URL ?? "http://172.16.10.176:5180";
const API_KEY = import.meta.env.VITE_API_KEY ?? "";

// Mapping Constants
export const CATEGORY_MAP: Record<string, string> = {
  front_center: "정면(중앙)",
  front_driver: "정면(운전석)",
  front_passenger: "정면(동승석)",
  side_left: "측면(좌)",
  side_right: "측면(우)",
  rear_center: "후면(중앙)",
  rear_driver: "후면(운전석)",
  rear_passenger: "후면(동승석)",
  other: "기타",
  non_vehicle: "비차량",
};

export const DAMAGE_TYPE_MAP: Record<string, string> = Object.fromEntries(
  estimateTypeMatch.damageTypes.map((d) => [d.code, d.name])
);

export const PANEL_NAME_MAP: Record<string, string> = Object.fromEntries(
  estimateTypeMatch.panelTypes.map((p) => [p.code, p.name])
);

export const PANEL_COLOR_MAP: Record<string, string> = Object.fromEntries(
  estimateTypeMatch.panelTypes.map((p) => [p.code, p.color])
);

export const REPAIR_TYPE_MAP: Record<string, string> = Object.fromEntries(
  estimateTypeMatch.repairTypes.map((r) => [r.code, r.name])
);

// Custom Error Class
export class CarVisionApiError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public details?: unknown
  ) {
    super(message);
    this.name = "CarVisionApiError";
  }
}

// SSE Helper Function
async function consumeSSE<T>(
  url: string,
  options: RequestInit,
  onProgress?: (message: string) => void
): Promise<T> {
  const response = await fetch(url, options);

  if (!response.ok) {
    throw new CarVisionApiError(
      `HTTP error: ${response.status} ${response.statusText}`,
      response.status
    );
  }

  if (!response.body) {
    throw new CarVisionApiError("No response body");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: T | null = null;
  let currentEvent: string | null = null;
  const receivedEvents: string[] = [];

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine) continue;

        if (trimmedLine.startsWith("event:")) {
          currentEvent = trimmedLine.slice(6).trim();
          receivedEvents.push(currentEvent);
          continue;
        }

        if (trimmedLine.startsWith("data:")) {
          const data = trimmedLine.slice(5).trim();

          if (currentEvent === "progress") {
            onProgress?.(data);
          } else if (currentEvent === "complete") {
            try {
              result = JSON.parse(data) as T;
            } catch (e) {
              console.error("Failed to parse complete event data:", data, e);
              throw new CarVisionApiError("Failed to parse SSE complete event");
            }
          } else if (currentEvent === "error") {
            throw new CarVisionApiError(`SSE error event: ${data}`);
          }

          currentEvent = null;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  if (buffer.trim()) {
    console.warn("Remaining buffer after SSE stream ended:", buffer);
  }

  if (!result) {
    console.error("Received events:", receivedEvents);
    throw new CarVisionApiError("No complete event received from SSE stream");
  }

  return result;
}

// Health Check (no auth)
export async function checkHealth(): Promise<HealthResponse> {
  const response = await fetch(`${API_BASE_URL}/health`);
  if (!response.ok) {
    throw new CarVisionApiError(`Health check failed: ${response.statusText}`, response.status);
  }
  return response.json();
}

// SKR API: Slot Classification (SSE)
export async function classifyCarSlots(
  images: File[],
  vehicleCategory?: string,
  onProgress?: (message: string) => void
): Promise<SkrSlotClsResponse> {
  const formData = new FormData();
  images.forEach((file) => {
    formData.append("images", file);
  });
  if (vehicleCategory) {
    formData.append("vehicle_category", vehicleCategory);
  }

  return consumeSSE<SkrSlotClsResponse>(
    `${API_BASE_URL}/api/v1/skrentalcar/exterior-damage/slot-cls`,
    {
      method: "POST",
      headers: {
        access_token: API_KEY,
      },
      body: formData,
    },
    onProgress
  );
}

// SKR API: Exterior Damage Estimate (SSE)
export async function estimateExteriorDamage(
  images: File[],
  vehicleCategory?: string,
  requestId?: string,
  onProgress?: (message: string) => void
): Promise<SkrEstimateResponse> {
  const formData = new FormData();
  images.forEach((file) => {
    formData.append("images", file);
  });
  if (vehicleCategory) {
    formData.append("vehicle_category", vehicleCategory);
  }
  if (requestId) {
    formData.append("request_id", requestId);
  }
  formData.append("return_detail_visualization", "true");

  return consumeSSE<SkrEstimateResponse>(
    `${API_BASE_URL}/api/v1/skrentalcar/exterior-damage/estimate`,
    {
      method: "POST",
      headers: {
        access_token: API_KEY,
      },
      body: formData,
    },
    onProgress
  );
}

// Comment API: Extract Structured Claims
export async function extractStructuredCommentClaims(
  comment: string,
  estimateId?: string
): Promise<ExtractStructuredCommentClaimsResponse> {
  const response = await fetch(
    `${COMMENT_API_BASE_URL}/api/v1/extract-structured-comment-claims`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        estimate_id: estimateId || null,
        comment,
      }),
    }
  );

  if (!response.ok) {
    throw new CarVisionApiError(
      `Extract claims failed: ${response.statusText}`,
      response.status
    );
  }

  return response.json();
}

// Comment API: Comment-Image Comparison
export async function commentImageComparison(
  exteriorDamageEstimate: SkrEstimateResponse,
  claims: StructuredClaim[],
  comment?: string | null,
  estimateId?: string | null
): Promise<CommentImageComparisonResponse> {
  const response = await fetch(
    `${COMMENT_API_BASE_URL}/api/v1/comment-image-comparison-result`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        estimate_id: estimateId,
        comment: comment,
        claims,
        exterior_damage_estimate: exteriorDamageEstimate,
      }),
    }
  );

  if (!response.ok) {
    throw new CarVisionApiError(
      `Comment-image comparison failed: ${response.statusText}`,
      response.status
    );
  }

  return response.json();
}

// Comment API: Claude Vision Check
export async function claudeVisionCheck(
  request: ClaudeVisionCheckRequest
): Promise<ClaudeVisionCheckResult> {
  const response = await fetch(
    `${COMMENT_API_BASE_URL}/api/v1/claude-vision-check-result`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
    }
  );

  if (!response.ok) {
    throw new CarVisionApiError(
      `Claude vision check failed: ${response.statusText}`,
      response.status
    );
  }

  return response.json();
}

// Comment API: Final Summarized Result
export async function finalSummarizedResult(
  request: FinalSummarizedResultRequest
): Promise<FinalSummarizedResultResponse> {
  const response = await fetch(
    `${COMMENT_API_BASE_URL}/api/v1/final-summarized-result`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
    }
  );

  if (!response.ok) {
    throw new CarVisionApiError(
      `Final summarized result failed: ${response.statusText}`,
      response.status
    );
  }

  return response.json();
}

// Comment API: Damage Summary Image
export async function getDamageSummaryImage(
  finalResult: FinalSummarizedResultResponse
): Promise<DamageSummaryImageResponse> {
  const response = await fetch(
    `${COMMENT_API_BASE_URL}/api/v1/damage-summary-marked-image`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(finalResult),
    }
  );

  if (!response.ok) {
    throw new CarVisionApiError(
      `Damage summary image failed: ${response.statusText}`,
      response.status
    );
  }

  return response.json();
}
