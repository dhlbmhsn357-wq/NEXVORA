import type {
  AssumptionItem,
  DiscoveryAnalysisOutput,
  EvidenceItem,
  EvidenceRef,
  SectionConfidence,
  SuggestionItem,
} from "./types";
import { backfillMissingEvidence } from "./repair";

export type ValidationResult =
  | { ok: true; data: DiscoveryAnalysisOutput }
  | { ok: false; reason: string };

const PRIORITY = ["high", "medium", "low"];

/**
 * استخراج كائن JSON من رد الـ AI الخام بشكل متسامح — الموديل أحيانًا بيلف
 * الـ JSON في code fences، أو بيسبقه/يتبعه بكلام، أو بيحط فاصلة زائدة قبل
 * قوس الإغلاق. بنجرّب بالترتيب: (1) parse مباشر، (2) بعد إزالة fences،
 * (3) اقتصاص من أول "{" لآخر "}"، (4) إزالة الفواصل الزائدة. بيرجّع الكائن
 * المُحلَّل أو null لو كل المحاولات فشلت (يعني الرد تالف/مقطوع فعلًا).
 */
export function extractJsonObject(raw: string): unknown | null {
  const attempts: string[] = [];
  const trimmed = raw.trim();
  attempts.push(trimmed);

  // إزالة code fences من أول/آخر النص لو موجودة
  let noFence = trimmed;
  if (noFence.startsWith("```")) {
    noFence = noFence.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
    attempts.push(noFence);
  }

  // اقتصاص من أول "{" لآخر "}" — يشيل أي كلام قبل/بعد الـ JSON
  const first = noFence.indexOf("{");
  const last = noFence.lastIndexOf("}");
  if (first !== -1 && last !== -1 && last > first) {
    attempts.push(noFence.slice(first, last + 1));
  }

  for (const candidate of attempts) {
    // (أ) محاولة مباشرة
    const direct = tryParse(candidate);
    if (direct !== undefined) return direct;
    // (ب) بعد إزالة الفواصل الزائدة قبل } أو ]
    const noTrailing = candidate.replace(/,(\s*[}\]])/g, "$1");
    if (noTrailing !== candidate) {
      const cleaned = tryParse(noTrailing);
      if (cleaned !== undefined) return cleaned;
    }
  }
  return null;
}

function tryParse(text: string): unknown | undefined {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function isStr(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}
function isArr(v: unknown): v is unknown[] {
  return Array.isArray(v);
}
function isNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}
function isPriority(v: unknown): v is "high" | "medium" | "low" {
  return typeof v === "string" && PRIORITY.includes(v);
}

function checkEvidenceRef(v: unknown, path: string): string | null {
  if (!isObj(v)) return `${path}: ليس كائنًا`;
  // الدليل الفعلي هو الاقتباس (quote) — هو المطلوب إلزاميًا لتحقيق قاعدة
  // "لا معلومة بلا دليل". أما question_id / question_label فمؤشّرات تتبّع
  // best-effort (بنملأ الفاضي منها لاحقًا من لقطة القالب في الـ Agent).
  // لو أي منهما موجود لازم يكون نصًا، لكن فراغه لا يُبطل التحليل.
  if (!isStr(v.quote)) return `${path}.quote فارغ`;
  if (v.question_id !== undefined && typeof v.question_id !== "string") {
    return `${path}.question_id نوعه غير صحيح`;
  }
  if (v.question_label !== undefined && typeof v.question_label !== "string") {
    return `${path}.question_label نوعه غير صحيح`;
  }
  return null;
}
function checkEvidenceArray(v: unknown, path: string, minOne = true): string | null {
  if (!isArr(v)) return `${path} ليست مصفوفة`;
  if (minOne && v.length === 0) return `${path} فارغة — كل عنصر يجب أن يحمل evidence`;
  for (let i = 0; i < v.length; i++) {
    const err = checkEvidenceRef(v[i], `${path}[${i}]`);
    if (err) return err;
  }
  return null;
}
function checkConfidence(v: unknown, path: string): string | null {
  if (!isObj(v)) return `${path} ليست كائن confidence`;
  if (!isNum(v.score) || v.score < 0 || v.score > 100) {
    return `${path}.score يجب أن يكون رقمًا 0..100`;
  }
  if (v.reason !== null && !isStr(v.reason)) {
    return `${path}.reason يجب أن يكون نصًا أو null`;
  }
  return null;
}

