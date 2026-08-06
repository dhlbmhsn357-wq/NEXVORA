/**
 * أنواع مركز محاكاة الترحيل (Migration Simulation Center) — **وحدة نقية بلا I/O**.
 *
 * المرحلة ٥: **Enterprise Migration Simulation, Digital Twin & AI Validation**.
 * فلسفة: *Never Touch Production Before Simulation*. تبني نسخة رقمية كاملة
 * (Digital Twin) تحاكي النظام الجديد، تعيد تنفيذ كل خطوات الترحيل عليها
 * افتراضيًا، تقارن النتائج بالمصدر، وتُصدر Migration Approval Score يمنع
 * الترحيل الحقيقي عند وجود مخاطر حرجة.
 *
 * **لا كتابة على Production إطلاقًا. لا تخزين صفوف خام** — الـTwin يعيش في
 * الذاكرة، ويُحفَظ المشتقّات فقط (مقاييس + خطوات + مشاكل بعيّنات مقصوصة).
 */

import type { TransformRule, Row } from "@/lib/transformation/rule-types";
import type { BusinessRule } from "@/lib/transformation/business-rules";

// ────────────────────────────────────────────────────────────
// مدخلات المحاكاة (تُبنى في الخدمة من مخرَجات المراحل ١-٤)
// ────────────────────────────────────────────────────────────

/** مواصفة علاقة بين كيانين في النظام الجديد (من Mapping المرحلة ٢/الاكتشاف ١). */
export interface RelationshipSpec {
  fromEntity: string;
  toEntity: string;
  kind: "parent_child" | "one_to_one" | "many_to_many" | "recursive" | "circular" | "weak" | "missing" | "broken";
  /** أعمدة الربط (FK) على جهة الابن. */
  viaColumns: string[];
  confidence: number;
}

/** خطة كيان واحد داخل المحاكاة — صفوف المصدر + قواعده + مفتاحه. */
export interface EntityPlan {
  entity: string;
  label: string;
  /** حقل الهوية/المفتاح (لكشف التكرار وبناء العلاقات) — قد يكون null. */
  keyField: string | null;
  /** قواعد التحويل الخاصة بهذا الكيان (مُفلترة من الـPipeline). */
  rules: TransformRule[];
  /** صفوف المصدر بأسماء الحقول القديمة (تُحلَّل في الذاكرة، لا تُخزَّن). */
  rows: Row[];
}

/** خطة المحاكاة الكاملة — المدخل النقي لمحرّك الإعادة. */
export interface SimulationPlan {
  entities: EntityPlan[];
  businessRules: BusinessRule[];
  relationships: RelationshipSpec[];
  domain: string;
}

// ────────────────────────────────────────────────────────────
// الـ Digital Twin (بيئة افتراضية في الذاكرة)
// ────────────────────────────────────────────────────────────

export interface TwinEntity {
  entity: string;
  label: string;
  keyField: string | null;
  rows: Row[];
  /** فهرس قيم المفتاح → عدد مرّات الظهور (لكشف انتهاك التفرّد). */
  keyCounts: Map<string, number>;
}

export interface DigitalTwin {
  entities: Map<string, TwinEntity>;
  relationships: RelationshipSpec[];
  domain: string;
}

// ────────────────────────────────────────────────────────────
// المشاكل (كتالوج قابل للتفسير — مشتقّات + عيّنات مقصوصة فقط)
// ────────────────────────────────────────────────────────────

export type IssueCategory =
  | "extraction" | "transformation" | "validation" | "loading"
  | "relationship" | "business" | "constraint" | "permission";

export type IssueType =
  | "missing_required" | "invalid_email" | "invalid_phone" | "invalid_date"
  | "invalid_number" | "enum_violation" | "data_loss" | "duplicate_key"
  | "rule_error" | "empty_output" | "broken_relation" | "orphan_record"
  | "aggregate_drift" | "count_mismatch" | "business_rule_failure";

export type IssueSeverity = "critical" | "high" | "medium" | "low";

