import { RECOMMENDATION_CATEGORY_LABELS } from "@/lib/organizational-intelligence/recommendation-labels";
import type { EvidenceRef } from "@/lib/discovery-analysis/types";
import type { ArchitectureValidationReport, ProjectRecommendation } from "@/lib/types/database";
import type { BrainSectionKey, PriorityLevel, SuggestionItem } from "./types";

/**
 * منطق نقي لتحويل التوصيات المعمارية والفنية المقبولة إلى محتوى Brain.
 * منفصل عن قاعدة البيانات بالكامل عشان يكون قابلًا للاختبار.
 *
 * قرار التصميم: كل التوصيات بتتحوّل لـ SuggestionItem — لأن ده بالظبط
 * شكلها (عنوان + مبرّر + أولوية + دليل). التكاملات بتروح لقسم التكاملات
 * المقترحة، وأي حاجة تانية لقسم المزايا المقترحة، مع وسم التصنيف في
 * العنوان عشان الطابع المعماري/الفني ما يضيعش.
 */

/** القسم اللي بتتكتب فيه التوصية داخل الـ Brain. */
export function targetSectionForRecommendation(
  category: ProjectRecommendation["category"]
): Extract<BrainSectionKey, "suggested_features" | "suggested_integrations"> {
  return category === "integration" ? "suggested_integrations" : "suggested_features";
}

/** أولوية الـ Brain (high/medium/low) من أولوية التوصية (اللي فيها critical كمان). */
export function toBrainPriority(priority: string | null): PriorityLevel {
  if (priority === "critical" || priority === "high") return "high";
  if (priority === "low") return "low";
  return "medium";
}

/**
 * عنوان موحّد للتوصية داخل الـ Brain — موسوم بتصنيفها عشان يفضل واضح
 * إنها توصية معمارية/فنية معتمدة، ويسهّل التعرّف عليها لتفادي التكرار.
 */
export function recommendationBrainTitle(rec: ProjectRecommendation): string {
  const label = RECOMMENDATION_CATEGORY_LABELS[rec.category] ?? rec.category;
  const body = rec.recommendation.trim();
  const short = body.length > 110 ? `${body.slice(0, 110)}…` : body;
  return `[${label}] ${short}`;
}

/** تسميات مصدر الدليل — عشان الأصل يفضل واضحًا مش مجهولًا. */
const EVIDENCE_SOURCE_LABELS: Record<string, string> = {
  similarity: "مشاريع سابقة مشابهة",
  knowledge_graph: "تحليل شبكة المعرفة",
  both: "مشاريع سابقة مشابهة + شبكة المعرفة",
};

/**
 * دليل التوصية — مصدرها الحقيقي المتتبَّع، مش اقتباس من إجابات العميل.
 * المرجع بيشاور على صف التوصية نفسه (recommendation:<id>) فيفضل قابلًا
 * للتتبّع، والاقتباس هو مبرّر التوصية الفعلي. كده «لا معلومة بلا دليل»
 * بتفضل صحيحة من غير ما نخترع اقتباسًا من العميل.
 */
export function recommendationEvidence(rec: ProjectRecommendation): EvidenceRef[] {
  const categoryLabel = RECOMMENDATION_CATEGORY_LABELS[rec.category] ?? rec.category;
  const sourceLabel = EVIDENCE_SOURCE_LABELS[rec.evidence_source] ?? "تحليل داخلي";
  const quote = rec.rationale?.trim() || rec.recommendation.trim();

  return [
    {
      question_id: `recommendation:${rec.id}`,
      question_label: `توصية معتمدة (${categoryLabel}) — المصدر: ${sourceLabel}`,
      quote,
    },
  ];
}

/** يحوّل توصية مقبولة لعنصر Brain جاهز للإدراج. */
export function recommendationToSuggestion(rec: ProjectRecommendation): SuggestionItem {
  return {
    title: recommendationBrainTitle(rec),
    rationale: rec.rationale?.trim() || "توصية معمارية/فنية معتمدة من مرحلة التوصيات الذكية.",
    priority: toBrainPriority(rec.priority),
    evidence: recommendationEvidence(rec),
  };
}

