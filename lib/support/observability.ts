import type { SupabaseClient } from "@supabase/supabase-js";
import type { SupportObservabilityEventType } from "@/lib/types/database";

/**
 * تسجيل تشخيصي بسيط لأحداث الدعم (Escalations, Notification Delivery,
 * Widget Errors) — لأغراض التشخيص فقط، بدون أي منطق أعمال هنا.
 * AI Requests/Errors مُغطّاة بالفعل عبر ai_requests_log الموجود.
 */
export async function logSupportEvent(
  supabase: SupabaseClient,
  entry: {
    eventType: SupportObservabilityEventType;
    projectId?: string | null;
    supportRequestId?: string | null;
    success: boolean;
    message?: string;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  await supabase.from("support_observability_log").insert({
    event_type: entry.eventType,
    project_id: entry.projectId ?? null,
    support_request_id: entry.supportRequestId ?? null,
    success: entry.success,
    message: entry.message ?? null,
    metadata: entry.metadata ?? null,
  });
}
