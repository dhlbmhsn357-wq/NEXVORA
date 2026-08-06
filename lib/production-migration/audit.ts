/**
 * التدقيق والأمان (Audit Trail & Security) — **وحدة نقية بلا I/O**.
 *
 * يسجّل كل شيء (من بدأ/وافق/متى/ماذا تم/فشل/أُعيد) مع **تنقية الأسرار**:
 * لا تُعرَض كلمات المرور أو الرموز أو أسرار الاتصال — تُستبدَل بـ[REDACTED].
 */

const SECRET_KEY_RE = /(password|passwd|secret|token|api[_-]?key|apikey|authorization|auth|connection[_-]?string|conn[_-]?str|credential|private[_-]?key|access[_-]?key)/i;
const REDACTED = "[REDACTED]";

/** ينقّي كائنًا (بعمق) من قيم الأسرار قبل حفظه في سجلّ التدقيق. */
export function redactSecrets(value: unknown, depth = 0): unknown {
  if (depth > 6) return value;
  if (Array.isArray(value)) return value.map((v) => redactSecrets(v, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SECRET_KEY_RE.test(k) ? REDACTED : redactSecrets(v, depth + 1);
    }
    return out;
  }
  return value;
}

export type AuditEventType =
  | "created" | "preflight_run" | "backup_started" | "backup_ready" | "execution_started"
  | "chunk_completed" | "chunk_failed" | "chunk_retried" | "chunk_skipped" | "paused"
  | "resumed" | "aborted" | "completed" | "failed" | "rollback_started" | "rollback_completed"
  | "recovery_applied" | "conflict_detected" | "promoted";

export interface AuditEvent {
  eventType: AuditEventType;
  actorId: string | null;
  detail: Record<string, unknown>;
}

/** يبني حدث تدقيق منقّى من الأسرار وجاهزًا للحفظ. */
export function buildAuditEvent(eventType: AuditEventType, actorId: string | null, detail: Record<string, unknown> = {}): AuditEvent {
  return { eventType, actorId, detail: redactSecrets(detail) as Record<string, unknown> };
}
