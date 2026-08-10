/**
 * NEXVORA Project Readiness — Compute
 * ===================================
 *
 * حساب نسبة كل مقياس من عناصر Checklist المرحلة المقابلة.
 * منطق نقيّ (Pure) — بدون DB access. يستقبل حالة العناصر ويرجّع النسب.
 */

import { ALL_V2_STAGES, WORKFLOW_V2_CHECKLISTS, type WorkflowV2StageKey } from "@/lib/workflow-v2";
import type { WorkflowV2ChecklistItemState } from "@/lib/workflow-v2";
import { READINESS_METRICS_ORDERED, getReadinessKeyForStage } from "./registry";
import type { ReadinessMetricKey } from "./types";

export interface ComputedReadinessItem {
  itemKey: string;
  label: string;
  description: string;
  isMandatory: boolean;
  status: "completed" | "skipped" | "in_progress" | "blocked" | "not_started";
  weight: number;
}

export interface ComputedReadiness {
  metric: ReadinessMetricKey;
  percentage: number;
  breakdown: {
    mandatoryTotal: number;
    mandatoryCompleted: number;
    optionalTotal: number;
    optionalCompleted: number;
  };
  items: ComputedReadinessItem[];
}

/**
 * يحسب نسبة الاكتمال لمقياس واحد بناءً على حالة عناصر Checklist لمرحلته.
 *
 * القاعدة:
 *   • العناصر الإلزامية = 80% من الوزن الكلي.
 *   • العناصر الاختيارية = 20% من الوزن الكلي.
 *   • لو المرحلة كلها بلا عناصر إلزامية، الاختيارية تاخد 100%.
 *   • حالة "skipped" تُعامَل كمكتملة (المستخدم قرّر تخطّيها بوعي).
 *   • حالة "blocked" لا تُعدّ اكتمالًا.
 */
export function computeReadinessForStage(
  stage: WorkflowV2StageKey,
  itemStates: WorkflowV2ChecklistItemState[]
): ComputedReadiness {
  const metric = getReadinessKeyForStage(stage);
  if (!metric) {
    throw new Error(`No readiness metric for workflow stage: ${stage}`);
  }
  const items = WORKFLOW_V2_CHECKLISTS[stage];
  const stateByKey = new Map(itemStates.map((s) => [s.itemKey, s.status]));

  let mandatoryTotal = 0;
  let mandatoryCompleted = 0;
  let optionalTotal = 0;
  let optionalCompleted = 0;
  const itemsOut: ComputedReadinessItem[] = [];

  for (const item of items) {
    const state = stateByKey.get(item.itemKey) ?? "not_started";
    const done = state === "completed" || state === "skipped";
    if (item.isMandatory) {
      mandatoryTotal++;
      if (done) mandatoryCompleted++;
    } else {
      optionalTotal++;
      if (done) optionalCompleted++;
    }
    itemsOut.push({
      itemKey: item.itemKey,
      label: item.displayName,
      description: item.description,
      isMandatory: item.isMandatory,
      status: state,
      // Weight — mandatory items share 80% pie, optional share 20% pie.
      weight: item.isMandatory ? 80 : 20,
    });
  }

  let percentage: number;
  if (mandatoryTotal === 0 && optionalTotal === 0) {
    percentage = 0;
  } else if (mandatoryTotal === 0) {
    percentage = Math.round((optionalCompleted / optionalTotal) * 100);
  } else if (optionalTotal === 0) {
    percentage = Math.round((mandatoryCompleted / mandatoryTotal) * 100);
  } else {
    const mandatoryScore = (mandatoryCompleted / mandatoryTotal) * 80;
    const optionalScore = (optionalCompleted / optionalTotal) * 20;
    percentage = Math.round(mandatoryScore + optionalScore);
  }
  // clamp defensively
  percentage = Math.max(0, Math.min(100, percentage));

  return {
    metric,
    percentage,
    breakdown: { mandatoryTotal, mandatoryCompleted, optionalTotal, optionalCompleted },
    items: itemsOut,
  };
}

/** يحسب كل الستة مقاييس دفعة واحدة (منظّم بترتيبها في الـ Dashboard). */
export function computeAllReadiness(
  itemStatesByStage: Partial<Record<WorkflowV2StageKey, WorkflowV2ChecklistItemState[]>>
): ComputedReadiness[] {
  return READINESS_METRICS_ORDERED.map((def) => {
    const stage = def.workflowStageKey as WorkflowV2StageKey;
    const states = itemStatesByStage[stage] ?? [];
    return computeReadinessForStage(stage, states);
  });
}

/**
 * درجة كلية للمشروع = متوسط الستة مقاييس (بدون أوزان — كلهم متساوين).
 * تُستخدم في Dashboard للمشروع كـ "Overall Product Readiness".
 */
export function computeOverallReadiness(metrics: ComputedReadiness[]): number {
  if (metrics.length === 0) return 0;
  const sum = metrics.reduce((acc, m) => acc + m.percentage, 0);
  return Math.round(sum / metrics.length);
}

/** يتحقق إن كل الـ 6 مقاييس موجودة (helper للـ Dashboard). */
export function hasAllReadinessMetrics(metrics: ComputedReadiness[]): boolean {
  const keys = new Set(metrics.map((m) => m.metric));
  return READINESS_METRICS_ORDERED.every((def) => keys.has(def.key));
}

/** كل الـ stages اللي في Workflow v2 (للاستخدام في الحسابات المجمّعة). */
export const ALL_READINESS_STAGES: readonly WorkflowV2StageKey[] = ALL_V2_STAGES;
