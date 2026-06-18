import { http, HttpResponse, delay } from "msw";
import {
  mockSlotClsResponse,
  mockEstimateResponse,
  mockExtractClaimsResponse,
  mockComparisonResponse,
  mockClaudeVisionCheckResult,
  mockFinalSummarizedResult,
  mockDamageSummaryImage,
} from "./mockData";

const API_BASE_URL = "http://112.220.206.226:8100";
const COMMENT_API_BASE_URL = "http://172.16.10.176:5180";

// SSE 응답 생성 헬퍼
function createSSEResponse(data: unknown) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      // Progress event
      await delay(500);
      controller.enqueue(encoder.encode("event: progress\n"));
      controller.enqueue(encoder.encode("data: AI 분석 시작\n\n"));

      // Progress event 2
      await delay(800);
      controller.enqueue(encoder.encode("event: progress\n"));
      controller.enqueue(encoder.encode("data: 이미지 분석 중...\n\n"));

      // Complete event
      await delay(1000);
      controller.enqueue(encoder.encode("event: complete\n"));
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));

      controller.close();
    },
  });

  return new HttpResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

export const handlers = [
  // Health Check
  http.get(`${API_BASE_URL}/health`, () => {
    return HttpResponse.json({
      status: "ok",
      timestamp: new Date().toISOString(),
    });
  }),

  // Slot Classification (SSE)
  http.post(`${API_BASE_URL}/api/v1/skrentalcar/exterior-damage/slot-cls`, () => {
    return createSSEResponse(mockSlotClsResponse);
  }),

  // Exterior Damage Estimate (SSE)
  http.post(`${API_BASE_URL}/api/v1/skrentalcar/exterior-damage/estimate`, () => {
    return createSSEResponse(mockEstimateResponse);
  }),

  // Extract Structured Comment Claims
  http.post(`${COMMENT_API_BASE_URL}/api/v1/extract-structured-comment-claims`, async () => {
    await delay(1000);
    return HttpResponse.json(mockExtractClaimsResponse);
  }),

  // Comment-Image Comparison
  http.post(`${COMMENT_API_BASE_URL}/api/v1/comment-image-comparison-result`, async () => {
    await delay(1200);
    return HttpResponse.json(mockComparisonResponse);
  }),

  // Claude Vision Check
  http.post(`${COMMENT_API_BASE_URL}/api/v1/claude-vision-check-result`, async () => {
    await delay(1500);
    return HttpResponse.json(mockClaudeVisionCheckResult);
  }),

  // Final Summarized Result
  http.post(`${COMMENT_API_BASE_URL}/api/v1/final-summarized-result`, async () => {
    await delay(1000);
    return HttpResponse.json(mockFinalSummarizedResult);
  }),

  // Damage Summary Image
  http.post(`${COMMENT_API_BASE_URL}/api/v1/damage-summary-marked-image`, async () => {
    await delay(800);
    return HttpResponse.json(mockDamageSummaryImage);
  }),
];
