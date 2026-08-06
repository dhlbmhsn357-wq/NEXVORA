/**
 * محاكاة التراجع (Rollback Simulation) — **وحدة نقية بلا I/O**.
 *
 * لا يكفي إنشاء Rollback — يجب اختبارها. هنا نحاكي تراجعًا كاملًا داخل
 * الـDigital Twin: بما أن كل التحميل افتراضي (لم يُكتب شيء على Production)،
 * فالتراجع = إتلاف الـTwin، وهو **آمن بطبيعته وبلا فقدان**. القيمة الحقيقية:
 * تأكيد أن خطة التراجع **تغطّي كل كيان محمَّل** وتقدير زمنها.
 */

import type { DigitalTwin, RollbackReport, RollbackEntityResult } from "./simulation-types";

export function simulateRollback(twin: DigitalTwin): RollbackReport {
  const entities: RollbackEntityResult[] = [];
  let totalLoaded = 0;
  let covered = 0;

  for (const te of twin.entities.values()) {
    if (te.rows.length === 0) continue;
    totalLoaded += te.rows.length;
    covered++;
    entities.push({
      entity: te.entity,
      loadedRows: te.rows.length,
      reverted: true,
      note: `تراجع افتراضي كامل (${te.rows.length} صفًّا) — لم تُكتب بيانات على Production.`,
    });
  }

  // زمن تقديري ∝ عدد الصفوف المحمَّلة (حذف على دفعات).
  const estimatedSeconds = Math.max(1, Math.round(totalLoaded / 5000));
  const notes = [
    "التراجع داخل المحاكاة آمن بالكامل: البيئة افتراضية ولا تمسّ Production.",
    covered > 0 ? `خطة التراجع تغطّي ${covered} كيانًا محمَّلًا.` : "لا كيانات محمَّلة للتراجع عنها.",
    "في الترحيل الحقيقي (Phase 6): يجب أن يلتزم كل كيان بترتيب تراجع عكسي (الأبناء قبل الآباء).",
  ];

  return {
    success: true,
    estimatedSeconds,
    dataLoss: false,
    coverage: covered > 0 ? 100 : 0,
    entities,
    notes,
  };
}
