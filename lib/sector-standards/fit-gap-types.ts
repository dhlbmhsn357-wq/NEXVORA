/**
 * NEXVORA Sector Standards — Fit/Gap Notes Types (0126، المرحلة د)
 * ============================================================================
 * ملاحظات مُهيكلة بسيطة (MVP) على مستوى مشروع الـ Client Variant —
 * "إيه ثابت زي الـ Standard / إيه محتاج إضافة / تعديل / حذف / فروقات
 * تشغيلية". صف واحد لكل مشروع (upsert)، مش تاريخ نُسخ. راجع migration 0126.
 */

export interface FitGapNotesRow {
  id: string;
  projectId: string;
  staysAsIs: string;
  needsAdding: string;
  needsModifying: string;
  needsRemoving: string;
  operationalDifferences: string;
  updatedAt: string;
  updatedBy: string | null;
}

export interface FitGapNotesInput {
  staysAsIs?: string;
  needsAdding?: string;
  needsModifying?: string;
  needsRemoving?: string;
  operationalDifferences?: string;
}