function checkEvidenceItem(v: unknown, path: string): string | null {
  if (!isObj(v)) return `${path} ليس كائنًا`;
  if (!isStr(v.statement)) return `${path}.statement فارغ`;
  const err = checkEvidenceArray(v.evidence, `${path}.evidence`);
  if (err) return err;
  return null;
}
function checkAssumption(v: unknown, path: string): string | null {
  if (!isObj(v)) return `${path} ليس كائنًا`;
  if (!isStr(v.statement)) return `${path}.statement فارغ`;
  if (!isStr(v.reason)) return `${path}.reason فارغ`;
  return checkEvidenceArray(v.evidence, `${path}.evidence`);
}
function checkSuggestion(v: unknown, path: string): string | null {
  if (!isObj(v)) return `${path} ليس كائنًا`;
  if (!isStr(v.title)) return `${path}.title فارغ`;
  if (!isStr(v.rationale)) return `${path}.rationale فارغ`;
  if (!isPriority(v.priority)) return `${path}.priority غير صالح`;
  return checkEvidenceArray(v.evidence, `${path}.evidence`);
}

function checkItemsArray(
  v: unknown,
  path: string,
  itemChecker: (item: unknown, path: string) => string | null,
  allowEmpty = true
): string | null {
  if (!isArr(v)) return `${path} ليست مصفوفة`;
  if (!allowEmpty && v.length === 0) return `${path} فارغة`;
  for (let i = 0; i < v.length; i++) {
    const err = itemChecker(v[i], `${path}[${i}]`);
    if (err) return err;
  }
  return null;
}

const PRIORITY_SYNONYMS: Record<string, "high" | "medium" | "low"> = {
  high: "high",
  medium: "medium",
  low: "low",
  عالية: "high",
  عالي: "high",
  مرتفعة: "high",
  مرتفع: "high",
  متوسطة: "medium",
  متوسط: "medium",
  منخفضة: "low",
  منخفض: "low",
};
const PRIORITY_KEYS = new Set(["priority", "influence", "likelihood", "impact"]);

/**
 * تطبيع موضعي (in-place) لكائن الرد قبل الفحص. آمن: يعالج فقط
 * الاختلافات التجميلية المعروفة دون تغيير أي محتوى نصّي.
 */
function normalizeInPlace(node: unknown): void {
  if (Array.isArray(node)) {
    for (const child of node) normalizeInPlace(child);
    return;
  }
  if (!node || typeof node !== "object") return;
  const rec = node as Record<string, unknown>;

  for (const key of Object.keys(rec)) {
    const val = rec[key];

    // confidence.score كنص رقمي → رقم مقصوص 0..100
    if (key === "score" && typeof val === "string" && val.trim() !== "" && !Number.isNaN(Number(val))) {
      rec[key] = Math.max(0, Math.min(100, Math.round(Number(val))));
      continue;
    }

    // أولوية بحروف كبيرة أو بالعربي → enum الصحيح
    if (PRIORITY_KEYS.has(key) && typeof val === "string") {
      const normalized = PRIORITY_SYNONYMS[val.trim().toLowerCase()] ?? PRIORITY_SYNONYMS[val.trim()];
      if (normalized) {
        rec[key] = normalized;
        continue;
      }
    }

    normalizeInPlace(val);
  }
}

/**
 * يتحقق من رد الـ AI الخام قبل حفظه. لا يُحفظ أي شيء إذا فشل الفحص.
 * أي حقل مطلوب مفقود / evidence فارغة / أنواع خطأ → مرفوض.
 */
