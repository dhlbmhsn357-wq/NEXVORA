import type {
  BrainContent,
  BrainSectionKey,
  BusinessModelContent,
  EvidenceItem,
  NonFunctionalContent,
  ScopeContent,
  Section,
} from "./types";
import { BRAIN_SECTIONS } from "./types";

/**
 * الدمج الإضافي (Additive Merge) للـ Project Brain.
 *
 * المشكلة اللي بيحلّها: قبل كده أي تحليل جديد (جلسة اكتشاف تانية،
 * اجتماع جديد، قرار) كان بيستبدل محتوى الـ Draft بالكامل، فتضيع
 * تعديلات الـ PM اليدوية والتوصيات المعتمدة اللي اتكتبت في الـ Brain.
 *
 * القاعدة هنا: **لا نحذف أبدًا**. المعلومة الجديدة تتضاف، والقديمة
 * تفضل زي ما هي. ده بيخلّي "الزيادة" (Increment) فعلًا زيادة مش
 * إعادة بناء.
 *
 * ملاحظة مهمة عن الترتيب: العناصر الجديدة بتتضاف في **آخر** المصفوفة،
 * وده مقصود — لأن خرائط الـ Dispositions (معلومات ناقصة / افتراضات)
 * مفهرسة بالـ index كنص، فإضافة في الآخر بتحافظ على ارتباط القرارات
 * القديمة بعناصرها. أي إدراج في النص كان هيبوّظ الربط ده بصمت.
 */

// ============================================================
// تطبيع النصوص للمقارنة
// ============================================================

