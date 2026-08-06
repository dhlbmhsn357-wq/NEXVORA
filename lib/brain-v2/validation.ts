import { BRAIN_SECTIONS, type BrainContent, type BrainSectionKey } from "./types";

export interface BrainValidationIssue {
  section: BrainSectionKey;
  code: "empty_required" | "missing_evidence" | "duplicate" | "invalid_confidence";
  message: string;
}

export interface BrainValidationResult {
  ok: boolean;
  issues: BrainValidationIssue[];
}

/**
 * الحقول الإلزامية قبل الاعتماد. business_rules/missing_information اختيارية.
 * meeting_questions/missing_information ما فيهاش evidence بطبيعتها → استثناء.
 */
const REQUIRED_SECTIONS: BrainSectionKey[] = [
  "executive_summary",
  "business_model",
  "business_goals",
  "functional_requirements",
  "project_scope",
];

const NO_EVIDENCE_REQUIRED: BrainSectionKey[] = [
  "meeting_questions",
  "missing_information",
  "business_rules", // اختياري
  // المقترحات (مزايا/تكاملات) بطبيعتها اقتراحات مستقبلية مش وقائع
  // مستخرجة من كلام العميل — مصدرها ممكن يكون توصية معمارية أو إضافة
  // يدوية من الـ PM. اشتراط اقتباس لكل مقترح كان بيقفل اعتماد الـ Brain
  // بالكامل بسبب اقتراح. الوقائع (متطلبات/مخاطر/افتراضات/أصحاب مصلحة…)
  // لسه مشروطة بالدليل زي ما هي.
  "suggested_features",
  "suggested_integrations",
];

/**
 * تجميع دلائل قسم إلى كل الـ evidence[] الموجودة في محتواه (لفحص المفقود).
 * نتخطى الأقسام غير القائمة على قوائم evidence.
 */
function itemsHaveEvidence(section: BrainSectionKey, content: unknown): boolean {
  if (NO_EVIDENCE_REQUIRED.includes(section)) return true;
  if (section === "executive_summary") return true; // Evidence على مستوى meta
  if (section === "business_model") return true; // meta.evidence هي الأساس
  if (section === "non_functional_requirements") {
    const c = content as Record<string, Array<{ evidence?: unknown[] }>>;
    for (const arr of Object.values(c)) {
      for (const it of arr) if (!it?.evidence || (it.evidence as unknown[]).length === 0) return false;
    }
    return true;
  }
  if (section === "project_scope") {
    const c = content as { in_scope?: Array<{ evidence?: unknown[] }>; out_of_scope?: Array<{ evidence?: unknown[] }> };
    for (const it of c.in_scope ?? []) if (!it?.evidence || (it.evidence as unknown[]).length === 0) return false;
    for (const it of c.out_of_scope ?? []) if (!it?.evidence || (it.evidence as unknown[]).length === 0) return false;
    return true;
  }
  if (Array.isArray(content)) {
    for (const it of content as Array<{ evidence?: unknown[] }>) {
      if (!it?.evidence || (it.evidence as unknown[]).length === 0) return false;
    }
  }
  return true;
}

function isEmpty(section: BrainSectionKey, content: unknown): boolean {
  if (section === "executive_summary") return typeof content !== "string" || !content.trim();
  if (section === "business_model") {
    const c = content as { overview?: string };
    return !c?.overview?.trim();
  }
  if (section === "non_functional_requirements") {
    const c = content as Record<string, unknown[]>;
    return Object.values(c).every((v) => !Array.isArray(v) || v.length === 0);
  }
  if (section === "project_scope") {
    const c = content as { in_scope?: unknown[]; out_of_scope?: unknown[] };
    return (c?.in_scope?.length ?? 0) === 0 && (c?.out_of_scope?.length ?? 0) === 0;
  }
  return !Array.isArray(content) || content.length === 0;
}

/**
 * فحص التكرار داخل قسم واحد — يعتمد على الحقل النصي الرئيسي في كل نوع.
 */
function findDuplicates(section: BrainSectionKey, content: unknown): number {
  if (!Array.isArray(content)) return 0;
  const keyOf = (it: unknown): string | null => {
    if (typeof it !== "object" || it === null) return null;
    const rec = it as Record<string, unknown>;
    const candidate =
      rec.statement ?? rec.rule ?? rec.constraint ?? rec.fact ?? rec.risk ?? rec.title ?? rec.goal ?? rec.info ?? rec.question ?? rec.role ?? rec.name ?? rec.phase;
    return typeof candidate === "string" ? candidate.trim().toLowerCase() : null;
  };
  const seen = new Set<string>();
  let dups = 0;
  for (const it of content) {
    const k = keyOf(it);
    if (!k) continue;
    if (seen.has(k)) dups++;
    seen.add(k);
  }
  return dups;
}

/**
 * Validator كامل قبل الاعتماد — يرجّع كل المشاكل مش أول واحدة فقط عشان
 * الـ PM يقدر يعالجها كلها مرة واحدة.
 */
export function validateBrainForApproval(content: BrainContent): BrainValidationResult {
  const issues: BrainValidationIssue[] = [];

  for (const key of BRAIN_SECTIONS) {
    const section = content[key];
    if (!section) {
      issues.push({ section: key, code: "empty_required", message: `القسم "${key}" مفقود.` });
      continue;
    }

    const confidence = section.meta?.confidence;
    if (typeof confidence !== "number" || confidence < 0 || confidence > 100) {
      issues.push({
        section: key,
        code: "invalid_confidence",
        message: `درجة الثقة غير صالحة في القسم "${key}".`,
      });
    }

    if (REQUIRED_SECTIONS.includes(key) && isEmpty(key, section.content)) {
      issues.push({
        section: key,
        code: "empty_required",
        message: `القسم "${key}" إلزامي ولا يمكن اعتماد Brain بدونه.`,
      });
    }

    if (!isEmpty(key, section.content) && !itemsHaveEvidence(key, section.content)) {
      issues.push({
        section: key,
        code: "missing_evidence",
        message: `في القسم "${key}" عناصر بلا evidence.`,
      });
    }

    const dupCount = findDuplicates(key, section.content);
    if (dupCount > 0) {
      issues.push({
        section: key,
        code: "duplicate",
        message: `في القسم "${key}" ${dupCount} عنصر مكرر.`,
      });
    }
  }

  return { ok: issues.length === 0, issues };
}
