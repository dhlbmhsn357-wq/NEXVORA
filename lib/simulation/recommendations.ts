/**
 * التوصيات الذكية (Smart Recommendations) — **وحدة نقية بلا I/O**.
 *
 * بعد المحاكاة، تُنتج توصيات مرتّبة بالأولوية: ابدأ بالجداول المرجعية، أجّل
 * الجداول الضخمة، أصلح العلاقات المكسورة أولًا، اضبط الدفعات والعمّال...
 * تُثري لاحقًا بتوصيات الذكاء الاصطناعي المستندة للذاكرة المؤسسية.
 */

import type {
  SmartRecommendation, EntityBreakdown, RelationshipReport, BusinessReport,
  RiskReport, PerformanceReport, SimIssue,
} from "./simulation-types";

interface RecInput {
  byEntity: EntityBreakdown[];
  issues: SimIssue[];
  relationships: RelationshipReport;
  business: BusinessReport;
  risk: RiskReport;
  performance: PerformanceReport;
}

export function buildRecommendations(input: RecInput): SmartRecommendation[] {
  const recs: Array<Omit<SmartRecommendation, "order">> = [];

  // ١) أصلح العلاقات المكسورة قبل أي شيء.
  if (input.relationships.totalBroken > 0) {
    recs.push({ title: "أصلح العلاقات المكسورة أولًا", detail: `${input.relationships.totalBroken} مرجعًا مكسورًا. رحّل الجداول المرجعية/الأب قبل الأبناء.`, priority: "critical", category: "data_fix" });
  }

  // ٢) الفشل التجاري.
  if (!input.business.passed) {
    const f = input.business.checks.filter((c) => !c.passed).map((c) => c.title).slice(0, 3).join("، ");
    recs.push({ title: "عالج فشل التحقّق التجاري", detail: `فحوص فاشلة: ${f}. راجع قواعد التحويل للحقول المالية.`, priority: "critical", category: "data_fix" });
  }

  // ٣) ترتيب الجداول: المرجعية ثم الرئيسية ثم المعاملات.
  recs.push({ title: "ابدأ بالجداول المرجعية", detail: "رحّل الجداول المرجعية والثابتة أولًا لضمان توفّر المفاتيح عند بناء العلاقات، ثم الرئيسية، وأخيرًا جداول المعاملات (الفواتير/الطلبات).", priority: "high", category: "ordering" });

  // ٤) الجداول الضخمة → تقسيم/تأجيل.
  const big = input.byEntity.filter((e) => e.sourceRows >= 5000).sort((a, b) => b.sourceRows - a.sourceRows);
  for (const e of big.slice(0, 3)) {
    recs.push({ title: `قسّم/أجّل جدول ${e.label}`, detail: `${e.sourceRows} صفًّا في العيّنة — رحّله على دفعات (${input.performance.strategy.batchSize}) وخارج ساعات الذروة.`, priority: "high", category: "batching" });
  }

  // ٥) إستراتيجية الموارد.
  recs.push({ title: "اضبط الدفعات والتوازي", detail: `Batch Size = ${input.performance.strategy.batchSize}، التوازي = ${input.performance.strategy.parallelism} عامل، الطابور = ${input.performance.strategy.queueSize}. ${input.performance.strategy.retryStrategy}`, priority: "medium", category: "resources" });

  // ٦) قواعد غير ضرورية / فقدان بيانات.
  const dataLoss = input.issues.filter((i) => i.issueType === "data_loss").reduce((s, i) => s + i.count, 0);
  if (dataLoss > 0) recs.push({ title: "سُدّ فقدان البيانات", detail: `${dataLoss} خلية فقدت قيمتها. أضف قيمًا افتراضية أو قواعد تحويل للحقول المتأثّرة.`, priority: "high", category: "rules" });

  // ٧) التراجع.
  recs.push({ title: "ثبّت خطة تراجع عكسية", detail: "احذف الأبناء قبل الآباء عند التراجع. أُثبتت جاهزية التراجع في المحاكاة الافتراضية.", priority: "low", category: "rollback" });

  const pOrder: Record<SmartRecommendation["priority"], number> = { critical: 0, high: 1, medium: 2, low: 3 };
  return recs
    .sort((a, b) => pOrder[a.priority] - pOrder[b.priority])
    .map((r, i) => ({ ...r, order: i + 1 }));
}
