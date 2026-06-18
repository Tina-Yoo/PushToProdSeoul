import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useQuote } from "@/store/QuoteContext";
import QuotePdfDocument from "@/utils/QuotePdfDocument";
import { pdf } from "@react-pdf/renderer";
import { Download, Loader2 } from "lucide-react";
import { useState } from "react";

interface QuoteExportModalProps {
  open: boolean;
  onClose: () => void;
}

export default function QuoteExportModal({ open, onClose }: QuoteExportModalProps) {
  const { state } = useQuote();
  const { finalResult } = state;
  const [activeTab, setActiveTab] = useState<"analysis" | "estimate">("analysis");
  const [isGenerating, setIsGenerating] = useState(false);

  if (!finalResult) return null;

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

  // File to base64 converter
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handlePdfDownload = async () => {
    setIsGenerating(true);
    try {
      // Convert File objects to base64
      const photosWithBase64: Record<string, { preview: string; damageOverlay?: string }> = {};

      for (const [name, photo] of Object.entries(photosByName)) {
        if (photo.file) {
          try {
            const base64 = await fileToBase64(photo.file);
            photosWithBase64[name] = {
              preview: base64,
              damageOverlay: photo.damageOverlay,
            };
          } catch (error) {
            console.error(`Failed to convert ${name} to base64:`, error);
            if (photo.damageOverlay) {
              photosWithBase64[name] = {
                preview: "",
                damageOverlay: photo.damageOverlay,
              };
            }
          }
        }
      }

      // Generate PDF
      const doc = <QuotePdfDocument finalResult={finalResult} photosByName={photosWithBase64} />;
      const blob = await pdf(doc).toBlob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `견적서_${finalResult.document_info.document_no || "unknown"}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("PDF generation failed:", error);
      alert("PDF 생성에 실패했습니다.");
    } finally {
      setIsGenerating(false);
    }
  };

  // Data-based summary
  const { total_damage_count, estimate_damage_count, review_damage_count, image_count } =
    finalResult.analysis_result;
  const summaryText = `총 ${total_damage_count}건의 파손이 검출되었습니다. 이 중 ${estimate_damage_count}건이 견적에 포함되었으며, ${review_damage_count}건은 추가 검토가 필요합니다. ${image_count}장의 사진을 분석하여 AI가 자동으로 견적을 산출했습니다.`;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>견적서 미리보기</DialogTitle>
        </DialogHeader>

        {/* Tabs */}
        <div className="flex gap-2 border-b border-gray-200">
          <button
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === "analysis"
                ? "border-b-2 border-blue-700 text-blue-700"
                : "text-gray-600 hover:text-gray-900"
            }`}
            onClick={() => setActiveTab("analysis")}
          >
            분석 결과 보고서
          </button>
          <button
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === "estimate"
                ? "border-b-2 border-blue-700 text-blue-700"
                : "text-gray-600 hover:text-gray-900"
            }`}
            onClick={() => setActiveTab("estimate")}
          >
            견적서
          </button>
        </div>

        {/* Analysis Tab */}
        {activeTab === "analysis" && (
          <div className="space-y-6 py-4">
            {/* Summary */}
            <div className="bg-gray-100 rounded-lg p-4">
              <h3 className="font-semibold text-gray-900 mb-2">AI 검수 요약</h3>
              <p className="text-sm text-gray-700">{summaryText}</p>
            </div>

            {/* Damage Sections */}
            <div>
              <h3 className="font-semibold text-gray-900 mb-3">손상 항목</h3>
              <div className="space-y-4">
                {finalResult.damage_sections.map((section) => {
                  const imageSrc = (evidenceName: string) => {
                    const photo = resolvePhoto(evidenceName);
                    if (!photo) return null;
                    return photo.damageOverlay
                      ? `data:image/png;base64,${photo.damageOverlay}`
                      : photo.preview;
                  };

                  return (
                    <div
                      key={section.section_no}
                      className="border border-gray-200 rounded-lg p-4 space-y-3"
                    >
                      <div>
                        <h4 className="font-medium text-gray-900">
                          {section.section_no}. {section.panel_label || section.panel}
                        </h4>
                        <p className="text-sm text-gray-600 mt-1">
                          {section.damage_type_labels.join(", ")} -{" "}
                          {section.repair_type_labels.join(", ")}
                        </p>
                      </div>
                      {section.confidence_percent !== null && (
                        <div className="text-sm text-gray-700">
                          <span className="font-medium">신뢰도:</span>{" "}
                          {section.confidence_percent.toFixed(0)}%
                        </div>
                      )}
                      {section.reasoning && (
                        <div className="text-sm text-gray-700">
                          <span className="font-medium">판단 근거:</span> {section.reasoning}
                        </div>
                      )}
                      {section.evidence_images.length > 0 && (
                        <div>
                          <p className="text-sm text-gray-600 mb-2">근거 사진:</p>
                          <div className="flex gap-2 flex-wrap">
                            {section.evidence_images.slice(0, 4).map((ev, idx) => {
                              const src = imageSrc(ev.image_name);
                              if (!src) return null;
                              return (
                                <img
                                  key={idx}
                                  src={src}
                                  alt={`근거 ${idx + 1}`}
                                  className="w-16 h-16 object-cover rounded border border-gray-300"
                                />
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Estimate Tab */}
        {activeTab === "estimate" && (
          <div className="space-y-6 py-4">
            {/* Summary */}
            <div className="bg-gray-100 rounded-lg p-4">
              <h3 className="font-semibold text-gray-900 mb-2">AI 검수 요약</h3>
              <p className="text-sm text-gray-700">{summaryText}</p>
            </div>

            {/* Estimate Table */}
            <div>
              <h3 className="font-semibold text-gray-900 mb-3">수리 견적서</h3>
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-2 text-left font-medium text-gray-700">번호</th>
                      <th className="px-4 py-2 text-left font-medium text-gray-700">손상 부위</th>
                      <th className="px-4 py-2 text-left font-medium text-gray-700">수리 내용</th>
                      <th className="px-4 py-2 text-right font-medium text-gray-700">수량</th>
                      <th className="px-4 py-2 text-right font-medium text-gray-700">단가</th>
                      <th className="px-4 py-2 text-right font-medium text-gray-700">금액</th>
                    </tr>
                  </thead>
                  <tbody>
                    {finalResult.estimate_sheet.rows.map((row) => (
                      <tr key={row.no} className="border-b border-gray-200 last:border-0">
                        <td className="px-4 py-3 text-gray-900">{row.no}</td>
                        <td className="px-4 py-3 text-gray-900">{row.damage_part}</td>
                        <td className="px-4 py-3 text-gray-900">{row.repair_content}</td>
                        <td className="px-4 py-3 text-right text-gray-900">{row.quantity}</td>
                        <td className="px-4 py-3 text-right text-gray-900">
                          {row.unit_price?.toLocaleString() ?? "-"}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-900">
                          {row.supply_amount?.toLocaleString() ?? "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Totals */}
              <div className="mt-4 space-y-2 text-right">
                <div className="flex justify-end gap-8 text-sm">
                  <span className="text-gray-600">공급가액:</span>
                  <span className="font-medium text-gray-900">
                    {finalResult.estimate_sheet.totals.supply_amount.toLocaleString()}원
                  </span>
                </div>
                <div className="flex justify-end gap-8 text-sm">
                  <span className="text-gray-600">부가세 (10%):</span>
                  <span className="font-medium text-gray-900">
                    {finalResult.estimate_sheet.totals.vat_amount.toLocaleString()}원
                  </span>
                </div>
                <div className="flex justify-end gap-8 text-lg border-t border-gray-300 pt-2">
                  <span className="font-semibold text-gray-900">총액:</span>
                  <span className="font-bold text-blue-700">
                    {finalResult.estimate_sheet.totals.total_amount.toLocaleString()}원
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3 pt-4 border-t border-gray-200">
          <Button variant="outline" onClick={onClose} className="flex-1">
            닫기
          </Button>
          <Button onClick={handlePdfDownload} disabled={isGenerating} className="flex-1">
            {isGenerating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                PDF 생성 중...
              </>
            ) : (
              <>
                <Download className="h-4 w-4 mr-2" />
                PDF 다운로드
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
