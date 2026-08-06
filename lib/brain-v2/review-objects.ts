import { BRAIN_SECTIONS, type BrainContent, type BrainSectionKey } from "./types";
import { diffBrainContents } from "./diff";
import { extractFlatItems } from "@/lib/knowledge-graph/extract-items";
import { BLOCKING_REVIEW_OBJECT_STATES, type BrainReviewObject, type BrainReviewObjectDependency, type BrainReviewObjectState } from "@/lib/types/database";

/** الأقسام السردية (نص، مفيش عناصر مصفوفة) — بره نطاق المراجعة الفردية عمدًا. */
const NON_REVIEWABLE_SECTIONS: readonly BrainSectionKey[] = ["executive_summary", "business_model"];

export interface EnumeratedReviewObject {
  section_key: BrainSectionKey;
  item_key: string;
  item_title: string;
}

/**
 * يعدّد كل عناصر المعرفة القابلة للمراجعة الفردية عبر الـ17 قسم — بإعادة
 * استخدام extractFlatItems() (Phase 3، lib/knowledge-graph/extract-items.ts)
 * بدل تكرار منطق الاستخراج. missing_information/assumptions موجودين هنا
 * كمرآة للعرض فقط — القرار الفعلي لسه في dispositions القديمة.
 */
export function enumerateReviewObjects(content: BrainContent): EnumeratedReviewObject[] {
  const out: EnumeratedReviewObject[] = [];
  for (const section of BRAIN_SECTIONS) {
    if (NON_REVIEWABLE_SECTIONS.includes(section)) continue;
    const items = extractFlatItems(section, content[section].content);
    for (const item of items) {
      out.push({ section_key: section, item_key: item.key, item_title: item.title });
    }
  }
  return out;
}

/** أي عنصر مُعدَّد الآن ليس له صف brain_review_objects موجود بعد — يحتاج إدخال بحالة pending_review. */
export function computeMissingReviewObjects(
  enumerated: EnumeratedReviewObject[],
  existing: BrainReviewObject[]
): EnumeratedReviewObject[] {
  const existingKeys = new Set(existing.map((o) => `${o.section_key}::${o.item_key}`));
  return enumerated.filter((e) => !existingKeys.has(`${e.section_key}::${e.item_key}`));
}

export function isBlockingReviewState(state: BrainReviewObjectState): boolean {
  return BLOCKING_REVIEW_OBJECT_STATES.includes(state);
}

/**
 * يستخرج مفاتيح العناصر اللي محتواها اتغيّر فعليًا بين نسختين — بإعادة
 * استخدام diffBrainContents() (موجودة بالفعل، بتحسب modifiedItems لكل
 * قسم) بدل بناء منطق مقارنة جديد.
 */
export function detectChangedItemKeys(oldContent: BrainContent, newContent: BrainContent): Array<{ section_key: BrainSectionKey; item_key: string }> {
  const diffs = diffBrainContents(oldContent, newContent);
  const out: Array<{ section_key: BrainSectionKey; item_key: string }> = [];
  for (const d of diffs) {
    for (const key of d.modifiedItems ?? []) out.push({ section_key: d.section, item_key: key });
    for (const key of d.removedItems ?? []) out.push({ section_key: d.section, item_key: key });
  }
  return out;
}

/**
 * كاسكيد قفزة-واحدة (one-hop) — العناصر اللي بتعتمد (depends_on) على
 * عنصر اتغيّر بتتعلّم needs_revalidation هي كمان. Transitive closure
 * كاملة بره نطاق هذه المرحلة عمدًا (توسّع مستقبلي).
 */
export function cascadeRevalidation(
  changedObjectIds: Set<string>,
  dependencies: BrainReviewObjectDependency[]
): Set<string> {
  const cascaded = new Set(changedObjectIds);
  for (const dep of dependencies) {
    if (dep.relation_type === "depends_on" && changedObjectIds.has(dep.depends_on_review_object_id)) {
      cascaded.add(dep.review_object_id);
    }
  }
  return cascaded;
}

/** ملخّص تقدّم المراجعة — لمصفوفة Dashboard التنفيذي. */
export interface ReviewProgressSummary {
  total: number;
  byState: Record<BrainReviewObjectState, number>;
  blockingCount: number;
  needsRevalidationCount: number;
}

export function computeReviewProgress(objects: BrainReviewObject[]): ReviewProgressSummary {
  const byState: Record<BrainReviewObjectState, number> = {
    pending_review: 0,
    approved: 0,
    approved_with_modification: 0,
    needs_revision: 0,
    rejected: 0,
    deferred: 0,
    blocked: 0,
  };
  let needsRevalidationCount = 0;
  for (const o of objects) {
    byState[o.state]++;
    if (o.needs_revalidation) needsRevalidationCount++;
  }
  const blockingCount = objects.filter((o) => isBlockingReviewState(o.state)).length;
  return { total: objects.length, byState, blockingCount, needsRevalidationCount };
}
