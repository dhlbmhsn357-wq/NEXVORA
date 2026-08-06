import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveNotificationTarget } from "@/lib/navigation/targets";
import { createTaskFromSource } from "@/lib/work/source-service";
import { recordAuthEvent } from "@/lib/auth/audit";
import type { ActionSpec } from "./workflow-registry";

/**
 * منفّذ الإجراءات — الطبقة الوحيدة اللي بتترجم ActionSpec (النقي) إلى
 * أثر حقيقي، وكلها بتعيد استخدام الخدمات الموجودة (source-service للمهام،
 * جدول notifications للإشعارات، audit_log للـ Timeline). مفيش منطق قرار
 * هنا — القرار كله في workflow-registry.
 */

export interface ActionResult {
  action: string;
  ok: boolean;
  detail?: string;
}

/** يُدرج إشعارًا مباشرًا في الجدول المشترك (idempotent عبر dedupe_key). */
async function emitNotification(
  supabase: SupabaseClient,
  spec: Extract<ActionSpec, { kind: "notify" }>
): Promise<ActionResult> {
  const { data: existing } = await supabase
    .from("notifications")
    .select("id")
    .eq("dedupe_key", spec.dedupeKey)
    .maybeSingle();
  if (existing) {
    await supabase.from("notifications").update({ last_seen_at: new Date().toISOString(), source_resolved: false }).eq("id", existing.id);
    return { action: "notify", ok: true, detail: "existing" };
  }
  const target = resolveNotificationTarget({ type: spec.type, projectId: spec.projectId, recordId: spec.recordId });
  const { data: inserted, error } = await supabase
    .from("notifications")
    .insert({
      dedupe_key: spec.dedupeKey,
      type: spec.type,
      category: spec.category,
      severity: spec.severity,
      project_id: spec.projectId,
      title: spec.title,
      message: spec.message,
      target_url: target.url,
      target_module: target.tab,
      target_record_id: spec.recordId,
    })
    .select("id")
    .single();
  if (error || !inserted) return { action: "notify", ok: false, detail: error?.message ?? "insert failed" };
  await supabase.from("notification_events").insert({ notification_id: inserted.id, event_type: "created" });
  return { action: "notify", ok: true, detail: spec.dedupeKey };
}

export async function executeAction(supabase: SupabaseClient, spec: ActionSpec, actorId: string | null): Promise<ActionResult> {
  try {
    if (spec.kind === "notify") return await emitNotification(supabase, spec);
    if (spec.kind === "create_task") {
      const res = await createTaskFromSource({
        projectId: spec.projectId,
        title: spec.title,
        description: spec.description ?? null,
        priority: spec.priority,
        sourceType: spec.sourceType,
        sourceReference: spec.sourceReference,
        createdBy: actorId,
      });
      return { action: "create_task", ok: res.ok, detail: res.duplicate ? "duplicate" : res.taskId ?? res.message };
    }
    // timeline
    await recordAuthEvent({ actorId, targetUserId: null, action: spec.action, details: spec.details });
    return { action: "timeline", ok: true };
  } catch (err) {
    return { action: spec.kind, ok: false, detail: err instanceof Error ? err.message : "unknown error" };
  }
}
