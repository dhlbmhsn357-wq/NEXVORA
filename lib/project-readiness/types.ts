/**
 * NEXVORA Project Readiness — Types
 * =================================
 *
 * الستة مقاييس الجاهزية اللي تحلّ محلّ Engineering/Publishing/Support
 * Readiness القديمة. كل مقياس بيقيس نسبة اكتمال مرحلة معيّنة من
 * Workflow v2.
 */

export type ReadinessMetricKey =
  | "discovery_completeness"
  | "problem_validation"
  | "product_definition_ready"
  | "prototype_ready"
  | "client_approval"
  | "handoff_ready";

export const READINESS_METRICS: readonly ReadinessMetricKey[] = [
  "discovery_completeness",
  "problem_validation",
  "product_definition_ready",
  "prototype_ready",
  "client_approval",
  "handoff_ready",
] as const;

export interface ReadinessMetricDefinition {
  key: ReadinessMetricKey;
  displayName: string;
  description: string;
  /** المرحلة اللي المقياس بيعكس تقدّمها في Workflow v2. */
  workflowStageKey: string;
  /** الترتيب في الـ Dashboard. */
  order: number;
}

export interface ReadinessSnapshot {
  projectId: string;
  metricKey: ReadinessMetricKey;
  /** 0-100 */
  percentage: number;
  /** breakdown اختياري لعرض السبب (كام عنصر checklist مكتمل من كل عنصر). */
  breakdown: Record<string, unknown>;
  computedAt: string;
}
