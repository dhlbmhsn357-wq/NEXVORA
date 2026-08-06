/**
 * فحوص ما قبل التنفيذ (Pre-Migration Validation) — **وحدة نقية بلا I/O**.
 *
 * قبل نقل أول سجلّ، يتحقّق النظام من ١٢ شرطًا إلزاميًا. أي فشل في شرط حاجز
 * **يمنع الترحيل تمامًا**. الخدمة تُغذّي الحالة الفعلية (محاكاة معتمَدة،
 * نسخة احتياطية، طابور/عمّال جاهزون...) وهذه الوحدة تُصدر الحكم.
 */

import type { PreflightInput, PreflightCheck, PreflightResult, PreflightKey } from "./execution-types";

interface Spec {
  key: PreflightKey;
  label: string;
  blocking: boolean;
  test: (i: PreflightInput) => boolean;
  detail: (i: PreflightInput) => string;
}

const SPECS: Spec[] = [
  { key: "simulation_approved", label: "المحاكاة معتمَدة", blocking: true, test: (i) => i.simulationApproved, detail: (i) => (i.simulationApproved ? "محاكاة معتمَدة من المدير." : "لا توجد محاكاة معتمَدة — اعتمد المرحلة ٥ أولًا.") },
  { key: "not_blocked", label: "بلا قواعد منع", blocking: true, test: (i) => !i.simulationBlocked, detail: (i) => (i.simulationBlocked ? "المحاكاة محظورة بقواعد منع (فقدان/علاقات مكسورة...)." : "لا قواعد منع فعّالة.") },
  { key: "migration_score", label: "درجة الاعتماد كافية", blocking: true, test: (i) => i.migrationScore >= i.minScore, detail: (i) => `الدرجة ${i.migrationScore} (الحدّ ${i.minScore}).` },
  { key: "backup_exists", label: "نسخة احتياطية موجودة", blocking: true, test: (i) => i.backupExists, detail: (i) => (i.backupExists ? "نسخة احتياطية إلزامية جاهزة." : "لا نسخة احتياطية — أنشئها قبل التنفيذ.") },
  { key: "rollback_ready", label: "التراجع جاهز", blocking: true, test: (i) => i.rollbackReady, detail: (i) => (i.rollbackReady ? "حزمة تراجع جاهزة للتنفيذ." : "حزمة التراجع غير جاهزة.") },
  { key: "database_available", label: "قاعدة البيانات متاحة", blocking: true, test: (i) => i.databaseAvailable, detail: (i) => (i.databaseAvailable ? "الوجهة متاحة." : "الوجهة غير متاحة.") },
  { key: "storage_available", label: "التخزين متاح", blocking: true, test: (i) => i.storageAvailable, detail: (i) => (i.storageAvailable ? "التخزين متاح." : "التخزين غير متاح.") },
  { key: "disk_space", label: "مساحة قرص كافية", blocking: false, test: (i) => i.diskOk, detail: (i) => (i.diskOk ? "مساحة كافية." : "تحذير: مساحة القرص منخفضة.") },
  { key: "memory_available", label: "ذاكرة كافية", blocking: false, test: (i) => i.memoryOk, detail: (i) => (i.memoryOk ? "ذاكرة كافية." : "تحذير: الذاكرة منخفضة — قلّل Chunk/التوازي.") },
  { key: "queues_ready", label: "الطابور جاهز", blocking: true, test: (i) => i.queuesReady, detail: (i) => (i.queuesReady ? "الطابور جاهز." : "الطابور غير جاهز.") },
  { key: "workers_ready", label: "العمّال جاهزون", blocking: false, test: (i) => i.workersReady, detail: (i) => (i.workersReady ? "عمّال نشطون." : "تحذير: لا عمّال نشطون — سيُنفَّذ عبر Auto-Chain.") },
  { key: "api_available", label: "الخدمات متاحة", blocking: false, test: (i) => i.apiAvailable, detail: (i) => (i.apiAvailable ? "الخدمات المساندة متاحة." : "تحذير: بعض الخدمات المساندة غير متاحة.") },
];

export function runPreflight(input: PreflightInput): PreflightResult {
  const checks: PreflightCheck[] = SPECS.map((s) => ({
    key: s.key,
    label: s.label,
    passed: s.test(input),
    blocking: s.blocking,
    detail: s.detail(input),
  }));
  const blockers = checks.filter((c) => c.blocking && !c.passed).map((c) => `${c.label}: ${c.detail}`);
  return { checks, passed: blockers.length === 0, blockers };
}
