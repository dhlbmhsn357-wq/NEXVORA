import type { KnowledgeObject } from "./model";

/**
 * إصدارات المعرفة — **وحدة نقية**.
 *
 * ## القاعدة الحاكمة: لا كتابة فوق القديم
 *
 * كل تعديل بيكتب لقطة كاملة للحالة **قبل** التغيير. اللقطة الكاملة
 * مش الفرق المحسوب: سلسلة فروق بتتكسر لو ضاعت حلقة، واللقطة بتقف
 * وحدها. التخزين أغلى، والاسترجاع مضمون — والمقايضة دي صحيحة لبيانات
 * نصّية صغيرة.
 *
 * ## الرجوع يكتب إصدارًا جديدًا
 *
 * الرجوع للإصدار ٣ ما بيمسحش ٤ و٥ — بيكتب إصدار ٦ بمحتوى ٣. التاريخ
 * بيفضل كامل، ويبان إن فيه رجوع حصل وإمتى ومين عمله. مسح الإصدارات
 * كان هيخلّي الرجوع نفسه غير قابل للتدقيق.
 */

export interface VersionSnapshot {
  itemId: string;
  version: number;
  title: string;
  content: string;
  category: string;
  tags: string[];
  confidence: number;
  metadata: Record<string, unknown>;
  contentHash: string | null;
  changeKind: ChangeKind;
  changeReason: string | null;
  createdBy: string | null;
  createdAt: Date;
}

export type ChangeKind = "create" | "update" | "rollback" | "merge" | "import" | "review";

export const CHANGE_KIND_LABELS: Record<ChangeKind, string> = {
  create: "إنشاء",
  update: "تعديل",
  rollback: "رجوع لإصدار سابق",
  merge: "دمج",
  import: "استيراد",
  review: "مراجعة",
};

/** الحقول التي يقارنها محرك الفروق. تغيّر أي منها = إصدار جديد. */
export type VersionedField = "title" | "content" | "category" | "tags" | "confidence";

const VERSIONED_FIELDS: VersionedField[] = ["title", "content", "category", "tags", "confidence"];

export interface FieldDiff {
  field: VersionedField;
  before: string;
  after: string;
  changed: boolean;
}

/**
 * يقارن إصدارين ويرجّع الفروق حقلًا حقلًا.
 *
 * الترتيب ثابت (`VERSIONED_FIELDS`) لا مشتقّ من مفاتيح الكائن: ترتيب
 * المفاتيح في JavaScript مش مضمون عبر المصادر، وعرض بيتغيّر ترتيبه
 * بين مرتين بيبان كأنه اتغيّر وهو ما اتغيّرش.
 */
export function diffVersions(
  before: Pick<VersionSnapshot, VersionedField>,
  after: Pick<VersionSnapshot, VersionedField>
): FieldDiff[] {
  return VERSIONED_FIELDS.map((field) => {
    const beforeText = renderField(before[field]);
    const afterText = renderField(after[field]);
    return { field, before: beforeText, after: afterText, changed: beforeText !== afterText };
  });
}

export function hasChanges(diffs: FieldDiff[]): boolean {
  return diffs.some((d) => d.changed);
}

export function changedFields(diffs: FieldDiff[]): VersionedField[] {
  return diffs.filter((d) => d.changed).map((d) => d.field);
}

function renderField(value: unknown): string {
  if (Array.isArray(value)) return [...value].sort().join("، ");
  return String(value ?? "");
}

// ============================================================
// قرار التسجيل
// ============================================================

export type VersionDecision =
  | { action: "skip"; reason: string }
  | { action: "record"; version: number; changed: VersionedField[]; reason: string };

/**
 * هل يستحق هذا التعديل إصدارًا جديدًا؟
 *
 * **التعديل بلا تغيير لا يُسجَّل.** إعادة تشغيل الإثراء بتنتج نفس
 * الناتج في الأغلب، وتسجيل إصدار لكل تشغيل كان هيملأ التاريخ بضجيج
 * يخفي التغييرات الحقيقية.
 */
export function decideVersion(input: {
  current: Pick<VersionSnapshot, VersionedField>;
  next: Pick<VersionSnapshot, VersionedField>;
  currentVersion: number;
  /** الرجوع يُسجَّل دائمًا حتى لو المحتوى واحد — الحدث نفسه معلومة. */
  force?: boolean;
}): VersionDecision {
  const diffs = diffVersions(input.current, input.next);
  const changed = changedFields(diffs);

  if (changed.length === 0 && !input.force) {
    return { action: "skip", reason: "مفيش تغيير فعلي — الإصدار ما اتسجّلش." };
  }

  return {
    action: "record",
    version: input.currentVersion + 1,
    changed,
    reason:
      changed.length === 0
        ? "تسجيل مفروض (رجوع)."
        : `اتغيّر: ${changed.map(fieldLabel).join("، ")}.`,
  };
}

export const FIELD_LABELS: Record<VersionedField, string> = {
  title: "العنوان",
  content: "المحتوى",
  category: "التصنيف",
  tags: "الوسوم",
  confidence: "الثقة",
};

export function fieldLabel(field: VersionedField): string {
  return FIELD_LABELS[field];
}

// ============================================================
// الرجوع
// ============================================================

export type RollbackPlan =
  | { ok: false; reason: string }
  | {
      ok: true;
      /** الحالة التي ستُكتب على العنصر. */
      restore: Pick<VersionSnapshot, VersionedField>;
      /** رقم الإصدار الجديد الذي يوثّق الرجوع نفسه. */
      newVersion: number;
      reason: string;
    };

/**
 * يخطّط الرجوع لإصدار سابق.
 *
 * الرفض مقصود في حالتين: إصدار غير موجود (خطأ برمجي أو رابط قديم)،
 * والرجوع للإصدار الحالي (عملية بلا أثر بتلخبط التاريخ بلا فايدة).
 */
export function planRollback(input: {
  target: VersionSnapshot | null;
  currentVersion: number;
}): RollbackPlan {
  if (!input.target) {
    return { ok: false, reason: "الإصدار المطلوب مش موجود." };
  }

  if (input.target.version === input.currentVersion) {
    return { ok: false, reason: "ده الإصدار الحالي أصلًا." };
  }

  if (input.target.version > input.currentVersion) {
    return { ok: false, reason: "مايصحّش الرجوع لإصدار أحدث من الحالي." };
  }

  return {
    ok: true,
    restore: {
      title: input.target.title,
      content: input.target.content,
      category: input.target.category,
      tags: input.target.tags,
      confidence: input.target.confidence,
    },
    newVersion: input.currentVersion + 1,
    reason: `رجوع لمحتوى الإصدار ${input.target.version} — اتسجّل كإصدار ${input.currentVersion + 1}.`,
  };
}

/** لقطة من الحالة الحالية للعنصر — تُكتب قبل أي تعديل. */
export function snapshotOf(
  object: KnowledgeObject,
  changeKind: ChangeKind,
  changeReason: string | null,
  actorId: string | null
): Omit<VersionSnapshot, "createdAt"> {
  return {
    itemId: object.id,
    version: object.version,
    title: object.title,
    content: object.content,
    category: object.category,
    tags: object.tags,
    confidence: object.confidence,
    metadata: object.metadata,
    contentHash: object.contentHash,
    changeKind,
    changeReason,
    createdBy: actorId,
  };
}
