/**
 * مجمِّع التقرير الشامل (Simulation Report Assembler) — **وحدة نقية بلا I/O**.
 *
 * يشغّل كل محرّكات المحاكاة بالترتيب على خطة جاهزة، ويجمّع النتائج في
 * SimulationReport واحد + SimulationSummary. هذا هو المدخل الحتمي الذي
 * تحفظه الخدمة وتُثريه بالذكاء الاصطناعي.
 */

import type { Row } from "@/lib/transformation/rule-types";
import { replayMigration } from "./replay-engine";
import { analyzeDifferences } from "./difference-analyzer";
import { validateRelationships } from "./relationship-validator";
import { validateBusiness } from "./business-validator";
import { simulatePerformance, heavyRuleCount } from "./performance-simulator";
import { simulateFailures } from "./failure-simulator";
import { simulateRollback } from "./rollback-simulator";
import { predictRisks } from "./risk-engine";
import { computeApprovalScore } from "./approval-score";
import { buildRecommendations } from "./recommendations";
import type { SimulationPlan, SimulationReport, SimulationSummary } from "./simulation-types";

/** متوسّط حجم الصفّ بالبايت من عيّنة (لتقدير الأداء). */
function estimateAvgRowBytes(rows: Row[]): number {
  if (rows.length === 0) return 200;
  const sample = rows.slice(0, 100);
  const total = sample.reduce((s, r) => s + JSON.stringify(r).length, 0);
  return Math.round(total / sample.length);
}

export function runSimulationReport(plan: SimulationPlan): SimulationReport {
  // ١) إعادة التنفيذ داخل الـTwin.
  const replay = replayMigration(plan);

  // ٢) التحليلات فوق الـTwin.
  const difference = analyzeDifferences(replay.byEntity);
  const relationships = validateRelationships(replay.twin);
  const business = validateBusiness(plan, replay.twin, replay.byEntity);

  // ٣) الأداء.
  const allRows = plan.entities.flatMap((e) => e.rows);
  const totalRules = plan.entities.reduce((s, e) => s + e.rules.length, 0);
  const performance = simulatePerformance({
    entities: plan.entities,
    totalSourceRows: allRows.length,
    avgRowBytes: estimateAvgRowBytes(allRows),
    heavyRules: heavyRuleCount(plan.entities),
    totalRules,
  });

  // ٤) الأعطال + التراجع.
  const failure = simulateFailures();
  const rollback = simulateRollback(replay.twin);

  // ٥) المخاطر (تعتمد على كل ما سبق).
  const risk = predictRisks({
    outcomes: replay.outcomes,
    byEntity: replay.byEntity,
    issues: replay.issues.concat(relationshipIssues(relationships)),
    relationships,
    business,
    performance,
    domain: plan.domain,
  });

  // ٦) درجة الاعتماد + قواعد المنع.
  const approval = computeApprovalScore({
    outcomes: replay.outcomes,
    byEntity: replay.byEntity,
    issues: replay.issues,
    relationships,
    business,
    risk,
    rollback,
  });

  // ٧) التوصيات.
  const recommendations = buildRecommendations({
    byEntity: replay.byEntity,
    issues: replay.issues,
    relationships,
    business,
    risk,
    performance,
  });

  const summary: SimulationSummary = {
    totalSourceRows: replay.byEntity.reduce((s, e) => s + e.sourceRows, 0),
    totalTargetRows: replay.byEntity.reduce((s, e) => s + e.targetRows, 0),
    outcomes: replay.outcomes,
    entities: plan.entities.length,
    relationships: plan.relationships.length,
    dataLossCount: replay.issues.filter((i) => i.issueType === "data_loss" || i.issueType === "missing_required").reduce((s, i) => s + i.count, 0),
    brokenRelations: relationships.totalBroken,
    businessFailures: business.failures,
    criticalIssues: replay.issues.filter((i) => i.severity === "critical").reduce((s, i) => s + i.count, 0),
  };

  return {
    summary,
    steps: replay.steps,
    byEntity: replay.byEntity,
    issues: replay.issues,
    difference,
    relationships,
    business,
    risk,
    performance,
    failure,
    rollback,
    approval,
    recommendations,
  };
}

/** يحوّل مشاكل العلاقات إلى SimIssue مبسّطة (لتغذية محرّك المخاطر). */
function relationshipIssues(rel: ReturnType<typeof validateRelationships>): SimulationReport["issues"] {
  return rel.checks
    .filter((c) => c.broken > 0)
    .map((c) => ({
      entity: c.fromEntity,
      category: "relationship" as const,
      issueType: "broken_relation" as const,
      field: c.toEntity,
      severity: "critical" as const,
      count: c.broken,
      message: c.message,
      samples: c.samples.map((s) => ({ oldValue: s, newValue: "—" })),
    }));
}
