/**
 * حزمة التراجع (Rollback Package) — **وحدة نقية بلا I/O**.
 *
 * تُبنى أثناء التنفيذ وقابلة للتشغيل في أي لحظة (Abort). التراجع يحترم
 * الترتيب **العكسي** للتبعية: تُحذف الأبناء قبل الآباء (تُحذف Payments قبل
 * Invoices قبل Customers) تفاديًا لكسر المراجع.
 */

import type { OrderedEntity, RollbackPackage, RollbackStep } from "./execution-types";

export function buildRollbackPackage(ordered: OrderedEntity[], migratedByEntity: Record<string, number>): RollbackPackage {
  // الترتيب العكسي: الأعلى مستوى (الأبناء) أولًا.
  const reversed = [...ordered].sort((a, b) => b.level - a.level || b.order - a.order);
  const steps: RollbackStep[] = reversed.map((e, i) => ({
    entity: e.entity,
    order: i + 1,
    rowCount: migratedByEntity[e.entity] ?? 0,
    action: "delete_migrated",
  }));
  return {
    steps,
    reverseOrder: reversed.map((e) => e.entity),
    note: "التراجع يحذف السجلات المُرحَّلة بالترتيب العكسي للتبعية (الأبناء قبل الآباء)، ثم يستعيد النسخة الاحتياطية عند الحاجة.",
  };
}