/** مشكلة مجمّعة قابلة للتفسير — مكانها + سببها + القاعدة + قرار الـAI. */
export interface SimIssue {
  entity: string;
  category: IssueCategory;
  issueType: IssueType;
  field: string;
  severity: IssueSeverity;
  count: number;
  message: string;
  /** القاعدة التي سبّبت المشكلة (Explainability). */
  ruleId?: string;
  /** عيّنات تشخيصية محدودة (قيم مقصوصة) — لا صفّ كامل. */
  samples: Array<{ oldValue: string; newValue: string }>;
}

// ────────────────────────────────────────────────────────────
// إعادة التنفيذ خطوة بخطوة (Migration Replay)
// ────────────────────────────────────────────────────────────

export type ReplayStage =
  | "extract" | "clean" | "transform" | "validate" | "load"
  | "relationships" | "business" | "constraints" | "permissions" | "indexes";

export type StepStatus = "passed" | "warning" | "failed";

export interface ReplayStepLog {
  order: number;
  stage: ReplayStage;
  name: string;
  status: StepStatus;
  processed: number;
  failed: number;
  /** تقدير حتمي (لا Wall-clock) — للعرض والتحليل. */
  estimatedMs: number;
  detail: Record<string, unknown>;
  errors: string[];
}

export interface RowOutcomes {
  migrated: number;
  skipped: number;
  archived: number;
  failed: number;
}

export interface EntityBreakdown {
  entity: string;
  label: string;
  sourceRows: number;
  targetRows: number;
  migrated: number;
  skipped: number;
  archived: number;
  failed: number;
}

export interface ReplayResult {
  twin: DigitalTwin;
  steps: ReplayStepLog[];
  outcomes: RowOutcomes;
  issues: SimIssue[];
  byEntity: EntityBreakdown[];
}

// ────────────────────────────────────────────────────────────
// تحليل الفروق (Difference Analyzer)
// ────────────────────────────────────────────────────────────

export interface CountDiff {
  entity: string;
  label: string;
  oldValue: number;
  newValue: number;
  difference: number;
  expected: boolean;
  reason: string;
}

export interface DifferenceReport {
  counts: CountDiff[];
  totalOld: number;
  totalNew: number;
  totalDifference: number;
  unexpectedCount: number;
}

// ────────────────────────────────────────────────────────────
// التحقّق من العلاقات (Referential Integrity)
// ────────────────────────────────────────────────────────────

export interface RelationshipCheck {
  fromEntity: string;
  toEntity: string;
  kind: RelationshipSpec["kind"];
  checked: number;
  broken: number;
  orphans: number;
  passed: boolean;
  message: string;
  samples: string[];
}

export interface RelationshipReport {
  checks: RelationshipCheck[];
  totalBroken: number;
  totalOrphans: number;
  circularChains: string[][];
  passed: boolean;
}

// ────────────────────────────────────────────────────────────
// التحقّق التجاري (Business Consistency)
// ────────────────────────────────────────────────────────────

export interface BusinessCheck {
  key: string;
  title: string;
  entity: string;
  passed: boolean;
  oldValue: string;
  newValue: string;
  message: string;
  severity: IssueSeverity;
}

export interface BusinessReport {
  checks: BusinessCheck[];
  failures: number;
  passed: boolean;
}

// ────────────────────────────────────────────────────────────
// تنبّؤ المخاطر (AI Risk Prediction — النواة الحتمية)
// ────────────────────────────────────────────────────────────

export type RiskLevel = "low" | "medium" | "high" | "critical";

export interface RiskItem {
  key: string;
  title: string;
  level: RiskLevel;
  probability: number; // 0-100
  entity?: string;
  reason: string;
  mitigation: string;
}

export interface RiskReport {
  riskScore: number; // 0-100 (أعلى = أخطر)
  level: RiskLevel;
  failureProbability: number; // 0-100
  criticalTables: string[];
  criticalOperations: string[];
  bottlenecks: string[];
  risks: RiskItem[];
}

// ────────────────────────────────────────────────────────────
// محاكاة الأداء (Performance Simulation)
// ────────────────────────────────────────────────────────────

export interface PerfScenario {
  label: string;
  rows: number;
  estimatedSeconds: number;
  peakMemoryMb: number;
  estimatedDowntimeSeconds: number;
}

export interface BatchStrategy {
  batchSize: number;
  queueSize: number;
  parallelism: number;
  retryStrategy: string;
  resumeStrategy: string;
}

