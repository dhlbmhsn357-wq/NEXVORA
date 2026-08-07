/**
 * NEXVORA Product Definition — Pure Derivations (P6)
 * ==================================================
 * دوال نقيّة (بدون I/O) بتشتق مؤشرات جودة تعريف المنتج:
 *   • summarizePersonas          — عدّاد + primary count
 *   • summarizeFlows             — عدّاد + متوسط عدد الخطوات
 *   • summarizeRequirements      — توزيع MoSCoW + Status + orphans
 *   • deriveDefinitionReadiness  — نسبة جاهزية تعريف المنتج قبل PRD
 */
import type {
  PersonaRow, UserFlowRow, RequirementRow,
  FlowType, MoscowPriority, RequirementStatus,
} from "./types";

// ---------------------------------------------------------------------------
// Personas
// ---------------------------------------------------------------------------
export interface PersonasSummary {
  total: number;
  primary: number;              // is_primary = true
  distinctSegments: number;
  avgTechSavviness: number;
}

export function summarizePersonas(rows: readonly PersonaRow[]): PersonasSummary {
  const segments = new Set<string>();
  let techSum = 0;
  let primary = 0;
  for (const p of rows) {
    if (p.segment.trim()) segments.add(p.segment.trim().toLowerCase());
    techSum += p.techSavviness;
    if (p.isPrimary) primary++;
  }
  return {
    total: rows.length,
    primary,
    distinctSegments: segments.size,
    avgTechSavviness: rows.length === 0 ? 0 : Math.round(techSum / rows.length),
  };
}

// ---------------------------------------------------------------------------
// User Flows
// ---------------------------------------------------------------------------
export interface FlowsSummary {
  total: number;
  byType: Record<FlowType, number>;
  avgSteps: number;
  linkedToPersona: number;   // اللي عندها persona_id
}

const EMPTY_FLOW_BY_TYPE = (): Record<FlowType, number> => ({
  primary: 0, secondary: 0, edge: 0,
});

export function summarizeFlows(rows: readonly UserFlowRow[]): FlowsSummary {
  const byType = EMPTY_FLOW_BY_TYPE();
  let stepsSum = 0;
  let linked = 0;
  for (const f of rows) {
    byType[f.flowType]++;
    stepsSum += f.steps.length;
    if (f.personaId) linked++;
  }
  return {
    total: rows.length,
    byType,
    avgSteps: rows.length === 0 ? 0 : Math.round(stepsSum / rows.length),
    linkedToPersona: linked,
  };
}

// ---------------------------------------------------------------------------
// Requirements + MoSCoW
// ---------------------------------------------------------------------------
export interface RequirementsSummary {
  total: number;
  functional: number;
  nonFunctional: number;
  byPriority: Record<MoscowPriority, number>;
  byStatus: Record<RequirementStatus, number>;
  orphans: number;   // لا persona ولا flow مرتبط
  /** نسبة الـ Must-have من إجمالي المتطلبات (unwanted focus alarm لو > 60%). */
  mustRatio: number;
}

const EMPTY_MOSCOW = (): Record<MoscowPriority, number> => ({
  must: 0, should: 0, could: 0, wont: 0,
});
const EMPTY_REQ_STATUS = (): Record<RequirementStatus, number> => ({
  draft: 0, approved: 0, in_progress: 0, done: 0, deferred: 0,
});

export function summarizeRequirements(rows: readonly RequirementRow[]): RequirementsSummary {
  const byPriority = EMPTY_MOSCOW();
  const byStatus = EMPTY_REQ_STATUS();
  let functional = 0;
  let nonFunctional = 0;
  let orphans = 0;
  for (const r of rows) {
    byPriority[r.priority]++;
    byStatus[r.status]++;
    if (r.requirementType === "functional") functional++;
    else nonFunctional++;
    if (!r.linkedPersonaId && !r.linkedFlowId) orphans++;
  }
  const scoped = byPriority.must + byPriority.should + byPriority.could;
  return {
    total: rows.length,
    functional,
    nonFunctional,
    byPriority,
    byStatus,
    orphans,
    mustRatio: scoped === 0 ? 0 : Math.round((byPriority.must / scoped) * 100),
  };
}

// ---------------------------------------------------------------------------
// Definition Readiness — بوّابة قبل PRD (P7+)
// ---------------------------------------------------------------------------
/**
 * قواعد الجاهزية (شفافة للمستخدم في الـ UI):
 *   1. ≥ 1 persona موسومة كـ primary        — 20 نقطة
 *   2. ≥ 1 primary flow                     — 20 نقطة
 *   3. ≥ 5 متطلبات معتمدة (approved/done)  — 25 نقطة
 *   4. mustRatio ≤ 60% (تركيز صحّي)         — 15 نقطة
 *   5. ≤ 20% orphans (كل متطلب مرتبط)      — 20 نقطة
 * المجموع = 100. الحدّ للجاهزية = 70.
 */
export interface DefinitionReadiness {
  score: number;
  ready: boolean;
  checks: {
    hasPrimaryPersonaOk: boolean;
    hasPrimaryFlowOk: boolean;
    minApprovedReqsOk: boolean;
    healthyMustRatioOk: boolean;
    lowOrphanRatioOk: boolean;
  };
  breakdown: {
    primaryPersonas: number;
    primaryFlows: number;
    approvedReqs: number;
    mustRatio: number;
    orphanRatio: number;
  };
}

const READINESS_THRESHOLD = 70;

export function deriveDefinitionReadiness(
  personas: readonly PersonaRow[],
  flows: readonly UserFlowRow[],
  requirements: readonly RequirementRow[]
): DefinitionReadiness {
  const pSum = summarizePersonas(personas);
  const fSum = summarizeFlows(flows);
  const rSum = summarizeRequirements(requirements);

  const approvedReqs = rSum.byStatus.approved + rSum.byStatus.done;
  const orphanRatio = rSum.total === 0 ? 0 : Math.round((rSum.orphans / rSum.total) * 100);

  const checks = {
    hasPrimaryPersonaOk: pSum.primary >= 1,
    hasPrimaryFlowOk: fSum.byType.primary >= 1,
    minApprovedReqsOk: approvedReqs >= 5,
    // healthyMustRatioOk = false لما mustRatio > 60. لو مفيش متطلبات
    // خالص، ما نعدّهاش صحّية (يجب أن يكون فيه متطلبات).
    healthyMustRatioOk: rSum.total > 0 && rSum.mustRatio <= 60,
    lowOrphanRatioOk: rSum.total === 0 ? false : orphanRatio <= 20,
  };

  let score = 0;
  if (checks.hasPrimaryPersonaOk)  score += 20;
  if (checks.hasPrimaryFlowOk)     score += 20;
  if (checks.minApprovedReqsOk)    score += 25;
  if (checks.healthyMustRatioOk)   score += 15;
  if (checks.lowOrphanRatioOk)     score += 20;

  return {
    score,
    ready: score >= READINESS_THRESHOLD,
    checks,
    breakdown: {
      primaryPersonas: pSum.primary,
      primaryFlows: fSum.byType.primary,
      approvedReqs,
      mustRatio: rSum.mustRatio,
      orphanRatio,
    },
  };
}
