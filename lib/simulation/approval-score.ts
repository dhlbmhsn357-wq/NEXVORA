/**
 * درجة اعتماد الترحيل (Migration Approval Score) — **وحدة نقية بلا I/O**.
 *
 * تجمّع الدرجات الفرعية (نجاح المحاكاة، التحقّق، السلامة التجارية، الأداء،
 * المخاطر، التراجع) في درجة من ١٠٠. **قواعد المنع (Blocking Rules)**: أي
 * فقدان بيانات، علاقات مكسورة، فشل قاعدة عمل، أخطاء حرجة، أو فشل تراجع
 * يمنع الترحيل الحقيقي تمامًا (verdict = not_ready).
 */

import type {
  RowOutcomes, EntityBreakdown, SimIssue, RelationshipReport, BusinessReport,
  RiskReport, RollbackReport, ApprovalScore, ReadinessVerdict, ScoreBreakdown,
} from "./simulation-types";

interface ScoreInput {
  outcomes: RowOutcomes;
  byEntity: EntityBreakdown[];
  issues: SimIssue[];
  relationships: RelationshipReport;
  business: BusinessReport;
  risk: RiskReport;
  rollback: RollbackReport;
}

export function computeApprovalScore(input: ScoreInput): ApprovalScore {
  const totalRows = input.byEntity.reduce((s, e) => s + e.sourceRows, 0) || 1;
  const validationErrors = input.issues.filter((i) => i.category === "validation").reduce((s, i) => s + i.count, 0);
  const dataLoss = input.issues.filter((i) => i.issueType === "data_loss" || i.issueType === "missing_required").reduce((s, i) => s + i.count, 0);
  const criticalErrors = input.issues.filter((i) => i.severity === "critical").reduce((s, i) => s + i.count, 0);

  const breakdown: ScoreBreakdown = {
    simulationSuccess: pct(1 - input.outcomes.failed / totalRows),
    validationSuccess: pct(1 - Math.min(1, validationErrors / totalRows)),
    businessIntegrity: input.business.checks.length ? pct(input.business.checks.filter((c) => c.passed).length / input.business.checks.length) : 100,
    performance: bottleneckScore(input.risk.bottlenecks.length),
    risk: 100 - input.risk.riskScore,
    rollback: input.rollback.success && !input.rollback.dataLoss ? 100 : 0,
  };

  // أوزان: النجاح والتحقّق والسلامة التجارية هي الأثقل.
  const score = Math.round(
    breakdown.simulationSuccess * 0.22 +
    breakdown.validationSuccess * 0.18 +
    breakdown.businessIntegrity * 0.22 +
    breakdown.performance * 0.08 +
    breakdown.risk * 0.2 +
    breakdown.rollback * 0.1
  );

  // ── قواعد المنع ──
  const blockers: string[] = [];
  if (dataLoss > 0) blockers.push(`فقدان بيانات: ${dataLoss} خلية/حقل مطلوب مفقود.`);
  if (input.relationships.totalBroken > 0) blockers.push(`علاقات مكسورة: ${input.relationships.totalBroken} مرجعًا.`);
  if (!input.business.passed) blockers.push(`فشل تحقّق تجاري: ${input.business.failures} فحصًا.`);
  if (criticalErrors > 0) blockers.push(`أخطاء حرجة: ${criticalErrors}.`);
  if (!input.rollback.success || input.rollback.dataLoss) blockers.push("فشل محاكاة التراجع.");

  const blocked = blockers.length > 0;
  const verdict: ReadinessVerdict = blocked ? "not_ready" : score >= 90 ? "ready" : score >= 70 ? "ready_with_warnings" : "not_ready";

  const reasons: string[] = [];
  if (blocked) reasons.push("توجد قواعد منع فعّالة — الترحيل الحقيقي محظور حتى تُحلّ.");
  else if (verdict === "ready") reasons.push("كل الفحوص ضمن الحدود الآمنة — جاهز للترحيل الحقيقي.");
  else if (verdict === "ready_with_warnings") reasons.push("جاهز مع تحذيرات — راجع التوصيات قبل الإطلاق.");
  else reasons.push("الدرجة أقل من الحدّ الآمن — عالج المخاطر وأعد المحاكاة.");

  return { score: Math.max(0, Math.min(100, score)), verdict, breakdown, blocked, blockers, reasons };
}

function pct(ratio: number): number {
  return Math.max(0, Math.min(100, Math.round(ratio * 100)));
}
function bottleneckScore(n: number): number {
  return Math.max(0, 100 - n * 20);
}