/** يوحّد النص للمقارنة: مسافات، تطويل، تشكيل، حالة الأحرف. */
export function normalizeForCompare(value: string): string {
  return value
    .replace(/[ـ]/g, "") // تطويل
    .replace(/[ً-ْٰ]/g, "") // تشكيل
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

// ============================================================
// مفاتيح الهوية لكل قسم
// ============================================================

/**
 * كل قسم مصفوفة له حقل (أو حقول) بتحدّد إن العنصر "هو هو".
 * لو العنصر الجديد له نفس الهوية، بنعتبره موجود ومنضفوش تاني.
 */
const ARRAY_SECTION_IDENTITY: Partial<Record<BrainSectionKey, (item: unknown) => string>> = {
  business_goals: (i) => str(i, "statement"),
  stakeholders: (i) => `${str(i, "name")}|${str(i, "role")}`,
  business_rules: (i) => str(i, "rule"),
  functional_requirements: (i) => str(i, "statement"),
  constraints: (i) => str(i, "constraint"),
  assumptions: (i) => str(i, "statement"),
  risks: (i) => str(i, "risk"),
  known_facts: (i) => str(i, "fact"),
  missing_information: (i) => str(i, "info"),
  user_roles: (i) => str(i, "role"),
  suggested_features: (i) => str(i, "title"),
  suggested_integrations: (i) => str(i, "title"),
  suggested_kpis: (i) => str(i, "name"),
  roadmap: (i) => str(i, "phase"),
  meeting_questions: (i) => str(i, "question"),
};

function str(item: unknown, field: string): string {
  if (!item || typeof item !== "object") return "";
  const value = (item as Record<string, unknown>)[field];
  return typeof value === "string" ? normalizeForCompare(value) : "";
}

/** هوية عنصر EvidenceItem داخل الأقسام المركّبة (النطاق / غير الوظيفية). */
function evidenceItemIdentity(item: EvidenceItem): string {
  return normalizeForCompare(item.statement ?? "");
}

// ============================================================
// نتيجة الدمج
// ============================================================

export interface BrainMergeResult {
  merged: BrainContent;
  /** عدد العناصر المضافة فعليًا لكل قسم (الأقسام اللي مفيهاش إضافة مش موجودة). */
  addedBySection: Partial<Record<BrainSectionKey, number>>;
  /** إجمالي العناصر المضافة عبر كل الأقسام. */
  totalAdded: number;
  /** الأقسام اللي اتغيّرت فعلًا — مفيدة لتقرير الزيادة وللـ staleness. */
  changedSections: BrainSectionKey[];
  /**
   * العناصر المضافة نفسها لكل قسم — دي "مادة الزيادة" اللي المراحل
   * التالية (قسم PRD جديد، برومت للمرحلة الجديدة، اختبار مخصّص لها)
   * بتشتغل عليها بدل ما تعيد قراءة الـ Brain كله.
   *
   * للأقسام النصية زي الملخّص التنفيذي بنسجّل النص المضاف كعنصر واحد.
   */
  addedItems: Partial<Record<BrainSectionKey, unknown[]>>;
}

// ============================================================
// دمج المصفوفات
// ============================================================

function mergeArray<T>(
  existing: T[],
  incoming: T[],
  identity: (item: T) => string
): { merged: T[]; added: number; items: T[] } {
  const seen = new Set(existing.map(identity).filter((k) => k.length > 0));
  const additions: T[] = [];
  for (const item of incoming) {
    const key = identity(item);
    // العنصر اللي مالوش هوية نصية (نص فاضي) بنتجاهله بدل ما نضيف
    // تكرارات فاضية كل مرة يتشغّل فيها التحليل.
    if (key.length === 0) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    additions.push(item);
  }
  return {
    merged: additions.length > 0 ? [...existing, ...additions] : existing,
    added: additions.length,
    items: additions,
  };
}

// ============================================================
// دمج الحقول النصية: نملأ الفاضي بس، ومنستبدلش المكتوب
// ============================================================

function fillIfEmpty(existing: string, incoming: string): { value: string; changed: boolean } {
  if (existing && existing.trim().length > 0) return { value: existing, changed: false };
  if (!incoming || incoming.trim().length === 0) return { value: existing, changed: false };
  return { value: incoming, changed: true };
}

function mergeBusinessModel(
  existing: BusinessModelContent,
  incoming: BusinessModelContent
): { merged: BusinessModelContent; added: number; items: unknown[] } {
  const fields: (keyof BusinessModelContent)[] = [
    "overview",
    "how_it_works",
    "value_delivery",
    "users_description",
  ];
  const merged = { ...existing };
  const items: unknown[] = [];
  for (const field of fields) {
    const r = fillIfEmpty(existing[field] ?? "", incoming?.[field] ?? "");
    merged[field] = r.value;
    if (r.changed) items.push({ field, value: r.value });
  }
  return { merged, added: items.length, items };
}

function mergeScope(
  existing: ScopeContent,
  incoming: ScopeContent
): { merged: ScopeContent; added: number; items: unknown[] } {
  const inScope = mergeArray(existing.in_scope ?? [], incoming?.in_scope ?? [], evidenceItemIdentity);
  const outScope = mergeArray(
    existing.out_of_scope ?? [],
    incoming?.out_of_scope ?? [],
    evidenceItemIdentity
  );
  return {
    merged: { in_scope: inScope.merged, out_of_scope: outScope.merged },
    added: inScope.added + outScope.added,
    items: [
      ...inScope.items.map((i) => ({ bucket: "in_scope", item: i })),
      ...outScope.items.map((i) => ({ bucket: "out_of_scope", item: i })),
    ],
  };
}

const NFR_FIELDS: (keyof NonFunctionalContent)[] = [
  "performance",
  "security",
  "scalability",
  "availability",
  "accessibility",
  "compliance",
];

function mergeNonFunctional(
  existing: NonFunctionalContent,
  incoming: NonFunctionalContent
): { merged: NonFunctionalContent; added: number; items: unknown[] } {
  const merged = { ...existing } as NonFunctionalContent;
  const items: unknown[] = [];
  for (const field of NFR_FIELDS) {
    const r = mergeArray(existing[field] ?? [], incoming?.[field] ?? [], evidenceItemIdentity);
    merged[field] = r.merged;
    for (const item of r.items) items.push({ field, item });
  }
  return { merged, added: items.length, items };
}

// ============================================================
// meta
// ============================================================

/**
 * الـ meta بتاعت القسم بتفضل بتاعة النسخة القائمة — لأن مصدرها
 * ممكن يكون تعديل يدوي من الـ PM ومش صح تحليل جديد يدوسه. اللي
 * بيتحدّث بس هو `last_updated` وبس لما يكون فيه إضافة فعلية.
 */
function mergeMeta<T>(existing: Section<T>, changed: boolean, now: string): Section<T>["meta"] {
  if (!changed) return existing.meta;
  return { ...existing.meta, last_updated: now };
}

// ============================================================
// الدالة الرئيسية
// ============================================================

/**
 * يدمج محتوى جديد فوق محتوى قائم بشكل إضافي بالكامل.
 * لا يحذف ولا يستبدل أي معلومة موجودة.
 *
 * @param nowIso وقت التحديث — يتمرّر صراحةً عشان الدالة تفضل نقية وقابلة للاختبار.
 */
export function mergeBrainContentAdditive(
  existing: BrainContent,
  incoming: BrainContent,
  nowIso: string
): BrainMergeResult {
  const merged = { ...existing } as BrainContent;
  const addedBySection: Partial<Record<BrainSectionKey, number>> = {};
  const addedItems: Partial<Record<BrainSectionKey, unknown[]>> = {};

  for (const key of BRAIN_SECTIONS) {
    const existingSection = existing[key] as Section<unknown> | undefined;
    const incomingSection = incoming[key] as Section<unknown> | undefined;

    // القسم مش موجود في القائم خالص → ناخد الجديد كما هو.
    if (!existingSection) {
      if (incomingSection) {
        (merged as unknown as Record<string, unknown>)[key] = incomingSection;
        addedBySection[key] = 1;
        addedItems[key] = [incomingSection.content];
      }
      continue;
    }
    if (!incomingSection) continue;

    let added = 0;
    let items: unknown[] = [];
    let content: unknown = existingSection.content;

    if (key === "executive_summary") {
      const r = fillIfEmpty(
        (existingSection.content as string) ?? "",
        (incomingSection.content as string) ?? ""
      );
      content = r.value;
      added = r.changed ? 1 : 0;
      items = r.changed ? [r.value] : [];
    } else if (key === "business_model") {
      const r = mergeBusinessModel(
        existingSection.content as BusinessModelContent,
        incomingSection.content as BusinessModelContent
      );
      content = r.merged;
      added = r.added;
      items = r.items;
    } else if (key === "project_scope") {
      const r = mergeScope(
        existingSection.content as ScopeContent,
        incomingSection.content as ScopeContent
      );
      content = r.merged;
      added = r.added;
      items = r.items;
    } else if (key === "non_functional_requirements") {
      const r = mergeNonFunctional(
        existingSection.content as NonFunctionalContent,
        incomingSection.content as NonFunctionalContent
      );
      content = r.merged;
      added = r.added;
      items = r.items;
    } else {
      const identity = ARRAY_SECTION_IDENTITY[key];
      if (!identity) continue;
      const r = mergeArray(
        (existingSection.content as unknown[]) ?? [],
        (incomingSection.content as unknown[]) ?? [],
        identity
      );
      content = r.merged;
      added = r.added;
      items = r.items;
    }

    if (added > 0) {
      addedBySection[key] = added;
      addedItems[key] = items;
    }
    (merged as unknown as Record<string, unknown>)[key] = {
      meta: mergeMeta(existingSection, added > 0, nowIso),
      content,
    };
  }

  const changedSections = Object.keys(addedBySection) as BrainSectionKey[];
  const totalAdded = changedSections.reduce((sum, k) => sum + (addedBySection[k] ?? 0), 0);

  return { merged, addedBySection, addedItems, totalAdded, changedSections };
}

/** ملخّص عربي للتغيير — يتكتب في `change_summary` بتاع الـ Draft. */
export function describeMerge(
  result: BrainMergeResult,
  labels: Record<BrainSectionKey, string>,
  sourceLabel: string
): string {
  if (result.totalAdded === 0) {
    return `${sourceLabel}: لا توجد معلومات جديدة تُضاف — المحتوى القائم كما هو.`;
  }
  const parts = result.changedSections
    .map((key) => `${labels[key]} (+${result.addedBySection[key]})`)
    .join("، ");
  return `${sourceLabel}: أُضيف ${result.totalAdded} عنصر جديد بدون المساس بالمحتوى القائم — ${parts}.`;
}
