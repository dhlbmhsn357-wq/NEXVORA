import type { AuditFindingSeverity, MonitoringOverallStatus } from "@/lib/types/database";
import type { PageCheckResult } from "./check-runner";

const SEVERITY_PENALTY: Record<AuditFindingSeverity, number> = {
  critical: 25,
  high: 12,
  medium: 5,
  low: 2,
  info: 0.5,
};

/** درجة الصحة العامة (0-100) — حسابية بالكامل من خطورة الحوادث المفتوحة، نفس صيغة كل محركات الفحص السابقة. */
export function computeHealthScore(openIncidentSeverities: AuditFindingSeverity[]): number {
  const penalty = openIncidentSeverities.reduce((sum, s) => sum + SEVERITY_PENALTY[s], 0);
  return Math.max(0, Math.min(100, Math.round(100 - penalty)));
}

/** درجة الأداء (0-100) — من زمن الاستجابة الفعلي المُقاس، مش تخمين. */
export function computePerformanceScore(results: PageCheckResult[]): number {
  const reachable = results.filter((r) => r.reachable && r.responseTimeMs !== null);
  if (reachable.length === 0) return 0;
  const avgResponseMs = reachable.reduce((sum, r) => sum + r.responseTimeMs, 0) / reachable.length;
  if (avgResponseMs <= 500) return 100;
  if (avgResponseMs >= 5000) return 0;
  return Math.round(100 - ((avgResponseMs - 500) / (5000 - 500)) * 100);
}

/** حالة عامة (Healthy/Degraded/Down) — منطق حتمي بسيط من الأدلة الفعلية. */
export function computeOverallStatus(results: PageCheckResult[]): MonitoringOverallStatus {
  const allUnreachable = results.length > 0 && results.every((r) => !r.reachable);
  if (allUnreachable) return "down";
  const anyUnreachable = results.some((r) => !r.reachable);
  const anySlow = results.some((r) => r.responseTimeMs > 3000);
  if (anyUnreachable || anySlow) return "degraded";
  return "healthy";
}
