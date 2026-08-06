/**
 * قائمة الإطلاق ودرجة القبول النهائية (Go Live Checklist + Final Score) —
 * **وحدة نقية بلا I/O**.
 *
 * قائمة الإطلاق التسع بنودها تُشتقّ من الحالة الفعلية؛ الشهادة لا تُصدَر إلا
 * إذا اكتملت كل البنود الحاجزة. الدرجة النهائية مزيج مرجَّح للتحقّق التقني
 * والقبول التجاري.
 */

import type {
  GoLiveChecklistItem, GoLiveChecklist, ScoreInput, FinalScore, GoLiveStatus,
} from "./verification-types";
import { PM_SCORE_WEIGHTS } from "./verification-types";

export interface ChecklistInput {
  migrationCompleted: boolean;
  verificationPassed: boolean;
  businessApproved: boolean;
  branchesApproved: boolean;
  performancePassed: boolean;
  healthPassed: boolean;
  rollbackArchived: boolean;
  backupsSaved: boolean;
  documentationComplete: boolean;
}

export function buildGoLiveChecklist(i: ChecklistInput): GoLiveChecklist {
  const items: GoLiveChecklistItem[] = [
    { key: "migration_completed", label: "اكتمل الترحيل", done: i.migrationCompleted, blocking: true },
    { key: "verification_passed", label: "اجتاز التحقّق التقني", done: i.verificationPassed, blocking: true },
    { key: "business_approved", label: "اعتمدت الأقسام", done: i.businessApproved, blocking: true },
    { key: "branches_approved", label: "اعتمدت الفروع", done: i.branchesApproved, blocking: true },
    { key: "performance_passed", label: "اجتاز الأداء", done: i.performancePassed, blocking: true },
    { key: "health_passed", label: "اجتاز فحص الصحة", done: i.healthPassed, blocking: true },
    { key: "rollback_archived", label: "حزمة التراجع مؤرشفة", done: i.rollbackArchived, blocking: false },
    { key: "backups_saved", label: "النسخ الاحتياطية محفوظة", done: i.backupsSaved, blocking: true },
    { key: "documentation_complete", label: "التوثيق مكتمل", done: i.documentationComplete, blocking: false },
  ];
  const blockers = items.filter((it) => it.blocking && !it.done).map((it) => it.label);
  return { items, ready: blockers.length === 0, blockers };
}

export function computeFinalScore(input: ScoreInput): FinalScore {
  const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

  // الدرجة التقنية (بيانات + صحة + KPI + أداء ضمنيًا).
  const verificationScore = clamp(
    input.dataMatchRatio * 45 +
    (input.healthScore / 100) * 30 +
    input.kpiPassRatio * 25 -
    input.openIssues * 3
  );

  // القبول التجاري (أقسام + فروع + منطق الأعمال).
  const businessAcceptanceScore = clamp(
    input.businessPassRatio * 40 +
    input.departmentsApprovedRatio * 35 +
    input.branchesApprovedRatio * 25
  );

  const finalMigrationScore = clamp(
    input.dataMatchRatio * 100 * PM_SCORE_WEIGHTS.data +
    input.businessPassRatio * 100 * PM_SCORE_WEIGHTS.business +
    input.departmentsApprovedRatio * 100 * PM_SCORE_WEIGHTS.departments +
    input.branchesApprovedRatio * 100 * PM_SCORE_WEIGHTS.branches +
    input.healthScore * PM_SCORE_WEIGHTS.health +
    input.kpiPassRatio * 100 * PM_SCORE_WEIGHTS.kpi
  );

  const goLiveStatus: GoLiveStatus =
    input.openIssues > 0 ? "conditional" :
    finalMigrationScore >= 95 && businessAcceptanceScore >= 90 ? "ready" :
    finalMigrationScore >= 80 ? "conditional" : "not_ready";

  return { verificationScore, businessAcceptanceScore, finalMigrationScore, goLiveStatus };
}