export interface PerformanceReport {
  perRowMicros: number;
  avgRowBytes: number;
  scenarios: PerfScenario[];
  peakCpuPercent: number;
  storageEstimateMb: number;
  bandwidthEstimateMb: number;
  strategy: BatchStrategy;
  notes: string[];
}

// ────────────────────────────────────────────────────────────
// محاكاة الأعطال (Failure Simulation)
// ────────────────────────────────────────────────────────────

export type FailureKind =
  | "network" | "power" | "database_crash" | "api_failure"
  | "storage_failure" | "queue_failure" | "memory_overflow" | "partial_migration";

export interface FailureScenarioResult {
  kind: FailureKind;
  title: string;
  canResume: boolean;
  canRecover: boolean;
  safeRetry: boolean;
  dataLossRisk: boolean;
  verdict: StepStatus;
  explanation: string;
}

export interface FailureReport {
  scenarios: FailureScenarioResult[];
  resilient: boolean;
  weakest: FailureKind | null;
}

// ────────────────────────────────────────────────────────────
// محاكاة التراجع (Rollback Simulation)
// ────────────────────────────────────────────────────────────

export interface RollbackEntityResult {
  entity: string;
  loadedRows: number;
  reverted: boolean;
  note: string;
}

export interface RollbackReport {
  success: boolean;
  estimatedSeconds: number;
  dataLoss: boolean;
  coverage: number; // نسبة الكيانات المحمَّلة المشمولة بالتراجع
  entities: RollbackEntityResult[];
  notes: string[];
}

// ────────────────────────────────────────────────────────────
// درجة اعتماد الترحيل (Migration Approval Score) + قواعد المنع
// ────────────────────────────────────────────────────────────

export type ReadinessVerdict = "ready" | "ready_with_warnings" | "not_ready";

export interface ScoreBreakdown {
  simulationSuccess: number;
  validationSuccess: number;
  businessIntegrity: number;
  performance: number;
  risk: number;
  rollback: number;
}

export interface ApprovalScore {
  score: number; // 0-100
  verdict: ReadinessVerdict;
  breakdown: ScoreBreakdown;
  blocked: boolean;
  blockers: string[];
  reasons: string[];
}

// ────────────────────────────────────────────────────────────
// التقرير الشامل (يُحفَظ كمشتقّات)
// ────────────────────────────────────────────────────────────

export interface SimulationSummary {
  totalSourceRows: number;
  totalTargetRows: number;
  outcomes: RowOutcomes;
  entities: number;
  relationships: number;
  dataLossCount: number;
  brokenRelations: number;
  businessFailures: number;
  criticalIssues: number;
}

export interface SimulationReport {
  summary: SimulationSummary;
  steps: ReplayStepLog[];
  byEntity: EntityBreakdown[];
  issues: SimIssue[];
  difference: DifferenceReport;
  relationships: RelationshipReport;
  business: BusinessReport;
  risk: RiskReport;
  performance: PerformanceReport;
  failure: FailureReport;
  rollback: RollbackReport;
  approval: ApprovalScore;
  recommendations: SmartRecommendation[];
}

export interface SmartRecommendation {
  order: number;
  title: string;
  detail: string;
  priority: "critical" | "high" | "medium" | "low";
  category: "ordering" | "batching" | "resources" | "data_fix" | "rules" | "rollback";
}

/** توقّع نوع حقل هدف — مشتقّ حتميًا من قواعد التحويل (المرحلة ٤). */
export interface FieldExpectation {
  field: string;
  type: "email" | "phone" | "date" | "number" | "boolean" | "enum" | "text";
  /** حقل هويّة (id/email/مفتاح) — فراغه/تكراره حرِج. */
  identity: boolean;
  /** القيم المسموحة لحقول التعداد/الحالة. */
  enumValues?: string[];
  /** الحقل المصدر (لكشف فقدان البيانات: مصدر مملوء → هدف فارغ). */
  sourceField?: string;
}

/** حدود ثابتة (أمان الأداء والخصوصية). */
export const SIM_LIMITS = {
  maxRowsPerEntity: 20_000,
  maxSamplesPerIssue: 3,
  sampleValueMaxLen: 60,
} as const;
