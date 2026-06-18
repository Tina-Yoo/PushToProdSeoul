import type { FinalSummarizedResultResponse } from "@/types/api";
import { Document, Font, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

// Register Korean font - Noto Sans KR from local
Font.register({
  family: "NotoSansKR",
  fonts: [
    {
      src: "/NotoSansKR-Regular.ttf",
      fontWeight: "normal",
    },
    {
      src: "/NotoSansKR-Regular.ttf",
      fontWeight: "bold",
    },
  ],
});

const styles = StyleSheet.create({
  page: {
    fontFamily: "NotoSansKR",
    padding: 40,
    fontSize: 10,
  },
  header: {
    marginBottom: 20,
    borderBottom: "1pt solid #e5e7eb",
    paddingBottom: 10,
  },
  title: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 11,
    color: "#6b7280",
    marginBottom: 4,
  },
  summaryBox: {
    backgroundColor: "#f3f4f6",
    padding: 12,
    borderRadius: 4,
    marginBottom: 16,
  },
  summaryText: {
    fontSize: 9,
    lineHeight: 1.4,
    color: "#374151",
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "bold",
    marginBottom: 8,
    color: "#1f2937",
  },
  damageItem: {
    border: "1pt solid #e5e7eb",
    borderRadius: 4,
    padding: 10,
    marginBottom: 8,
  },
  damageItemHeader: {
    fontSize: 10,
    fontWeight: "bold",
    marginBottom: 4,
  },
  damageItemDetail: {
    fontSize: 9,
    color: "#6b7280",
    marginBottom: 2,
  },
  evidenceImages: {
    flexDirection: "row",
    gap: 8,
    marginTop: 8,
  },
  evidenceImage: {
    width: 60,
    height: 60,
    objectFit: "cover",
    borderRadius: 2,
    border: "1pt solid #d1d5db",
  },
  table: {
    border: "1pt solid #e5e7eb",
    borderRadius: 4,
    overflow: "hidden",
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#f9fafb",
    borderBottom: "1pt solid #e5e7eb",
    padding: 8,
  },
  tableRow: {
    flexDirection: "row",
    borderBottom: "1pt solid #e5e7eb",
    padding: 8,
  },
  tableCell: {
    fontSize: 9,
  },
  tableCellRight: {
    fontSize: 9,
    textAlign: "right",
  },
  totalsSection: {
    marginTop: 12,
    paddingTop: 8,
    borderTop: "1pt solid #d1d5db",
  },
  totalsRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 40,
    marginBottom: 4,
  },
  totalsLabel: {
    fontSize: 9,
    color: "#6b7280",
  },
  totalsValue: {
    fontSize: 9,
    fontWeight: "bold",
  },
  totalsFinalRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 40,
    marginTop: 4,
    paddingTop: 4,
    borderTop: "1pt solid #9ca3af",
  },
  totalsFinalLabel: {
    fontSize: 11,
    fontWeight: "bold",
  },
  totalsFinalValue: {
    fontSize: 11,
    fontWeight: "bold",
    color: "#1d4ed8",
  },
});

interface QuotePdfDocumentProps {
  finalResult: FinalSummarizedResultResponse;
  photosByName: Record<string, { preview: string; damageOverlay?: string }>;
}

