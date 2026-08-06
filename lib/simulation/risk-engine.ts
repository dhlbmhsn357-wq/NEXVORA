/**
 * محرّك تنبّؤ المخاطر (Risk Prediction) — **النواة الحتمية**، وحدة نقية.
 *
 * يستخرج Risk Score، احتمال الفشل، الجداول والعمليات الحرجة، والاختناقات
 * من نتائج المحاكاة (المشاكل + العلاقات + الأداء + التراجع). يُثريه الذكاء
 * الاصطناعي لاحقًا مستندًا إلى Knowledge Hub وDomain وOrganizational Memory.
 */

import type {
  SimIssue, EntityBreakdown, RelationshipReport, BusinessReport, PerformanceReport,
  RiskReport, RiskItem, RiskLevel, RowOutcomes,
} from "./simulation-types";

interface RiskInput {
  outcomes: RowOutcomes;
  byEntity: EntityBreakdown[];
  issues: SimIssue[];
  relationships: RelationshipReport;
  business: BusinessReport;
  performance: PerformanceReport;
  domain: string;
}

const LARGE_TABLE_ROWS = 5000;

export function predictRisks(input: RiskInput): RiskReport {
  const risks: RiskItem[] = [];
  const criticalTables = new Set<string>();
  const criticalOperations = new Set<string>();
  const bottlenecks: string[] = [];

  const totalRows = input.byEntity.reduce((s, e) => s + e.sourceRows, 0) || 1;
  const failRate = input.outcomes.failed / totalRows;
  const criticalIssues = input.issues.filter((i) => i.severity === "critical").reduce((s, i) => s + i.count, 0);
  const dataLoss = input.issues.filter((i) => i.issueType === "data_loss" || i.issueType === "missing_required").reduce((s, i) => s + i.count, 0);

  // ١) علاقات مكسورة → حرج.
  if (input.relationships.totalBroken > 0) {
    risks.push(risk("broken_relations", "علاقات مرجعية مكسورة", "critical", 90, `${input.relationships.totalBroken} مرجعًا مكسورًا — يهدّد سلامة البيانات.`, "أصلح مصادر المفاتيح الأجنبية قبل الترحيل، أو رحّل الجداول المرجعية أولًا."));
    for (const c of input.relationships.checks) if (c.broken > 0) criticalTables.add(c.fromEntity);
  }

  // ٢) فشل تجاري → حرج.
  if (!input.business.passed) {
    risks.push(risk("business_failure", "فشل تحقّق تجاري", "critical", 85, `${input.business.failures} فحصًا تجاريًا فشل (أرصدة/إجماليات/عدّ).`, "راجع قواعد التحويل للحقول المالية وأعد المحاكاة."));
    for (const c of input.business.checks) if (!c.passed) criticalTables.add(c.entity);
  }

  // ٣) فقدان بيانات → عالٍ.
  if (dataLoss > 0) {
    risks.push(risk("data_loss", "فقدان بيانات محتمل", dataLoss > totalRows * 0.05 ? "critical" : "high", 70, `${dataLoss} خلية فقدت قيمتها أو حقل مطلوب فارغ.`, "أضف قواعد افتراضية أو قواعد تحويل للحقول المتأثّرة."));
  }

  // ٤) معدّل فشل الصفوف.
  if (failRate > 0.02) {
    risks.push(risk("row_failures", "معدّل فشل صفوف مرتفع", failRate > 0.1 ? "critical" : "high", Math.round(failRate * 100), `${(failRate * 100).toFixed(1)}٪ من الصفوف فشلت في التحويل.`, "افحص أخطاء القواعد في الكتالوج وصحّحها."));
    criticalOperations.add("التحويل (Transformation)");
  }

  // ٥) جداول كبيرة → مخاطر أداء/مهلة/ذاكرة.
  for (const e of input.byEntity) {
    if (e.sourceRows >= LARGE_TABLE_ROWS) {
      criticalTables.add(e.entity);
      risks.push(risk(`large:${e.entity}`, `جدول كبير: ${e.label}`, "medium", 40, `${e.sourceRows} صفًّا في العيّنة — يتضخّم في الإنتاج.`, "قسّم على دفعات أصغر وزِد التوازي.", e.entity));
    }
  }

  // ٦) اختناقات الأداء.
  const million = input.performance.scenarios.find((s) => s.rows === 1_000_000);
  if (million && million.estimatedDowntimeSeconds > 3600) {
    bottlenecks.push(`زمن توقّف متوقّع > ساعة عند المليون (${Math.round(million.estimatedDowntimeSeconds / 60)} دقيقة).`);
    risks.push(risk("timeout", "خطر مهلة/توقّف طويل", "high", 55, "زمن الترحيل المتوقّع يتجاوز نافذة صيانة معقولة.", "رحّل على مراحل (Incremental) خارج ساعات الذروة."));
    criticalOperations.add("التحميل (Loading)");
  }
  if (million && million.peakMemoryMb > 1024) bottlenecks.push(`ذروة ذاكرة عالية (${million.peakMemoryMb}MB) — قلّل Batch Size.`);

  const failureProbability = clamp(
    input.relationships.totalBroken > 0 ? 60 : 0,
    Math.round(failRate * 100 * 3),
    !input.business.passed ? 50 : 0,
    criticalIssues > 0 ? 40 : 0
  );

  const riskScore = clamp(
    input.relationships.totalBroken > 0 ? 35 : 0,
    !input.business.passed ? 30 : 0,
    dataLoss > 0 ? 20 : 0,
    Math.round(failRate * 100 * 2),
    criticalTables.size * 4,
    bottlenecks.length * 6
  );

  return {
    riskScore: Math.min(100, riskScore),
    level: toLevel(Math.min(100, riskScore)),
    failureProbability: Math.min(100, failureProbability),
    criticalTables: [...criticalTables],
    criticalOperations: [...criticalOperations],
    bottlenecks,
    risks: risks.sort((a, b) => weight(b.level) - weight(a.level) || b.probability - a.probability),
  };
}

function risk(key: string, title: string, level: RiskLevel, probability: number, reason: string, mitigation: string, entity?: string): RiskItem {
  return { key, title, level, probability, entity, reason, mitigation };
}
function clamp(...nums: number[]): number {
  return Math.max(0, Math.min(100, nums.reduce((s, n) => s + n, 0)));
}
function toLevel(score: number): RiskLevel {
  if (score >= 70) return "critical";
  if (score >= 45) return "high";
  if (score >= 20) return "medium";
  return "low";
}
function weight(l: RiskLevel): number {
  return { low: 0, medium: 1, high: 2, critical: 3 }[l];
}
