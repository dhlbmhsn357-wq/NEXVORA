import { BRAIN_SECTIONS, type BrainContent, type BrainSectionKey } from "./types";

export type DiffChangeKind = "added" | "removed" | "modified" | "unchanged";

export interface SectionDiff {
  section: BrainSectionKey;
  kind: DiffChangeKind;
  before: unknown;
  after: unknown;
  addedItems?: string[];
  removedItems?: string[];
  modifiedItems?: string[];
}

/** مُصدَّرة عمدًا — نفس منطق مطابقة العناصر ده بيُعاد استخدامه في conflict-engine.ts (كشف التعارض) بدل تكراره. */
export function keyOfItem(it: unknown): string | null {
  if (typeof it !== "object" || it === null) return null;
  const rec = it as Record<string, unknown>;
  const candidate =
    rec.statement ?? rec.rule ?? rec.constraint ?? rec.fact ?? rec.risk ?? rec.title ?? rec.goal ?? rec.info ?? rec.question ?? rec.role ?? rec.name ?? rec.phase;
  return typeof candidate === "string" ? candidate.trim() : null;
}

/**
 * مقارنة قسمين: يرجّع "kind" + قوائم البنود المضافة/المحذوفة/المعدلة.
 * للأقسام النصية (executive_summary/business_model) نعتمد stringify.
 */
function diffSection(section: BrainSectionKey, before: unknown, after: unknown): SectionDiff {
  const jsonA = JSON.stringify(before);
  const jsonB = JSON.stringify(after);
  if (jsonA === jsonB) {
    return { section, kind: "unchanged", before, after };
  }

  if (before === undefined || before === null) {
    return { section, kind: "added", before, after };
  }
  if (after === undefined || after === null) {
    return { section, kind: "removed", before, after };
  }

  // للأقسام القائمة على arrays: نستخرج مفاتيح العناصر ونحسب الفروقات.
  if (Array.isArray(before) && Array.isArray(after)) {
    const keysA = new Set(before.map(keyOfItem).filter((k): k is string => !!k));
    const keysB = new Set(after.map(keyOfItem).filter((k): k is string => !!k));
    const added = [...keysB].filter((k) => !keysA.has(k));
    const removed = [...keysA].filter((k) => !keysB.has(k));
    const modified: string[] = [];
    for (const k of keysA) {
      if (!keysB.has(k)) continue;
      const a = before.find((it) => keyOfItem(it) === k);
      const b = after.find((it) => keyOfItem(it) === k);
      if (JSON.stringify(a) !== JSON.stringify(b)) modified.push(k);
    }
    return { section, kind: "modified", before, after, addedItems: added, removedItems: removed, modifiedItems: modified };
  }

  return { section, kind: "modified", before, after };
}

export function diffBrainContents(a: BrainContent, b: BrainContent): SectionDiff[] {
  return BRAIN_SECTIONS.map((key) => diffSection(key, a[key].content, b[key].content));
}
