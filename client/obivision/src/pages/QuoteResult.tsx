import obigoCI from "@/asset/Obigo_CI_vertical_for_web(306x500).png";
import QuoteExportModal from "@/components/QuoteExportModal";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { PANEL_COLOR_MAP, getDamageSummaryImage } from "@/services/carVisionApi";
import { useQuote } from "@/store/QuoteContext";
import type { DamageSummaryImageResponse } from "@/types/api";
import { useEffect, useState } from "react";
import { Link, Redirect } from "wouter";

export default function QuoteResult() {
  const { state } = useQuote();
  const { finalResult } = state;
  const [summaryImage, setSummaryImage] = useState<DamageSummaryImageResponse | null>(null);
  const [exportModalOpen, setExportModalOpen] = useState(false);

  useEffect(() => {
    if (!finalResult) return;
    const fetchSummaryImage = async () => {
      try {
        const response = await getDamageSummaryImage(finalResult);
        setSummaryImage(response);
      } catch (error) {
        console.error("Failed to load damage summary image:", error);
      }
    };
    fetchSummaryImage();
  }, [finalResult]);

  if (!finalResult) {
    return <Redirect to="/request" />;
  }

  const photosByName = Object.fromEntries(
    state.photos.filter((p) => p.file).map((p) => [p.file!.name, p])
  );

  const resolvePhoto = (evidenceName: string) => {
    // Try exact match first
    if (photosByName[evidenceName]) return photosByName[evidenceName];

    // Extract original filename from patterns like:
    // "20260618_060958_damage_141435799_70a7f6bed812417f8c2ce6ec56a55a33.jpg"
    // "20260618_060958_warped_damage_141435799_70a7f6bed812417f8c2ce6ec56a55a33.jpg"
    const patterns = [
      /\d{8}_\d{6}_(?:warped_)?damage_(.+)$/,  // With timestamp prefix
      /_damage_(.+)$/,                          // Simple damage prefix
      /^(.+)$/                                   // Fallback: use as is
    ];

    for (const pattern of patterns) {
      const m = evidenceName.match(pattern);
      if (m && m[1] && photosByName[m[1]]) {
        return photosByName[m[1]];
      }
    }

    return undefined;
  };

  const rowByDamageId = Object.fromEntries(
    finalResult.estimate_sheet.rows.map((r) => [r.damage_item_id, r])
  );

  const getPanelColor = (panelCode: string | null) => {
    if (!panelCode) return "#6b7280";
    return `#${PANEL_COLOR_MAP[panelCode] || "6b7280"}`;
  };

  const getConfidenceColor = (confidence: number | null) => {
    if (confidence === null) return "text-gray-600";
    const percent = confidence * 100;
    if (percent >= 80) return "text-red-600";
    if (percent >= 50) return "text-orange-600";
    return "text-blue-600";
  };

  // Data-based summary
  const { total_damage_count, estimate_damage_count, review_damage_count, image_count } =
    finalResult.analysis_result;
  const summaryText = `총 ${total_damage_count}건의 파손이 검출되었습니다. 이 중 ${estimate_damage_count}건이 견적에 포함되었으며, ${review_damage_count}건은 추가 검토가 필요합니다. ${image_count}장의 사진을 분석하여 AI가 자동으로 견적을 산출했습니다.`;

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <Link href="/">
            <img src={obigoCI} alt="Obigo" className="h-10 object-contain cursor-pointer" />
          </Link>
          <h1 className="text-xl font-semibold text-gray-900">AI 견적 결과</h1>
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto px-6 py-8 w-full flex gap-8">
        {/* Left Sidebar */}
        <aside className="w-80 flex-shrink-0">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 sticky top-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">AI 검수 요약</h2>
            <div className="space-y-4 text-sm text-gray-700">
              <p>{summaryText}</p>
              <div className="border-t border-gray-200 pt-4 space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-600">총 파손 건수</span>
                  <span className="font-medium">{total_damage_count}건</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">견적 포함</span>
                  <span className="font-medium text-red-600">{estimate_damage_count}건</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">추가 검토</span>
                  <span className="font-medium text-orange-600">{review_damage_count}건</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">분석 사진</span>
                  <span className="font-medium">{image_count}장</span>
                </div>
              </div>
            </div>
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1">
          {/* Damage Summary Image */}
          {summaryImage && (
            <section className="mb-8 bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">차량 손상 요약</h2>
              <div className="relative">
                <img
                  src={`data:${summaryImage.content_type};base64,${summaryImage.data}`}
                  alt="Damage Summary"
                  className="w-full rounded-lg border border-gray-200"
                />
              </div>
              <div className="mt-4 flex gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded-full bg-red-600"></div>
                  <span className="text-gray-700">견적 포함</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded-full bg-orange-600"></div>
                  <span className="text-gray-700">추가 검토 필요</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded-full bg-gray-600"></div>
                  <span className="text-gray-700">견적 제외</span>
                </div>
              </div>
            </section>
          )}

          {/* Quote Total */}
          <section className="mb-8 bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">견적 총액</h2>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-blue-700">
                {finalResult.estimate_sheet.totals.total_amount.toLocaleString()}
              </span>
              <span className="text-lg text-gray-600">원</span>
              <span className="text-sm text-gray-500 ml-2">(VAT 포함)</span>
            </div>
            <div className="mt-4 text-sm text-gray-600 space-y-1">
              <div className="flex justify-between">
                <span>공급가액</span>
                <span>{finalResult.estimate_sheet.totals.supply_amount.toLocaleString()}원</span>
              </div>
              <div className="flex justify-between">
                <span>부가세 (10%)</span>
                <span>{finalResult.estimate_sheet.totals.vat_amount.toLocaleString()}원</span>
              </div>
            </div>
          </section>

          {/* Export Button */}
          <section className="mb-8">
            <Button className="w-full h-12" onClick={() => setExportModalOpen(true)}>
              견적서 내보내기
            </Button>
          </section>

          {/* Damage Details */}
          <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">손상 상세 정보</h2>
            <Accordion type="multiple" className="w-full">
              {finalResult.damage_sections.map((section) => {
                const row = rowByDamageId[section.damage_item_id];
                const imageSrc = (evidenceName: string) => {
                  const photo = resolvePhoto(evidenceName);
                  if (!photo) return null;
                  return photo.damageOverlay
                    ? `data:image/png;base64,${photo.damageOverlay}`
                    : photo.preview;
                };

                return (
                  <AccordionItem key={section.section_no} value={`section-${section.section_no}`}>
                    <AccordionTrigger className="hover:no-underline">
                      <div className="flex items-center gap-3 w-full pr-4">
                        <div
                          className="w-3 h-3 rounded-full flex-shrink-0"
                          style={{ backgroundColor: getPanelColor(section.panel) }}
                        />
                        <div className="flex-1 text-left">
                          <div className="font-medium text-gray-900">
                            {section.panel_label || section.panel}
                          </div>
                          <div className="text-sm text-gray-600">
                            {section.damage_type_labels.join(", ")}
                          </div>
                        </div>
                        {section.confidence_percent !== null && (
                          <div
                            className={`text-sm font-medium ${getConfidenceColor(section.confidence)}`}
                          >
                            {section.confidence_percent.toFixed(0)}%
                          </div>
                        )}
                        {row && (
                          <div className="text-sm font-medium text-gray-900">
                            {row.supply_amount?.toLocaleString()}원
                          </div>
                        )}
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="space-y-4 pt-2">
                        <div>
                          <p className="text-sm font-medium text-gray-700 mb-1">손상 유형</p>
                          <p className="text-sm text-gray-600">
                            {section.damage_type_labels.join(", ")}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-700 mb-1">수리 방법</p>
                          <p className="text-sm text-gray-600">
                            {section.repair_type_labels.join(", ")}
                          </p>
                        </div>
                        {section.reasoning && (
                          <div>
                            <p className="text-sm font-medium text-gray-700 mb-1">AI 판단 근거</p>
                            <p className="text-sm text-gray-600">{section.reasoning}</p>
                          </div>
                        )}
                        {section.evidence_images.length > 0 && (
                          <div>
                            <p className="text-sm font-medium text-gray-700 mb-2">근거 사진</p>
                            <div className="grid grid-cols-4 gap-2">
                              {section.evidence_images.slice(0, 4).map((ev, idx) => {
                                const src = imageSrc(ev.image_name);
                                if (!src) return null;
                                return (
                                  <img
                                    key={idx}
                                    src={src}
                                    alt={`Evidence ${idx + 1}`}
                                    className="w-full aspect-square object-cover rounded border border-gray-300 cursor-pointer hover:opacity-80 transition-opacity"
                                  />
                                );
                              })}
                            </div>
                          </div>
                        )}
                        {section.requires_review && (
                          <div className="bg-orange-50 border border-orange-200 rounded p-3">
                            <p className="text-sm font-medium text-orange-800 mb-1">
                              추가 검토 필요
                            </p>
                            <p className="text-sm text-orange-700">
                              {section.requires_review_reasons.join(", ")}
                            </p>
                          </div>
                        )}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          </section>
        </main>
      </div>

      {/* Export Modal */}
      {exportModalOpen && (
        <QuoteExportModal
          open={exportModalOpen}
          onClose={() => setExportModalOpen(false)}
        />
      )}
    </div>
  );
}
