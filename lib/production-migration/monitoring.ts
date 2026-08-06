/**
 * المراقبة الحيّة (Live Monitoring) — **وحدة نقية بلا I/O**.
 *
 * تحسب لقطة التقدّم (نسبة، سرعة، زمن متبقٍّ) من إحصاءات الدفعات، وتكتشف
 * تنبيهات تشغيلية حتمية (بطء، أخطاء متكرّرة، إعادات كثيرة) تُثريها الطبقة
 * الاستشارية بالذكاء الاصطناعي.
 */

import type { MonitoringSnapshot, MonitoringAlert } from "./execution-types";

export interface MonitorInput {
  totalRows: number;
  processedRows: number;
  elapsedSeconds: number;
  currentEntity: string | null;
  currentChunk: number | null;
  errors: number;
  warnings: number;
  retries: number;
  completedChunks: number;
  totalChunksCount: number;
}

export function computeSnapshot(i: MonitorInput): MonitoringSnapshot {
  const remainingRows = Math.max(0, i.totalRows - i.processedRows);
  const speed = i.elapsedSeconds > 0 ? Math.round(i.processedRows / i.elapsedSeconds) : 0;
  const estimatedFinishSeconds = speed > 0 ? Math.round(remainingRows / speed) : 0;
  const progress = i.totalRows > 0 ? Math.min(100, Math.round((i.processedRows / i.totalRows) * 100)) : i.totalChunksCount > 0 ? Math.round((i.completedChunks / i.totalChunksCount) * 100) : 0;
  return {
    progress,
    processedRows: i.processedRows,
    remainingRows,
    speedRowsPerSec: speed,
    currentEntity: i.currentEntity,
    currentChunk: i.currentChunk,
    estimatedFinishSeconds,
    errors: i.errors,
    warnings: i.warnings,
    retries: i.retries,
  };
}

/** تنبيهات تشغيلية حتمية (تُثرى بمقترحات AI). */
export function detectAlerts(i: MonitorInput): MonitoringAlert[] {
  const alerts: MonitoringAlert[] = [];
  const speed = i.elapsedSeconds > 0 ? i.processedRows / i.elapsedSeconds : 0;

  if (i.processedRows > 500 && speed > 0 && speed < 50) {
    alerts.push({ key: "slow_throughput", title: "إنتاجية منخفضة", severity: "warning", suggestion: "استعلامات بطيئة أو أقفال — زِد Chunk أو التوازي، وافحص الفهارس على الوجهة." });
  }
  if (i.retries > Math.max(3, i.completedChunks * 0.2)) {
    alerts.push({ key: "high_retries", title: "إعادات كثيرة", severity: "warning", suggestion: "أخطاء عابرة متكرّرة (شبكة/أقفال) — قلّل التوازي مؤقتًا وتحقّق من ضغط الوجهة." });
  }
  if (i.errors > 0 && i.completedChunks > 0 && i.errors >= i.completedChunks) {
    alerts.push({ key: "error_spike", title: "ارتفاع الأخطاء", severity: "critical", suggestion: "معدّل فشل مرتفع — أوقف مؤقتًا (Pause)، راجع طابور المراجعة، وفكّر في التراجع." });
  }
  return alerts;
}
