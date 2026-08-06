/**
 * كشف الشذوذ (Anomaly Detection) — **وحدة نقية بلا I/O**.
 *
 * يقارن المقاييس الحالية بالمرجعية (baseline) ويكشف الانحرافات: هبوط أداء،
 * ارتفاع أخطاء، استعلامات بطيئة، شذوذ تجاري/بيانات، تغيّر سلوك. حتمي —
 * يُثريه الذكاء الاصطناعي بجذور الأسباب.
 */

import type { MetricPoint, Anomaly, IncidentSeverity, HealthSignals, AnomalyKind } from "./hypercare-types";

const DROP_THRESHOLD = 20; // ٪ هبوط يُعدّ شذوذًا.
const SPIKE_THRESHOLD = 50; // ٪ ارتفاع في مقياس سلبي (أخطاء).

function severityFor(dev: number): IncidentSeverity {
  const a = Math.abs(dev);
  if (a >= 60) return "critical";
  if (a >= 40) return "high";
  if (a >= 20) return "medium";
  return "low";
}

/** يكشف شذوذ المقاييس التجارية (مبيعات/فواتير/عملاء/طلبات/حركات...). */
export function detectBusinessAnomalies(metrics: MetricPoint[]): Anomaly[] {
  const out: Anomaly[] = [];
  for (const m of metrics) {
    if (m.baseline <= 0) continue;
    const dev = Math.round(((m.current - m.baseline) / m.baseline) * 100);
    // هبوط حادّ في مقياس تجاري = شذوذ.
    if (dev <= -DROP_THRESHOLD) {
      out.push({ kind: "business_anomaly", metric: m.key, label: m.label, deviationPercent: dev, severity: severityFor(dev), description: `هبوط ${Math.abs(dev)}٪ في ${m.label} (من ${m.baseline} إلى ${m.current}).` });
    }
  }
  return out;
}

/** يكشف شذوذ الأداء والأخطاء من إشارات الصحة. */
export function detectTechnicalAnomalies(s: HealthSignals, baselineQueryMs: number): Anomaly[] {
  const out: Anomaly[] = [];
  if (baselineQueryMs > 0 && s.avgQueryMs > baselineQueryMs * (1 + SPIKE_THRESHOLD / 100)) {
    const dev = Math.round(((s.avgQueryMs - baselineQueryMs) / baselineQueryMs) * 100);
    out.push({ kind: "slow_queries", metric: "avg_query_ms", label: "زمن الاستعلام", deviationPercent: dev, severity: severityFor(dev), description: `زمن الاستعلام ارتفع ${dev}٪ (${s.avgQueryMs}ms مقابل ${baselineQueryMs}ms).` });
  }
  if (s.errorRatePercent > 2) {
    const sev: IncidentSeverity = s.errorRatePercent > 10 ? "critical" : s.errorRatePercent > 5 ? "high" : "medium";
    out.push({ kind: "error_spike", metric: "error_rate", label: "معدّل الأخطاء", deviationPercent: Math.round(s.errorRatePercent), severity: sev, description: `معدّل الأخطاء ${s.errorRatePercent}٪ — أعلى من الحدّ الآمن.` });
  }
  if (!s.workersActive || !s.queuesOk) {
    out.push({ kind: "broken_workflow", metric: "workers", label: "العمّال/الطابور", deviationPercent: -100, severity: "high", description: "توقّف العمّال أو الطابور — سير العمل الخلفي متأثّر." });
  }
  if (!s.databaseOk) {
    out.push({ kind: "performance_drop", metric: "database", label: "قاعدة البيانات", deviationPercent: -100, severity: "critical", description: "قاعدة البيانات غير متاحة." });
  }
  return out;
}

export function anomalyKindLabel(k: AnomalyKind): string {
  const m: Record<AnomalyKind, string> = {
    performance_drop: "هبوط أداء", error_spike: "ارتفاع أخطاء", slow_queries: "استعلامات بطيئة",
    broken_workflow: "سير عمل معطّل", business_anomaly: "شذوذ تجاري", data_anomaly: "شذوذ بيانات", user_behavior_change: "تغيّر سلوك",
  };
  return m[k];
}
