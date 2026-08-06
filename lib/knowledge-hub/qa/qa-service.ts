import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { collectMonitoring } from "../monitoring";
import { summarizePii } from "../security/pii";
import { buildQaReport, type QaIssue, type QaReport } from "./qa-model";

/**
 * خدمة الجودة الموحّدة (الجزء الثامن).
 *
 * ## البناء فوق الموجود
 *
 * `collectMonitoring` بيحسب الجودة الخماسية والعدّادات بالفعل. ده
 * **بيبني عليها** تقريرًا موحّدًا: بياخد الجودة + يضيف فحص PII على
 * محتوى العناصر + يحوّل نقاط الضعف والتعارضات والفجوات لمشاكل مصنّفة،
 * ويخزّن اللقطة.
 *
 * كل معرفة جديدة تقدر تمرّ بده تلقائيًا (المستدعي بيربطه بعد المعالجة).
 */

export interface QaRunResult {
  status: "ok" | "unavailable";
  report?: QaReport;
  message?: string;
}

export async function runQaReport(
  projectId: string,
  client?: SupabaseClient
): Promise<QaRunResult> {
  const db = client ?? createServiceClient();

  const monitoring = await collectMonitoring(projectId, db);
  if (!monitoring.ready) {
    return { status: "unavailable", message: "جداول المعرفة غير مطبَّقة بعد." };
  }

  // --- فحص PII على عيّنة من محتوى العناصر ---
  const { data: items } = await db
    .from("knowledge_items")
    .select("content")
    .eq("project_id", projectId)
    .eq("status", "active")
    .limit(1000);

  let piiFlagCount = 0;
  for (const row of (items ?? []) as Array<{ content: string }>) {
    const summary = summarizePii(row.content ?? "");
    if (Object.values(summary).some((n) => n > 0)) piiFlagCount += 1;
  }

  // --- تحويل الإشارات لمشاكل مصنّفة ---
  const issues: QaIssue[] = [];
  const q = monitoring.quality;

  for (const w of q.weaknesses) {
    issues.push({
      type: mapDimension(w.dimension),
      severity: w.score < 40 ? "high" : "medium",
      detail: w.message,
    });
  }
  if (q.contradictionCount > 0) {
    issues.push({ type: "contradiction", severity: "critical", detail: `${q.contradictionCount} تعارض مفتوح`, ref: "knowledge_conflicts" });
  }
  if (monitoring.counts.gaps > 0) {
    issues.push({ type: "incompleteness", severity: "medium", detail: `${monitoring.counts.gaps} فجوة مفتوحة`, ref: "knowledge_gaps" });
  }
  if (q.duplicateCount > 0) {
    issues.push({ type: "duplicate", severity: "low", detail: `${q.duplicateCount} عنصر مكرَّر مرشّح للدمج` });
  }
  if (piiFlagCount > 0) {
    issues.push({ type: "sensitive_data", severity: "high", detail: `${piiFlagCount} عنصر يحتوي بيانات حسّاسة محتملة`, ref: "pii" });
  }

  const report = buildQaReport({
    qualityOverall: q.overall,
    dimensions: {
      completeness: q.completeness,
      consistency: q.consistency,
      confidence: q.confidence,
      coverage: q.coverage,
      freshness: q.freshness,
    },
    issues,
    piiFlagCount,
  });

  // --- تخزين اللقطة (رشيق لو الجدول غير مطبَّق) ---
  const { error } = await db.from("knowledge_qa_reports").insert({
    project_id: projectId,
    overall_score: report.overallScore,
    dimensions: report.dimensions,
    issues: report.issues,
    issue_count: report.issueCount,
    critical_count: report.criticalCount,
    pii_flag_count: report.piiFlagCount,
  });
  if (error && error.code !== "42P01") {
    console.error(`[QA] تعذّر تخزين التقرير: ${error.message}`);
  }

  return { status: "ok", report };
}

function mapDimension(dim: string): QaIssue["type"] {
  switch (dim) {
    case "consistency":
      return "inconsistency";
    case "completeness":
      return "incompleteness";
    case "confidence":
      return "low_confidence";
    case "freshness":
      return "staleness";
    default:
      return "incompleteness";
  }
}
