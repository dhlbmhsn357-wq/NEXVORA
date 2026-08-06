/**
 * أنواع مركز Hypercare والمراقبة الذكية والتحسين المستمر — **وحدة نقية**.
 *
 * المرحلة ٨ (الأخيرة): *Migration Success Does NOT End At Go Live — The
 * System Must Continue Learning.* بعد الإطلاق تراقب VELORA المشروع لحظيًّا،
 * تكتشف المشكلات، تتعلّم منها، وتُحسّن كل مشروع مستقبلي. تُكمل حزمة
 * **VELORA Enterprise Migration Intelligence Suite (EMIS)**.
 */

export type HypercareStatus = "active" | "ending" | "closed";
export type IncidentStatus = "open" | "investigating" | "resolved" | "closed";
export type IncidentSeverity = "critical" | "high" | "medium" | "low";
export type Detector = "ai" | "rule" | "manual";

/** مدد Hypercare القياسية (يوم). */
export const HYPERCARE_DURATIONS = [7, 14, 30, 60, 90] as const;

// ────────────────────────────────────────────────────────────
// درجة الصحة المستمرة (Continuous Health Score)
// ────────────────────────────────────────────────────────────

export interface HealthSignals {
  databaseOk: boolean;
  apiOk: boolean;
  storageOk: boolean;
  queuesOk: boolean;
  workersActive: boolean;
  cacheOk: boolean;
  avgQueryMs: number;
  errorRatePercent: number; // 0-100
  businessStable: boolean; // لا شذوذ تجاري حرج
}

export interface HealthBreakdown {
  systemHealth: number;
  businessHealth: number;
  performanceHealth: number;
  migrationStability: number;
  databaseHealth: number;
  infrastructureHealth: number;
}

export interface HealthReport {
  breakdown: HealthBreakdown;
  overall: number; // 0-100
  status: "healthy" | "degraded" | "critical";
}

// ────────────────────────────────────────────────────────────
// كشف الشذوذ (Anomaly Detection)
// ────────────────────────────────────────────────────────────

export type AnomalyKind =
  | "performance_drop" | "error_spike" | "slow_queries" | "broken_workflow"
  | "business_anomaly" | "data_anomaly" | "user_behavior_change";

export interface MetricPoint {
  key: string;
  label: string;
  baseline: number; // القيمة المرجعية (قبل/متوسّط تاريخي)
  current: number;
}

export interface Anomaly {
  kind: AnomalyKind;
  metric: string;
  label: string;
  deviationPercent: number;
  severity: IncidentSeverity;
  description: string;
}

// ────────────────────────────────────────────────────────────
// الحوادث (Incidents)
// ────────────────────────────────────────────────────────────

export interface IncidentDraft {
  title: string;
  severity: IncidentSeverity;
  impact: string;
  affectedModules: string[];
  suggestedSolution: string;
  confidence: number; // 0-100
  detectedBy: Detector;
}

// ────────────────────────────────────────────────────────────
// التوصيات (Smart Optimization)
// ────────────────────────────────────────────────────────────

export type OptimizationCategory =
  | "database" | "indexes" | "apis" | "workers" | "queries" | "ui" | "workflows" | "reports";

export interface OptimizationSuggestion {
  category: OptimizationCategory;
  title: string;
  detail: string;
  priority: "critical" | "high" | "medium" | "low";
  expectedGain: string;
}

// ────────────────────────────────────────────────────────────
// تحليل الاتجاهات (Trend Analysis)
// ────────────────────────────────────────────────────────────

export interface TrendSeries {
  key: string;
  label: string;
  points: number[]; // مرتّبة زمنيًّا
}

export interface TrendResult {
  key: string;
  label: string;
  direction: "up" | "down" | "flat";
  changePercent: number;
  note: string;
}

// ────────────────────────────────────────────────────────────
// التعلّم المستمر (Continuous Learning) — اقتراح معرفة (مراجعة المدير)
// ────────────────────────────────────────────────────────────

export type KnowledgeSuggestionKind = "lesson" | "pattern" | "business_rule";

export interface KnowledgeSuggestionDraft {
  kind: KnowledgeSuggestionKind;
  title: string;
  content: string;
  confidence: number;
}

// ────────────────────────────────────────────────────────────
// إغلاق المشروع + رضا العميل (Project Closure)
// ────────────────────────────────────────────────────────────

export interface ClosureInput {
  projectName: string;
  hypercareDays: number;
  totalIncidents: number;
  resolvedIncidents: number;
  optimizationsApplied: number;
  knowledgeAdded: number;
  finalHealthScore: number;
  goLiveScore: number;
  satisfactionScore: number;
}

export interface ClosureReport {
  migrationSummary: string;
  hypercareSummary: string;
  finalHealthScore: number;
  businessSatisfaction: number;
  customerSatisfaction: number;
  closed: boolean;
  highlights: string[];
}
