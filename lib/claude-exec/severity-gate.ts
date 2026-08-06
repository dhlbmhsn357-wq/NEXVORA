export interface SeverityLike {
  severity?: string;
  impact?: string | null;
}

const BLOCKING_SEVERITIES = new Set(["critical", "high", "medium"]);

/**
 * منطق حتمي خالص — بوابة القبول لأي مرحلة QA: أي Finding بشدة
 * critical/high/medium بيمنع النجاح (نفس معيار البرومت الأصلي بالحرف:
 * "حتى Critical = 0, High = 0, Medium = 0"). severity بيُقرأ من findings
 * العادية، أو impact لـ Accessibility Violations (axe-core بيستخدم
 * impact مش severity).
 */
export function hasBlockingFindings(findings: SeverityLike[]): boolean {
  return findings.some((f) => {
    const level = (f.severity ?? f.impact ?? "").toLowerCase();
    return BLOCKING_SEVERITIES.has(level);
  });
}

export function countBySeverity(findings: SeverityLike[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const f of findings) {
    const level = (f.severity ?? f.impact ?? "unknown").toLowerCase();
    counts[level] = (counts[level] ?? 0) + 1;
  }
  return counts;
}
