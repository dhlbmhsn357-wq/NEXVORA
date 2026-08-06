import { getCanonicalEntity } from "./canonical-model";
import type { EntityMappingCandidate, UnmappedObject } from "./entity-matcher";
import type { FieldMapping } from "./field-matcher";

/**
 * كشف التعارضات — **وحدة نقية بلا I/O**.
 *
 * من المواصفة: أي عنصر بلا مقابل يُعرَض لا يُتجاهَل.
 * - حقل قديم بلا نظير جديد → `unmapped_old`.
 * - حقل جديد **مطلوب** بلا مصدر قديم → `unmapped_new`.
 * - جدول قديم لم يُطابَق مع أي كيان → `unused_old`.
 */

export type ConflictType = "unmapped_old" | "unmapped_new" | "unused_old";

export interface MappingConflict {
  type: ConflictType;
  subject: string;
  detail: string;
}

export function detectConflicts(
  entityMappings: EntityMappingCandidate[],
  fieldMappings: FieldMapping[],
  unmappedObjects: UnmappedObject[]
): MappingConflict[] {
  const conflicts: MappingConflict[] = [];

  // حقول قديمة بلا نظير.
  for (const fm of fieldMappings) {
    if (fm.kind === "unmapped" || !fm.newField) {
      conflicts.push({
        type: "unmapped_old",
        subject: `${fm.oldObject}.${fm.oldField}`,
        detail: fm.reason || "حقل قديم بلا مقابل في النظام الجديد.",
      });
    }
  }

  // حقول جديدة مطلوبة بلا مصدر.
  const coveredByEntity = new Map<string, Set<string>>();
  for (const fm of fieldMappings) {
    if (!fm.newField) continue;
    const set = coveredByEntity.get(fm.newEntity) ?? new Set();
    set.add(fm.newField);
    coveredByEntity.set(fm.newEntity, set);
  }
  for (const em of entityMappings) {
    const def = getCanonicalEntity(em.canonicalEntity);
    if (!def) continue;
    const covered = coveredByEntity.get(em.canonicalEntity) ?? new Set();
    for (const field of def.fields) {
      if (field.required && !covered.has(field.key)) {
        conflicts.push({
          type: "unmapped_new",
          subject: `${em.canonicalEntity}.${field.key}`,
          detail: `حقل مطلوب في النظام الجديد «${field.label}» بلا مصدر في النظام القديم — يحتاج قيمة افتراضية أو مراجعة.`,
        });
      }
    }
  }

  // جداول قديمة غير مستخدمة.
  for (const uo of unmappedObjects) {
    conflicts.push({ type: "unused_old", subject: uo.object, detail: uo.reason });
  }

  return conflicts;
}
