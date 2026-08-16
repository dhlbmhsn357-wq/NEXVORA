import type { UserRole } from "@/lib/types/database";

/**
 * الأسئلة المقترحة لمساعد المشروع (Phase D) — دالة نقية بالكامل، بلا AI
 * ولا I/O. الهدف: نقطة بداية سريعة للمستخدم في المحادثة الفاضية، مش
 * توليد ديناميكي — القائمة ثابتة نصيًا (مطابقة حرفيًا لأمثلة المواصفة)
 * ومفلترة حسب:
 *   • الدور/زاوية النظر (viewpoint) — business-leaning لصاحب/مدير، developer-leaning للمطوّر.
 *   • توفّر معرفة فعلية في الدومين المرتبط (knowledgeSummary) — لا فايدة
 *     من اقتراح سؤال عن Acceptance Criteria لو مفيش أي acceptance_criteria
 *     مفهرسة أصلًا (هيرجع not_found حتمي بلا داعي).
 */

export type ProjectAssistantViewpoint = "business" | "developer" | "general";

interface KnowledgeCount {
  domain: string;
  count: number;
}

interface SuggestedQuestion {
  text: string;
  /** لو محدَّد، السؤال ده بيتشال لو الدومين ده count=0 في knowledgeSummary. */
  requiresDomain?: string;
}

// نفس نصوص المواصفة حرفيًا — ما تتغيّرش.
const BUSINESS_QUESTIONS: SuggestedQuestion[] = [
  { text: "ما الذي تم اعتماده حتى الآن؟", requiresDomain: "decision" },
  { text: "ما أهم القرارات المفتوحة؟", requiresDomain: "decision" },
  { text: "ما الذي تغير مؤخرًا؟" },
  { text: "هل هذه الخاصية ضمن النطاق؟", requiresDomain: "requirement" },
];

const DEVELOPER_QUESTIONS: SuggestedQuestion[] = [
  { text: "ما قواعد هذا الجزء من النظام؟", requiresDomain: "business_rule" },
  { text: "ما Acceptance Criteria لهذه الخاصية؟", requiresDomain: "acceptance_criteria" },
  { text: "ما الحالات الاستثنائية المعروفة؟" },
  { text: "هل هذا السلوك معتمد؟" },
  { text: "لماذا تم اتخاذ هذا القرار؟", requiresDomain: "decision" },
];

// أسئلة عامة محايدة — تُستخدم كـ fallback أو تُضاف دايمًا بغضّ النظر عن الدور.
const GENERAL_QUESTIONS: SuggestedQuestion[] = [
  { text: "ما الذي أعرفه عن المشروع الآن؟" },
  { text: "ما الذي تغير مؤخرًا؟" },
];

const MIN_QUESTIONS = 4;
const MAX_QUESTIONS = 6;

function domainHasKnowledge(domain: string | undefined, knowledgeSummary: KnowledgeCount[]): boolean {
  if (!domain) return true;
  const entry = knowledgeSummary.find((k) => k.domain === domain);
  return (entry?.count ?? 0) > 0;
}

/**
 * يرجّع 4-6 أسئلة مقترحة، مفلترة حسب الدور/الزاوية وتوفّر معرفة فعلية.
 * الدور: owner/admin بيميلوا business-leaning افتراضيًا لو viewpoint='general'؛
 * member/supervisor بيميلوا developer-leaning لو viewpoint='general' —
 * تقريب بسيط مقصود (مفيش "دور" رسمي بيحدد الزاوية في الكودبيز، فالمصدر
 * الأساسي هو `viewpoint` الصريح لو موجود).
 */
export function getSuggestedQuestions(
  role: UserRole,
  viewpoint: ProjectAssistantViewpoint,
  knowledgeSummary: KnowledgeCount[]
): string[] {
  const effectiveViewpoint: ProjectAssistantViewpoint =
    viewpoint !== "general" ? viewpoint : role === "owner" || role === "admin" ? "business" : "developer";

  const leaning = effectiveViewpoint === "business" ? BUSINESS_QUESTIONS : DEVELOPER_QUESTIONS;

  const filtered = [...leaning, ...GENERAL_QUESTIONS].filter((q) => domainHasKnowledge(q.requiresDomain, knowledgeSummary));

  // إزالة تكرار نصي (مثلًا "ما الذي تغير مؤخرًا؟" موجود في GENERAL_QUESTIONS).
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const q of filtered) {
    if (seen.has(q.text)) continue;
    seen.add(q.text);
    deduped.push(q.text);
  }

  if (deduped.length >= MIN_QUESTIONS) return deduped.slice(0, MAX_QUESTIONS);

  // مفيش معرفة كفاية لملء 4 — نضيف من القائمة التانية (business/developer)
  // كـ fallback، برضو مفلترة بنفس الشرط، عشان دايمًا نوصل لأقل حد 4 لو
  // فيه أي معرفة على الإطلاق.
  const other = effectiveViewpoint === "business" ? DEVELOPER_QUESTIONS : BUSINESS_QUESTIONS;
  for (const q of other) {
    if (deduped.length >= MAX_QUESTIONS) break;
    if (!domainHasKnowledge(q.requiresDomain, knowledgeSummary)) continue;
    if (seen.has(q.text)) continue;
    seen.add(q.text);
    deduped.push(q.text);
  }

  return deduped.slice(0, MAX_QUESTIONS);
}