/**
 * يدمج عناصر جديدة مع الموجود من غير تكرار (المقارنة بالعنوان بعد
 * التطبيع). بيرجّع القائمة النهائية وعدد المضاف فعليًا — عشان نقدر
 * نقول للمستخدم "اتضاف كام" بدقة بدل رقم تقديري.
 *
 * كمان بيصلّح العناصر المضافة قبل كده بدليل فاضي: لو العنصر موجود
 * بنفس العنوان لكن بلا evidence والوارد الجديد معاه دليل، بنستبدله —
 * فتشغيل المزامنة تاني بيداوي أي محتوى قديم بدل ما يتجاهله بصمت.
 */
export function mergeSuggestions(
  existing: SuggestionItem[],
  incoming: SuggestionItem[]
): { merged: SuggestionItem[]; addedCount: number; backfilledCount: number } {
  const normalize = (t: string) => t.trim().toLowerCase().replace(/\s+/g, " ");
  const indexByTitle = new Map(existing.map((s, i) => [normalize(s.title), i]));
  const merged = [...existing];
  let addedCount = 0;
  let backfilledCount = 0;

  for (const item of incoming) {
    const key = normalize(item.title);
    const existingIndex = indexByTitle.get(key);

    if (existingIndex === undefined) {
      indexByTitle.set(key, merged.length);
      merged.push(item);
      addedCount++;
      continue;
    }

    const current = merged[existingIndex];
    const currentHasEvidence = (current.evidence?.length ?? 0) > 0;
    const incomingHasEvidence = (item.evidence?.length ?? 0) > 0;
    if (!currentHasEvidence && incomingHasEvidence) {
      merged[existingIndex] = { ...current, evidence: item.evidence };
      backfilledCount++;
    }
  }
  return { merged, addedCount, backfilledCount };
}

/**
 * القرار المعماري (تقرير الذكاء المعماري) كعنصر Brain واحد — ملخّص
 * القرار + الوحدات الناقصة، بيتكتب في المزايا المقترحة زي باقي
 * التوصيات عشان يفضل مرئيًا في الوثيقة نفسها مش في لوحة منفصلة.
 */
export function architectureReportToSuggestion(
  report: ArchitectureValidationReport
): SuggestionItem | null {
  const summary = report.ai_summary?.trim();
  const missing = report.missing_modules.map((m) => m.name).filter(Boolean);
  if (!summary && missing.length === 0) return null;

  const parts: string[] = [];
  if (summary) parts.push(summary);
  if (missing.length > 0) parts.push(`وحدات مطلوبة ناقصة: ${missing.join("، ")}.`);
  parts.push(`جاهزية معمارية وقت الاعتماد: ${report.readiness_score}%.`);

  return {
    title: "[القرار المعماري] الأساس المعماري المعتمد قبل الـ PRD",
    rationale: parts.join(" "),
    priority: "high",
    evidence: [
      {
        question_id: `architecture_report:${report.id}`,
        question_label: `القرار المعماري — تحليل معماري${report.domain ? ` (مجال: ${report.domain})` : ""}`,
        quote: summary || parts.join(" "),
      },
    ],
  };
}

/** تجميع التوصيات المقبولة حسب القسم المستهدف — جاهزة للكتابة. */
export function groupAcceptedRecommendations(
  recommendations: ProjectRecommendation[]
): Record<"suggested_features" | "suggested_integrations", SuggestionItem[]> {
  const grouped: Record<"suggested_features" | "suggested_integrations", SuggestionItem[]> = {
    suggested_features: [],
    suggested_integrations: [],
  };
  for (const rec of recommendations) {
    if (rec.status !== "accepted") continue;
    grouped[targetSectionForRecommendation(rec.category)].push(recommendationToSuggestion(rec));
  }
  return grouped;
}
