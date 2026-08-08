/**
 * NEXVORA Handoff — Pure Derivations (P12)
 */
import type {
  HandoffItemRow, HandoffItemDef, ExternalPartnerRow,
  HandoffPackageStatus,
  HandoffQuestionRow, HandoffQuestionStatus,
  HandoffDeliveryRow,
} from "./types";
import { MANDATORY_HANDOFF_KEYS, HANDOFF_ITEM_REGISTRY } from "./types";

export interface HandoffReadiness {
  mandatoryTotal: number;
  mandatoryCompleted: number;
  optionalCompleted: number;
  mandatoryPercent: number;    // 0..100
  optionalPercent: number;
  overallScore: number;         // mandatory 80% + optional 20%
  ready: boolean;               // كل الإلزاميات مكتملة
  missingMandatory: HandoffItemDef[];
}

/**
 * الجاهزية = كل الـ 7 إلزامية مكتمَلة. الاختياريات تحسّن النقاط لكن لا تمنع التسليم.
 */
export function deriveHandoffReadiness(items: readonly HandoffItemRow[]): HandoffReadiness {
  const byKey = new Map(items.map((i) => [i.itemKey, i]));
  const mandatoryDefs = HANDOFF_ITEM_REGISTRY.filter((d) => d.isMandatory);
  const optionalDefs  = HANDOFF_ITEM_REGISTRY.filter((d) => !d.isMandatory);

  const isDone = (key: string) => {
    const row = byKey.get(key);
    return row ? (row.status === "completed" || row.status === "skipped") : false;
  };

  const mandatoryCompleted = mandatoryDefs.filter((d) => isDone(d.key)).length;
  const optionalCompleted  = optionalDefs.filter((d) => isDone(d.key)).length;

  const mandatoryPercent = mandatoryDefs.length === 0 ? 0 : Math.round((mandatoryCompleted / mandatoryDefs.length) * 100);
  const optionalPercent  = optionalDefs.length === 0 ? 0 : Math.round((optionalCompleted / optionalDefs.length) * 100);

  const overallScore = Math.round((mandatoryPercent * 0.8) + (optionalPercent * 0.2));
  const missingMandatory = mandatoryDefs.filter((d) => !isDone(d.key));

  return {
    mandatoryTotal: mandatoryDefs.length,
    mandatoryCompleted,
    optionalCompleted,
    mandatoryPercent,
    optionalPercent,
    overallScore,
    ready: mandatoryCompleted === mandatoryDefs.length,
    missingMandatory,
  };
}

/**
 * الحالة الفعّالة للـ package (نستنتج ready تلقائيًا لو الإلزاميات مكتملة).
 */
export function effectivePackageStatus(
  storedStatus: HandoffPackageStatus,
  readiness: HandoffReadiness,
): HandoffPackageStatus {
  if (storedStatus === "finalized" || storedStatus === "superseded") return storedStatus;
  if (readiness.ready && storedStatus === "draft") return "ready";
  return storedStatus;
}

// ---------- Partners ----------
export function isPartnerActive(p: Pick<ExternalPartnerRow, "status" | "expiresAt" | "revokedAt">, nowISO: string): boolean {
  if (p.revokedAt) return false;
  if (p.status === "revoked" || p.status === "suspended") return false;
  if (p.expiresAt && p.expiresAt < nowISO) return false;
  return p.status === "active" || p.status === "invited";
}

export interface PartnersSummary {
  total: number;
  active: number;
  invited: number;
  suspended: number;
  revoked: number;
  expired: number;
}

export function summarizePartners(rows: readonly ExternalPartnerRow[], nowISO: string): PartnersSummary {
  const s: PartnersSummary = { total: rows.length, active: 0, invited: 0, suspended: 0, revoked: 0, expired: 0 };
  for (const p of rows) {
    if (p.revokedAt || p.status === "revoked") s.revoked++;
    else if (p.status === "suspended") s.suspended++;
    else if (p.expiresAt && p.expiresAt < nowISO) s.expired++;
    else if (p.status === "invited") s.invited++;
    else if (p.status === "active") s.active++;
  }
  return s;
}

export function ensureMandatoryKeys() {
  return MANDATORY_HANDOFF_KEYS;
}

// ---------- Handoff Questions (0107) ----------
export interface QuestionsSummary {
  total: number;
  open: number;
  answered: number;
  needsClarification: number;
  closed: number;
  byStatus: Record<HandoffQuestionStatus, number>;
}

export function summarizeQuestions(rows: readonly HandoffQuestionRow[]): QuestionsSummary {
  const byStatus: Record<HandoffQuestionStatus, number> = {
    open: 0, answered: 0, needs_clarification: 0, closed: 0,
  };
  for (const r of rows) byStatus[r.status]++;
  return {
    total: rows.length,
    open: byStatus.open,
    answered: byStatus.answered,
    needsClarification: byStatus.needs_clarification,
    closed: byStatus.closed,
    byStatus,
  };
}

// ---------- Handoff Deliveries (0107) ----------
/** ترجّع آخر تسليم زمنيًا (بأحدث updatedAt) أو null لو الصفّية فاضية. */
export function latestDelivery(rows: readonly HandoffDeliveryRow[]): HandoffDeliveryRow | null {
  if (rows.length === 0) return null;
  return rows.slice().sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))[0];
}
