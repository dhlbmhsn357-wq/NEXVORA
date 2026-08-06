import Badge from "@/components/ui/Badge";
import type { EngineeringReviewEvent } from "@/lib/types/database";
import type { SecurityReviewState, DatabaseReviewState } from "./engineering-qa-panel";

function scoreTone(value: number): string {
  if (value >= 75) return "var(--v-green)";
  if (value >= 50) return "var(--v-amber)";
  return "var(--v-red)";
}

const EVENT_LABELS: Record<string, string> = {
  stage_started: "بدأت",
  stage_finished: "انتهت",
  stage_failed: "فشلت",
  stage_retried: "أُعيدت المحاولة",
  stage_cancelled: "أُلغيت",
};

/**
 * قسم Dashboard مجمّع لـ Security Audit — بيظهر نتايج المحركين المستقلين
 * (Security Audit Engine + Database Integrity Engine) جنب بعض للعرض بس،
 * من غير أي دمج فعلي في قاعدة البيانات (كل محرك مستقل تمامًا في تخزينه
 * وتشغيله — راجع lib/security-review و lib/database-review). Overall
 * Phase Score بيتحسب هنا وقت العرض فقط (متوسط النقطتين)، مش قيمة
 * محفوظة، عشان محدش من المحركين يعتمد على بيانات المحرك التاني.
 */
export default function SecurityAuditDashboard({
  securityReview,
  databaseReview,
  events,
}: {
  securityReview: SecurityReviewState;
  databaseReview: DatabaseReviewState;
  events: EngineeringReviewEvent[];
}) {
  const securityScore = securityReview.currentReview?.score_summary?.overall_security_score ?? null;
  const databaseScore = databaseReview.currentReview?.score_summary?.overall_database_score ?? null;
  const phaseScore = securityScore !== null && databaseScore !== null ? Math.round((securityScore + databaseScore) / 2) : null;

  const allFindings = [...securityReview.findings, ...databaseReview.findings];
  const criticalCount = allFindings.filter((f) => f.severity === "critical").length;
  const highCount = allFindings.filter((f) => f.severity === "high").length;

  const categoryCounts = new Map<string, number>();
  for (const f of allFindings) categoryCounts.set(f.category_key, (categoryCounts.get(f.category_key) ?? 0) + 1);

  const securityDbEvents = events.filter((e) => e.stage_key === "security_audit" || e.stage_key === "database_audit").slice(0, 10);

  const securityHistory = securityReview.reviews.filter((r) => r.status === "ready").slice(0, 5);
  const databaseHistory = databaseReview.reviews.filter((r) => r.status === "ready").slice(0, 5);

  if (securityScore === null && databaseScore === null) return null;

  return (
    <div className="mb-6 rounded-[var(--v-radius-lg)] border border-[var(--v-border)] bg-[var(--v-bg)] p-4">
      <p className="mb-3 text-sm font-semibold text-[var(--v-text)]">Security Audit — لوحة مجمّعة</p>

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
        <ScoreCard label="Overall Security Score" value={securityScore} />
        <ScoreCard label="Overall Database Score" value={databaseScore} />
        <ScoreCard label="Overall Phase Score" value={phaseScore} highlight />
        <div className="rounded-[var(--v-radius-lg)] border border-[var(--v-red)]/30 bg-[var(--v-bg)] p-3 text-center">
          <p className="font-display text-2xl text-[var(--v-red)]">{criticalCount}</p>
          <p className="mt-1 text-[11px] text-[var(--v-text-muted)]">Critical Issues</p>
        </div>
        <div className="rounded-[var(--v-radius-lg)] border border-[var(--v-amber)]/30 bg-[var(--v-bg)] p-3 text-center">
          <p className="font-display text-2xl text-[var(--v-amber)]">{highCount}</p>
          <p className="mt-1 text-[11px] text-[var(--v-text-muted)]">High Issues</p>
        </div>
      </div>

      {categoryCounts.size > 0 && (
        <div className="mb-4">
          <p className="mb-2 text-xs font-semibold text-[var(--v-text)]">Risk Heatmap — Findings حسب المحور</p>
          <div className="flex flex-wrap gap-2">
            {[...categoryCounts.entries()].map(([key, count]) => (
              <Badge key={key} tone={count >= 5 ? "danger" : count >= 2 ? "warning" : "neutral"}>
                {key}: {count}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {(securityHistory.length > 1 || databaseHistory.length > 1) && (
        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {securityHistory.length > 1 && (
            <div>
              <p className="mb-1 text-xs font-semibold text-[var(--v-text)]">Security Trends</p>
              <div className="flex flex-wrap gap-1.5">
                {[...securityHistory].reverse().map((r) => (
                  <span key={r.id} className="rounded-[var(--v-radius-sm)] border border-[var(--v-border)] px-2 py-1 text-[11px]" style={{ color: scoreTone(r.score_summary?.overall_security_score ?? 0) }}>
                    v{r.version}: {r.score_summary?.overall_security_score ?? "-"}
                  </span>
                ))}
              </div>
            </div>
          )}
          {databaseHistory.length > 1 && (
            <div>
              <p className="mb-1 text-xs font-semibold text-[var(--v-text)]">Database Trends</p>
              <div className="flex flex-wrap gap-1.5">
                {[...databaseHistory].reverse().map((r) => (
                  <span key={r.id} className="rounded-[var(--v-radius-sm)] border border-[var(--v-border)] px-2 py-1 text-[11px]" style={{ color: scoreTone(r.score_summary?.overall_database_score ?? 0) }}>
                    v{r.version}: {r.score_summary?.overall_database_score ?? "-"}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {securityDbEvents.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-semibold text-[var(--v-text)]">Security Timeline</p>
          <div className="space-y-1">
            {securityDbEvents.map((e) => (
              <div key={e.id} className="flex items-center justify-between text-[11px]">
                <span className="text-[var(--v-text)]">
                  {e.stage_key === "security_audit" ? "Security Audit" : "Database Audit"} — {EVENT_LABELS[e.event_type] ?? e.event_type}
                </span>
                <span className="text-[var(--v-text-muted)]">{new Date(e.created_at).toLocaleString("ar-EG")}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ScoreCard({ label, value, highlight }: { label: string; value: number | null; highlight?: boolean }) {
  return (
    <div className={`rounded-[var(--v-radius-lg)] border p-3 text-center ${highlight ? "border-[var(--v-primary)]" : "border-[var(--v-border)]"} bg-[var(--v-bg)]`}>
      <p className="font-display text-2xl" style={{ color: value !== null ? scoreTone(value) : "var(--v-text-muted)" }}>{value ?? "—"}</p>
      <p className="mt-1 text-[11px] text-[var(--v-text-muted)]">{label}</p>
    </div>
  );
}
