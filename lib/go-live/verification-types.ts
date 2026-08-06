/**
 * أنواع مركز التحقّق بعد الترحيل وقبول الأعمال وشهادة الإطلاق (Go Live
 * Validation Center) — **وحدة نقية بلا I/O**.
 *
 * المرحلة ٧: *Migration is NOT Finished Until Business Confirms Success.*
 * لا يكفي وصول البيانات — يجب أن يعمل العمل (المبيعات/المحاسبة/المخزون/
 * الفروع) بصورة صحيحة، وأن يعتمد العميل النظام رسميًا. خط الدفاع الأخير
 * قبل إغلاق مشروع الترحيل.
 */

export type VerificationStatus =
  | "draft" | "verifying" | "awaiting_acceptance" | "certified" | "rejected" | "closed";

export type GoLiveStatus = "not_ready" | "conditional" | "ready" | "live";

// ────────────────────────────────────────────────────────────
// التحقّق من البيانات (Data Verification) — Source ↔ Production
// ────────────────────────────────────────────────────────────

export interface EntityCountPair {
  entity: string;
  label: string;
  sourceCount: number;
  productionCount: number;
}

export interface DataCheck {
  entity: string;
  label: string;
  sourceCount: number;
  productionCount: number;
  difference: number;
  matched: boolean;
  note: string;
}

export interface DataVerificationReport {
  checks: DataCheck[];
  matchedCount: number;
  totalEntities: number;
  fullyMatched: boolean;
}

// ────────────────────────────────────────────────────────────
// التحقّق التجاري والوظيفي (Business / Functional)
// ────────────────────────────────────────────────────────────

export type CheckState = "pass" | "fail" | "pending";

export interface BusinessCheckItem {
  key: string;
  title: string;
  state: CheckState;
  detail: string;
}

export interface FunctionalScenario {
  key: string;
  title: string;
  department: string;
  state: CheckState;
}

// ────────────────────────────────────────────────────────────
// اعتماد الأقسام والفروع (Department / Branch Acceptance)
// ────────────────────────────────────────────────────────────

export type ApprovalState = "pending" | "approved" | "rejected";

export interface DepartmentChecklist {
  department: string;
  label: string;
  items: string[];
}

// ────────────────────────────────────────────────────────────
// فحص الصحة (System Health)
// ────────────────────────────────────────────────────────────

export interface HealthInput {
  databaseOk: boolean;
  apiOk: boolean;
  storageOk: boolean;
  queuesOk: boolean;
  workersActive: boolean;
  cacheOk: boolean;
  indexesOk: boolean;
  avgQueryMs: number;
}

export interface HealthComponent {
  key: string;
  label: string;
  ok: boolean;
  detail: string;
}

export interface HealthReport {
  components: HealthComponent[];
  score: number; // 0-100
  passed: boolean;
}

// ────────────────────────────────────────────────────────────
// التحقّق من الأداء و KPIs
// ────────────────────────────────────────────────────────────

export interface KpiPair {
  key: string;
  label: string;
  before: number;
  after: number;
}

export interface KpiCheck {
  key: string;
  label: string;
  before: number;
  after: number;
  variancePercent: number;
  verdict: "preserved" | "improved" | "degraded" | "missing";
}

export interface KpiReport {
  checks: KpiCheck[];
  preserved: number;
  degraded: number;
  passed: boolean;
}

// ────────────────────────────────────────────────────────────
// قائمة الإطلاق (Go Live Checklist) + الدرجة النهائية
// ────────────────────────────────────────────────────────────

export interface GoLiveChecklistItem {
  key: string;
  label: string;
  done: boolean;
  blocking: boolean;
}

export interface GoLiveChecklist {
  items: GoLiveChecklistItem[];
  ready: boolean;
  blockers: string[];
}

export interface ScoreInput {
  dataMatchRatio: number; // 0-1
  businessPassRatio: number; // 0-1
  departmentsApprovedRatio: number; // 0-1
  branchesApprovedRatio: number; // 0-1
  healthScore: number; // 0-100
  kpiPassRatio: number; // 0-1
  openIssues: number;
}

export interface FinalScore {
  verificationScore: number; // 0-100 (تقني)
  businessAcceptanceScore: number; // 0-100 (تجاري)
  finalMigrationScore: number; // 0-100 (موزون)
  goLiveStatus: GoLiveStatus;
}

// ────────────────────────────────────────────────────────────
// الشهادة والدروس المستفادة
// ────────────────────────────────────────────────────────────

export interface GoLiveCertificateData {
  projectName: string;
  migrationVersion: string;
  verificationScore: number;
  businessAcceptanceScore: number;
  finalMigrationScore: number;
  goLiveStatus: GoLiveStatus;
  approvers: Array<{ role: string; scope: string }>;
  issuedAtNote: string;
}

export interface Lesson {
  category: "problem" | "solution" | "best_practice" | "recommendation";
  title: string;
  detail: string;
}

export interface LessonsReport {
  lessons: Lesson[];
  summary: string;
}

/** الأقسام القياسية (تُنشأ لكل تحقّق). */
export const STANDARD_DEPARTMENTS: DepartmentChecklist[] = [
  { department: "sales", label: "المبيعات", items: ["إنشاء عميل", "إنشاء فاتورة", "استلام دفعة", "تقارير المبيعات صحيحة"] },
  { department: "accounting", label: "المحاسبة", items: ["أرصدة الحسابات صحيحة", "الضرائب صحيحة", "الإيرادات مطابقة", "التقارير المالية صحيحة"] },
  { department: "inventory", label: "المخزون", items: ["كميات المخزون صحيحة", "تحويل مخزون يعمل", "تقييم المخزون صحيح"] },
  { department: "hr", label: "الموارد البشرية", items: ["عدد الموظفين مطابق", "بيانات الرواتب صحيحة", "الصلاحيات صحيحة"] },
  { department: "crm", label: "علاقات العملاء", items: ["عدد العملاء مطابق", "سجلّ التفاعلات محفوظ", "الاشتراكات صحيحة"] },
  { department: "warehouse", label: "المستودعات", items: ["عدد المخازن مطابق", "المواقع صحيحة", "حركات المخزون سليمة"] },
  { department: "management", label: "الإدارة", items: ["لوحات المؤشّرات تعمل", "Workflow تعمل", "الاعتمادات (Approval) تعمل", "الإشعارات تعمل"] },
];

export const PM_SCORE_WEIGHTS = {
  data: 0.25,
  business: 0.2,
  departments: 0.2,
  branches: 0.1,
  health: 0.1,
  kpi: 0.15,
} as const;