export function validateDiscoveryAnalysis(raw: string | null): ValidationResult {
  if (!raw || raw.trim().length === 0) {
    return { ok: false, reason: "الرد فارغ." };
  }

  const p = extractJsonObject(raw);
  if (p === null) return { ok: false, reason: "الرد ليس JSON صالحًا." };
  if (!isObj(p)) return { ok: false, reason: "الجذر ليس كائنًا." };

  // تطبيع لطيف قبل الفحص — يعالج اختلافات AI التجميلية الشائعة بدل الرفض:
  // رقم confidence كنص، أولوية بحروف كبيرة أو بالعربي. لا يمس أي محتوى فعلي.
  normalizeInPlace(p);

  // إصلاح ذاتي: مصفوفات evidence الفاضية/المعطوبة بتتملي بدليل «استنتاج»
  // صريح (بثقة مخفّضة) بدل ما ترفض التحليل كله — راجع repair.ts.
  const evidenceRepairs = backfillMissingEvidence(p);
  if (evidenceRepairs > 0) {
    console.warn(`[DiscoveryAnalysis] backfilled ${evidenceRepairs} empty evidence array(s)`);
  }

  // --- executive_summary ---
  const es = p.executive_summary;
  if (!isObj(es)) return { ok: false, reason: "executive_summary مفقود." };
  if (!isStr(es.summary)) return { ok: false, reason: "executive_summary.summary فارغ." };
  {
    const err =
      checkConfidence(es.confidence, "executive_summary.confidence") ||
      checkEvidenceArray(es.evidence, "executive_summary.evidence");
    if (err) return { ok: false, reason: err };
  }

  // --- business_model ---
  const bm = p.business_model;
  if (!isObj(bm)) return { ok: false, reason: "business_model مفقود." };
  for (const k of ["overview", "how_it_works", "value_delivery", "users_description"] as const) {
    if (!isStr(bm[k])) return { ok: false, reason: `business_model.${k} فارغ.` };
  }
  {
    const err =
      checkConfidence(bm.confidence, "business_model.confidence") ||
      checkEvidenceArray(bm.evidence, "business_model.evidence");
    if (err) return { ok: false, reason: err };
  }

  // --- stakeholders ---
  const sh = p.stakeholders;
  if (!isObj(sh)) return { ok: false, reason: "stakeholders مفقود." };
  {
    const err =
      checkItemsArray(sh.items, "stakeholders.items", (it, path) => {
        if (!isObj(it)) return `${path} ليس كائنًا`;
        if (!isStr(it.name)) return `${path}.name فارغ`;
        if (!isStr(it.role)) return `${path}.role فارغ`;
        if (!isPriority(it.influence)) return `${path}.influence غير صالح`;
        return checkEvidenceArray(it.evidence, `${path}.evidence`);
      }) || checkConfidence(sh.confidence, "stakeholders.confidence");
    if (err) return { ok: false, reason: err };
  }

  // --- business_goals ---
  const bg = p.business_goals;
  if (!isObj(bg)) return { ok: false, reason: "business_goals مفقود." };
  {
    const err =
      checkItemsArray(bg.items, "business_goals.items", (it, path) => {
        if (!isObj(it)) return `${path} ليس كائنًا`;
        if (!isStr(it.goal)) return `${path}.goal فارغ`;
        if (!isPriority(it.priority)) return `${path}.priority غير صالح`;
        return checkEvidenceArray(it.evidence, `${path}.evidence`);
      }) || checkConfidence(bg.confidence, "business_goals.confidence");
    if (err) return { ok: false, reason: err };
  }

  // --- functional_requirements ---
  const fr = p.functional_requirements;
  if (!isObj(fr)) return { ok: false, reason: "functional_requirements مفقود." };
  {
    const err =
      checkItemsArray(fr.items, "functional_requirements.items", checkEvidenceItem) ||
      checkConfidence(fr.confidence, "functional_requirements.confidence");
    if (err) return { ok: false, reason: err };
  }

  // --- non_functional_requirements ---
  const nfr = p.non_functional_requirements;
  if (!isObj(nfr)) return { ok: false, reason: "non_functional_requirements مفقود." };
  for (const cat of [
    "performance",
    "security",
    "scalability",
    "availability",
    "accessibility",
    "compliance",
  ] as const) {
    const err = checkItemsArray(nfr[cat], `non_functional_requirements.${cat}`, checkEvidenceItem);
    if (err) return { ok: false, reason: err };
  }
  {
    const err = checkConfidence(nfr.confidence, "non_functional_requirements.confidence");
    if (err) return { ok: false, reason: err };
  }

  // --- risks ---
  const rk = p.risks;
  if (!isObj(rk)) return { ok: false, reason: "risks مفقود." };
  {
    const err =
      checkItemsArray(rk.items, "risks.items", (it, path) => {
        if (!isObj(it)) return `${path} ليس كائنًا`;
        if (!isStr(it.risk)) return `${path}.risk فارغ`;
        if (!isStr(it.cause)) return `${path}.cause فارغ`;
        if (!isPriority(it.likelihood)) return `${path}.likelihood غير صالح`;
        if (!isPriority(it.impact)) return `${path}.impact غير صالح`;
        return checkEvidenceArray(it.evidence, `${path}.evidence`);
      }) || checkConfidence(rk.confidence, "risks.confidence");
    if (err) return { ok: false, reason: err };
  }

  // --- assumptions ---
  const asm = p.assumptions;
  if (!isObj(asm)) return { ok: false, reason: "assumptions مفقود." };
  {
    const err =
      checkItemsArray(asm.items, "assumptions.items", checkAssumption) ||
      checkConfidence(asm.confidence, "assumptions.confidence");
    if (err) return { ok: false, reason: err };
  }

  // --- missing_information (no evidence required) ---
  const mi = p.missing_information;
  if (!isObj(mi)) return { ok: false, reason: "missing_information مفقود." };
  {
    const err =
      checkItemsArray(mi.items, "missing_information.items", (it, path) => {
        if (!isObj(it)) return `${path} ليس كائنًا`;
        if (!isStr(it.info)) return `${path}.info فارغ`;
        if (!isPriority(it.impact)) return `${path}.impact غير صالح`;
        if (!isStr(it.reason)) return `${path}.reason فارغ`;
        return null;
      }) || checkConfidence(mi.confidence, "missing_information.confidence");
    if (err) return { ok: false, reason: err };
  }

  // --- suggested_features / integrations ---
  for (const key of ["suggested_features", "suggested_integrations"] as const) {
    const s = p[key];
    if (!isObj(s)) return { ok: false, reason: `${key} مفقود.` };
    const err =
      checkItemsArray(s.items, `${key}.items`, checkSuggestion) ||
      checkConfidence(s.confidence, `${key}.confidence`);
    if (err) return { ok: false, reason: err };
  }

  // --- suggested_user_roles ---
  const sur = p.suggested_user_roles;
  if (!isObj(sur)) return { ok: false, reason: "suggested_user_roles مفقود." };
  {
    const err =
      checkItemsArray(sur.items, "suggested_user_roles.items", (it, path) => {
        if (!isObj(it)) return `${path} ليس كائنًا`;
        if (!isStr(it.role)) return `${path}.role فارغ`;
        if (!isArr(it.responsibilities) || !it.responsibilities.every(isStr)) {
          return `${path}.responsibilities يجب أن تكون مصفوفة نصوص`;
        }
        return checkEvidenceArray(it.evidence, `${path}.evidence`);
      }) || checkConfidence(sur.confidence, "suggested_user_roles.confidence");
    if (err) return { ok: false, reason: err };
  }

  // --- suggested_kpis ---
  const kp = p.suggested_kpis;
  if (!isObj(kp)) return { ok: false, reason: "suggested_kpis مفقود." };
  {
    const err =
      checkItemsArray(kp.items, "suggested_kpis.items", (it, path) => {
        if (!isObj(it)) return `${path} ليس كائنًا`;
        if (!isStr(it.name)) return `${path}.name فارغ`;
        if (!isStr(it.target_or_direction)) return `${path}.target_or_direction فارغ`;
        if (!isStr(it.goal_link)) return `${path}.goal_link فارغ`;
        return checkEvidenceArray(it.evidence, `${path}.evidence`);
      }) || checkConfidence(kp.confidence, "suggested_kpis.confidence");
    if (err) return { ok: false, reason: err };
  }

  // --- suggested_user_stories ---
  const us = p.suggested_user_stories;
  if (!isObj(us)) return { ok: false, reason: "suggested_user_stories مفقود." };
  {
    const err =
      checkItemsArray(us.items, "suggested_user_stories.items", (it, path) => {
        if (!isObj(it)) return `${path} ليس كائنًا`;
        if (!isStr(it.role)) return `${path}.role فارغ`;
        if (!isStr(it.want)) return `${path}.want فارغ`;
        if (!isStr(it.benefit)) return `${path}.benefit فارغ`;
        if (!isPriority(it.priority)) return `${path}.priority غير صالح`;
        return checkEvidenceArray(it.evidence, `${path}.evidence`);
      }) || checkConfidence(us.confidence, "suggested_user_stories.confidence");
    if (err) return { ok: false, reason: err };
  }

  // --- suggested_project_scope ---
  const sc = p.suggested_project_scope;
  if (!isObj(sc)) return { ok: false, reason: "suggested_project_scope مفقود." };
  {
    const err =
      checkItemsArray(sc.in_scope, "suggested_project_scope.in_scope", checkEvidenceItem) ||
      checkItemsArray(sc.out_of_scope, "suggested_project_scope.out_of_scope", checkEvidenceItem) ||
      checkConfidence(sc.confidence, "suggested_project_scope.confidence");
    if (err) return { ok: false, reason: err };
  }

  // --- suggested_roadmap ---
  const rm = p.suggested_roadmap;
  if (!isObj(rm)) return { ok: false, reason: "suggested_roadmap مفقود." };
  {
    const err =
      checkItemsArray(rm.phases, "suggested_roadmap.phases", (it, path) => {
        if (!isObj(it)) return `${path} ليس كائنًا`;
        if (!isStr(it.phase)) return `${path}.phase فارغ`;
        if (!isStr(it.description)) return `${path}.description فارغ`;
        if (!isArr(it.deliverables) || !it.deliverables.every(isStr)) {
          return `${path}.deliverables يجب أن تكون مصفوفة نصوص`;
        }
        return checkEvidenceArray(it.evidence, `${path}.evidence`);
      }) || checkConfidence(rm.confidence, "suggested_roadmap.confidence");
    if (err) return { ok: false, reason: err };
  }

  // --- meeting_questions (no evidence needed) ---
  const mq = p.meeting_questions;
  if (!isObj(mq)) return { ok: false, reason: "meeting_questions مفقود." };
  {
    const err =
      checkItemsArray(mq.items, "meeting_questions.items", (it, path) => {
        if (!isObj(it)) return `${path} ليس كائنًا`;
        if (!isStr(it.question)) return `${path}.question فارغ`;
        if (!isStr(it.reason)) return `${path}.reason فارغ`;
        if (!isPriority(it.priority)) return `${path}.priority غير صالح`;
        return null;
      }) || checkConfidence(mq.confidence, "meeting_questions.confidence");
    if (err) return { ok: false, reason: err };
  }

  return { ok: true, data: p as unknown as DiscoveryAnalysisOutput };
}

// Re-export للاختبارات
export type { EvidenceItem, AssumptionItem, SuggestionItem, EvidenceRef, SectionConfidence };
