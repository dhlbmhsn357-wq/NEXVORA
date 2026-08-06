import type { SupabaseClient } from "@supabase/supabase-js";
import { getNotificationChannels } from "@/lib/notifications/registry";
import { logSupportEvent } from "./observability";
import type { SupportRequest } from "@/lib/types/database";

/**
 * Dual Escalation Engine — عمليتان مستقلتان ومتوازيتان: (1) تنبيه فوري
 * عبر كل قنوات التنبيه المُسجّلة (Telegram حاليًا)، (2) الـ Case نفسها
 * (صف support_requests) اللي المفروض تكون اتعملت بالفعل قبل استدعاء
 * الدالة دي — فشل التنبيه لا يمنع ولا يمسح الـ Case أبدًا.
 */
export class EscalationService {
  static async escalate(
    supabase: SupabaseClient,
    request: SupportRequest,
    projectName: string
  ): Promise<void> {
    const summary =
      "problem_description" in request.structured_summary
        ? request.structured_summary.problem_description
        : "—";

    const channels = getNotificationChannels();
    const results = await Promise.allSettled(
      channels.map((channel) =>
        channel.send({
          projectName,
          customerIdentifier: request.customer_identifier,
          requestType: request.request_type,
          summary,
        })
      )
    );

    let anySucceeded = false;
    for (let i = 0; i < channels.length; i++) {
      const outcome = results[i];
      const ok = outcome.status === "fulfilled" && outcome.value.ok;
      anySucceeded = anySucceeded || ok;
      const errorMessage =
        outcome.status === "rejected"
          ? outcome.reason instanceof Error
            ? outcome.reason.message
            : "خطأ غير معروف"
          : outcome.value.error;

      await logSupportEvent(supabase, {
        eventType: "notification_delivery",
        projectId: request.project_id,
        supportRequestId: request.id,
        success: ok,
        message: ok ? `تم الإرسال عبر ${channels[i].name}` : errorMessage,
        metadata: { channel: channels[i].name },
      });
    }

    await logSupportEvent(supabase, {
      eventType: "escalation",
      projectId: request.project_id,
      supportRequestId: request.id,
      success: true,
      message: anySucceeded
        ? "تم إنشاء Case وإرسال تنبيه بنجاح."
        : "تم إنشاء Case، لكن فشلت كل قنوات التنبيه — راجع support_observability_log.",
    });
  }
}