export default function QuotePdfDocument({ finalResult, photosByName }: QuotePdfDocumentProps) {
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

  const getImageSrc = (
    photo: { preview: string; damageOverlay?: string } | undefined
  ): string | null => {
    if (!photo) return null;
    if (photo.damageOverlay) {
      return `data:image/png;base64,${photo.damageOverlay}`;
    }
    if (photo.preview && photo.preview.startsWith("data:")) {
      return photo.preview;
    }
    return null;
  };

  // Data-based summary
  const { total_damage_count, estimate_damage_count, review_damage_count, image_count } =
    finalResult.analysis_result;
  const summaryText = `총 ${total_damage_count}건의 파손이 검출되었습니다. 이 중 ${estimate_damage_count}건이 견적에 포함되었으며, ${review_damage_count}건은 추가 검토가 필요합니다. ${image_count}장의 사진을 분석하여 AI가 자동으로 견적을 산출했습니다.`;

  return (
    <Document>
      {/* Page 1: Analysis Report */}
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>AI 차량 파손 검수 분석 결과</Text>
          <Text style={styles.subtitle}>
            문서번호: {finalResult.document_info.document_no || "N/A"}
          </Text>
          <Text style={styles.subtitle}>
            발행일: {finalResult.document_info.issue_date || "N/A"}
          </Text>
          {finalResult.vehicle_info.vehicle_name && (
            <Text style={styles.subtitle}>차량: {finalResult.vehicle_info.vehicle_name}</Text>
          )}
        </View>

        <View style={styles.summaryBox}>
          <Text style={styles.summaryText}>{summaryText}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>손상 항목 상세</Text>
          {finalResult.damage_sections.map((section) => (
            <View key={section.section_no} style={styles.damageItem}>
              <Text style={styles.damageItemHeader}>
                {section.section_no}. {section.panel_label || section.panel}
              </Text>
              <Text style={styles.damageItemDetail}>
                손상 유형: {section.damage_type_labels.join(", ")}
              </Text>
              <Text style={styles.damageItemDetail}>
                수리 방법: {section.repair_type_labels.join(", ")}
              </Text>
              {section.confidence_percent !== null && (
                <Text style={styles.damageItemDetail}>
                  신뢰도: {section.confidence_percent.toFixed(0)}%
                </Text>
              )}
              {section.reasoning && (
                <Text style={styles.damageItemDetail}>판단 근거: {section.reasoning}</Text>
              )}
              {section.evidence_images.length > 0 && (
                <View style={styles.evidenceImages}>
                  {section.evidence_images.slice(0, 4).map((ev, idx) => {
                    const photo = resolvePhoto(ev.image_name);
                    const imageSrc = getImageSrc(photo);
                    if (!imageSrc) return null;

                    return <Image key={idx} src={imageSrc} style={styles.evidenceImage} />;
                  })}
                </View>
              )}
            </View>
          ))}
        </View>
      </Page>

      {/* Page 2: Estimate Sheet */}
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>수리 견적서</Text>
          <Text style={styles.subtitle}>
            문서번호: {finalResult.document_info.document_no || "N/A"}
          </Text>
          <Text style={styles.subtitle}>
            발행일: {finalResult.document_info.issue_date || "N/A"}
          </Text>
        </View>

        <View style={styles.summaryBox}>
          <Text style={styles.summaryText}>{summaryText}</Text>
        </View>

        <View style={styles.section}>
          <View style={styles.table}>
            <View style={styles.tableHeader}>
              <Text style={[styles.tableCell, { width: "8%" }]}>번호</Text>
              <Text style={[styles.tableCell, { width: "25%" }]}>손상 부위</Text>
              <Text style={[styles.tableCell, { width: "30%" }]}>수리 내용</Text>
              <Text style={[styles.tableCellRight, { width: "10%" }]}>수량</Text>
              <Text style={[styles.tableCellRight, { width: "13%" }]}>단가</Text>
              <Text style={[styles.tableCellRight, { width: "14%" }]}>금액</Text>
            </View>
            {finalResult.estimate_sheet.rows.map((row) => (
              <View key={row.no} style={styles.tableRow}>
                <Text style={[styles.tableCell, { width: "8%" }]}>{row.no}</Text>
                <Text style={[styles.tableCell, { width: "25%" }]}>{row.damage_part}</Text>
                <Text style={[styles.tableCell, { width: "30%" }]}>{row.repair_content}</Text>
                <Text style={[styles.tableCellRight, { width: "10%" }]}>{row.quantity}</Text>
                <Text style={[styles.tableCellRight, { width: "13%" }]}>
                  {row.unit_price?.toLocaleString() ?? "-"}
                </Text>
                <Text style={[styles.tableCellRight, { width: "14%" }]}>
                  {row.supply_amount?.toLocaleString() ?? "-"}
                </Text>
              </View>
            ))}
          </View>

          <View style={styles.totalsSection}>
            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>공급가액:</Text>
              <Text style={styles.totalsValue}>
                {finalResult.estimate_sheet.totals.supply_amount.toLocaleString()}원
              </Text>
            </View>
            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>부가세 (10%):</Text>
              <Text style={styles.totalsValue}>
                {finalResult.estimate_sheet.totals.vat_amount.toLocaleString()}원
              </Text>
            </View>
            <View style={styles.totalsFinalRow}>
              <Text style={styles.totalsFinalLabel}>총액:</Text>
              <Text style={styles.totalsFinalValue}>
                {finalResult.estimate_sheet.totals.total_amount.toLocaleString()}원
              </Text>
            </View>
          </View>
        </View>
      </Page>
    </Document>
  );
}
