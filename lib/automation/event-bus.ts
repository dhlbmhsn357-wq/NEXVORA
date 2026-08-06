import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { recordAuthEvent } from "@/lib/auth/audit";
import type { AutomationEvent } from "./events";
import { workflowsForEvent, shouldRun } from "./workflow-registry";
import { executeAction, type ActionResult } from "./actions";

/**
 * Event Bus — قلب محرّك الأتمتة. أي وحدة في المنصة بتنادي emitEvent عند
 * فعل مهم، فيتخزّن الحدث في platform_events (سجل مركزي) وتشتغل كل الـ
 * Workflows المرتبطة به تلقائيًا، وكل تنفيذ بيتسجّل في workflow_executions.
 *
 * best-effort: أي فشل في الأتمتة مبيكسرش العملية الأصلية أبدًا (بينستدعى
 * عادةً داخل after() في الـ Server Actions). idempotent عبر dedupeKey على
 * مستوى الحدث + قيد فريد (workflow_id, event_id) على مستوى التنفيذ.
 */

function eventDedupeKey(event: AutomationEvent): string {
  return `${event.type}:${event.recordId ?? event.projectId ?? "global"}`;
}

export async function emitEvent(event: AutomationEvent): Promise<void> {
  try {
    const supabase = createServiceClient();

    // 1) تخزين الحدث (idempotent) — لو اتخزّن قبل كده نجيب معرّفه
    const dedupe = eventDedupeKey(event);
    let eventId: string | null = null;
    const { data: inserted } = await supabase
      .from("platform_events")
      .insert({
        event_type: event.type,
        project_id: event.projectId,
        actor_id: event.actorId,
        dedupe_key: dedupe,
        payload: event.payload,
      })
      .select("id")
      .maybeSingle();
    if (inserted) {
      eventId = inserted.id;
    } else {
      const { data: existing } = await supabase.from("platform_events").select("id").eq("dedupe_key", dedupe).maybeSingle();
      eventId = existing?.id ?? null;
    }

    // 2) تشغيل كل Workflow مرتبط بالحدث
    const workflows = workflowsForEvent(event.type);
    for (const wf of workflows) {
      // منع تكرار تنفيذ نفس (workflow, event)
      if (eventId) {
        const { data: prev } = await supabase
          .from("workflow_executions")
          .select("id")
          .eq("workflow_id", wf.id)
          .eq("event_id", eventId)
          .maybeSingle();
        if (prev) continue;
      }

      if (!shouldRun(wf, event)) {
        await supabase.from("workflow_executions").insert({
          workflow_id: wf.id,
          event_id: eventId,
          event_type: event.type,
          project_id: event.projectId,
          status: "skipped",
          actions_run: [],
        });
        continue;
      }

      const specs = wf.buildActions(event);
      const results: ActionResult[] = [];
      for (const spec of specs) results.push(await executeAction(supabase, spec, event.actorId));

      const failed = results.filter((r) => !r.ok);
      await supabase.from("workflow_executions").insert({
        workflow_id: wf.id,
        event_id: eventId,
        event_type: event.type,
        project_id: event.projectId,
        status: failed.length > 0 && failed.length === results.length ? "failed" : "completed",
        actions_run: results,
        error: failed.length ? failed.map((f) => `${f.action}: ${f.detail}`).join("; ") : null,
      });

      await recordAuthEvent({
        actorId: event.actorId,
        targetUserId: null,
        action: failed.length === results.length && results.length > 0 ? "workflow_failed" : "workflow_executed",
        details: { workflow: wf.id, event: event.type, project_id: event.projectId, actions: results.length, failed: failed.length },
      });
    }
  } catch (err) {
    console.error("[Automation] emitEvent failed:", err instanceof Error ? err.message : err);
  }
}
