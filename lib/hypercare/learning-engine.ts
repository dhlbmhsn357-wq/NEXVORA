/**
 * محرّك التعلّم المستمر (Continuous Learning) — **وحدة نقية بلا I/O**.
 *
 * بعد حلّ حادثة، يستخرج درسًا. **لا يُضاف مباشرة** — يُنشئ Knowledge
 * Suggestion يراجعه المدير، وإن وافق يُضاف للذاكرة المؤسسية. الأنماط
 * المتكرّرة تُقترَح كمعايير (Standard) أو قواعد مجال (Domain Rule).
 */

import type { KnowledgeSuggestionDraft } from "./hypercare-types";

interface ResolvedIncident {
  title: string;
  severity: string;
  rootCause: string | null;
  resolution: string | null;
  affectedModules: string[];
}

/** يستخرج درسًا مستفادًا من حادثة محلولة (اقتراح معرفة، لا إضافة). */
export function extractLesson(inc: ResolvedIncident): KnowledgeSuggestionDraft {
  const cause = inc.rootCause ?? "غير محدّد";
  const fix = inc.resolution ?? "غير محدّد";
  return {
    kind: "lesson",
    title: `درس: ${inc.title}`.slice(0, 120),
    content: `المشكلة: ${inc.title}. الجذر: ${cause}. الحلّ: ${fix}. الوحدات: ${inc.affectedModules.join("، ") || "—"}.`,
    confidence: inc.severity === "critical" || inc.severity === "high" ? 85 : 70,
  };
}

/** يقترح ترقية نمط متكرّر إلى معيار/قاعدة مجال (لا إضافة تلقائية). */
export function proposeStandard(patternKey: string, count: number, domain: string): KnowledgeSuggestionDraft {
  return {
    kind: count >= 3 ? "pattern" : "business_rule",
    title: `نمط متكرّر (${count}×): ${patternKey}`,
    content: `تكرّر هذا النمط ${count} مرّات في مجال ${domain} — يُقترَح تحويله إلى معيار داخل Knowledge Hub / قاعدة مجال لتستفيد منه المشاريع القادمة.`,
    confidence: Math.min(90, 60 + count * 8),
  };
}
