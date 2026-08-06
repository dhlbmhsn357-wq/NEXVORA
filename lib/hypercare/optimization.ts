/**
 * التوصيات الذكية للتحسين (Smart Optimization) — **وحدة نقية بلا I/O**.
 *
 * بعد تحليل الصحة والحوادث، يقترح تحسينات: قاعدة بيانات/فهارس/APIs/عمّال/
 * استعلامات/واجهة/سير عمل/تقارير. حتمي — يُثريه الذكاء الاصطناعي.
 */

import type { HealthReport, Anomaly, OptimizationSuggestion } from "./hypercare-types";

export function buildOptimizations(health: HealthReport, anomalies: Anomaly[]): OptimizationSuggestion[] {
  const out: OptimizationSuggestion[] = [];
  const has = (k: string) => anomalies.some((a) => a.kind === k);

  if (has("slow_queries") || health.breakdown.databaseHealth < 80) {
    out.push({ category: "indexes", title: "أضف فهارس على الاستعلامات البطيئة", detail: "حدّد أبطأ الاستعلامات وأضف فهارس مركّبة على أعمدة التصفية/الربط.", priority: "high", expectedGain: "تسريع الاستعلامات ٣٠-٧٠٪" });
    out.push({ category: "database", title: "راجع خطط تنفيذ الاستعلامات", detail: "استخدم EXPLAIN ANALYZE للاستعلامات الثقيلة وأعد كتابتها.", priority: "medium", expectedGain: "تقليل الحمل" });
  }
  if (has("error_spike")) {
    out.push({ category: "apis", title: "عالج أكثر Endpoints فشلًا", detail: "رتّب الأخطاء حسب التكرار وأصلح أعلاها أثرًا أولًا.", priority: "critical", expectedGain: "خفض معدّل الأخطاء" });
  }
  if (has("broken_workflow") || health.breakdown.infrastructureHealth < 80) {
    out.push({ category: "workers", title: "عزّز مرونة العمّال والطابور", detail: "أضف Retry/Heartbeat وراقب الأقفال العالقة، وزِد التوازي عند الحاجة.", priority: "high", expectedGain: "استقرار السلاسل الخلفية" });
  }
  if (health.breakdown.performanceHealth < 75) {
    out.push({ category: "queries", title: "خزّن التقارير الثقيلة مؤقتًا", detail: "فعّل Caching لنتائج التقارير المتكرّرة وقلّل إعادة الحساب.", priority: "medium", expectedGain: "استجابة أسرع للتقارير" });
    out.push({ category: "reports", title: "قسّم التقارير الكبيرة", detail: "حوّل التقارير الضخمة إلى صفحات/تجميعات مسبقة.", priority: "low", expectedGain: "تجربة أفضل" });
  }
  if (anomalies.some((a) => a.kind === "user_behavior_change")) {
    out.push({ category: "ui", title: "راجع تغيّرات الواجهة", detail: "تحقّق أن تغيّر سلوك المستخدم ليس بسبب ارتباك في الواجهة الجديدة.", priority: "low", expectedGain: "تبنٍّ أعلى" });
  }
  if (anomalies.some((a) => a.kind === "business_anomaly")) {
    out.push({ category: "workflows", title: "تحقّق من سير العمل التجاري", detail: "راجع أن الهبوط التجاري ليس بسبب Workflow معطّل بعد الترحيل.", priority: "high", expectedGain: "استعادة الاستقرار التجاري" });
  }

  const pOrder: Record<OptimizationSuggestion["priority"], number> = { critical: 0, high: 1, medium: 2, low: 3 };
  return out.sort((a, b) => pOrder[a.priority] - pOrder[b.priority]);
}
