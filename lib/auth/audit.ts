import { createServiceClient } from "@/lib/supabase/service";

/**
 * مساعد تسجيل أحداث IAM في audit_log — بدل الإدراجات المتناثرة inline.
 * best-effort: فشل التسجيل ما يكسرش العملية الأصلية أبدًا.
 */

export type AuthAuditAction =
  | "login"
  | "logout"
  | "failed_login"
  | "setup_completed"
  | "user_created"
  | "user_updated"
  | "user_deleted"
  | "role_change"
  | "password_reset"
  | "password_changed"
  | "email_changed"
  | "user_locked"
  | "user_unlocked"
  | "user_deactivated"
  | "user_reactivated"
  | "user_suspended"
  // Collaboration Hub (migration 0060)
  | "message_edited"
  | "message_deleted"
  | "message_pinned"
  | "message_unpinned"
  | "announcement_published"
  | "channel_membership_changed"
  | "message_converted"
  // Work Management (migration 0061)
  | "project_member_added"
  | "project_member_removed"
  | "project_member_role_changed"
  // Delivery Lifecycle (migration 0062)
  | "ownership_assigned"
  | "ownership_transferred"
  | "delivery_approval"
  | "project_workspace_created"
  // Workflow Automation (migration 0063)
  | "workflow_executed"
  | "workflow_failed"
  | "escalation_triggered";

export interface AuthAuditParams {
  /** منفّذ الحدث — null للأحداث قبل تسجيل الدخول (فشل دخول مثلًا). */
  actorId: string | null;
  /** المستخدم المستهدف بالحدث (نفسه actorId في الدخول/الخروج). */
  targetUserId: string | null;
  action: AuthAuditAction;
  /** تفاصيل إضافية (method/ip/user_agent/old_role/new_role...). */
  details?: Record<string, unknown>;
}

export async function recordAuthEvent(params: AuthAuditParams): Promise<void> {
  try {
    const supabase = createServiceClient();
    await supabase.from("audit_log").insert({
      actor_id: params.actorId,
      entity_type: "profile",
      entity_id: params.targetUserId,
      action: params.action,
      changes: params.details ?? {},
    });
  } catch (err) {
    console.error("[IAM] audit event failed:", err instanceof Error ? err.message : err);
  }
}
