import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { getWhatsAppProvider } from "./registry";
import { withTimeout } from "./retry";
import { WhatsAppError, WhatsAppConfigError } from "./errors";
import type {
  WhatsAppProvider,
  WhatsAppSendRequest,
  WhatsAppSendResponse,
  WhatsAppWebhookEvent,
} from "./types";
import type {
  WhatsAppMessagePurpose,
  WhatsAppProviderName,
  WhatsAppSettings,
} from "@/lib/types/database";

const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 500;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export interface WhatsAppServiceDispatchInput {
  request: WhatsAppSendRequest;
  actorId?: string | null;
  projectId?: string | null;
  messageId?: string | null;
}

/**
 * WhatsAppService هو المدخل الوحيد لأي إرسال. أي كود آخر (server actions،
 * reminder engine، webhook) يمر من هنا فقط.
 *
 * الترتيب: WhatsAppService.dispatch → Provider → API
 * الـ Retry مبنيّ داخليًا (bounded) وفشل النهاية بيتسجّل في whatsapp_requests_log.
 */
export class WhatsAppService {
  static async getSettings(supabase?: SupabaseClient): Promise<WhatsAppSettings> {
    const sb = supabase ?? createServiceClient();
    const { data } = await sb
      .from("whatsapp_settings")
      .select("*")
      .eq("scope", "global")
      .maybeSingle();
    if (!data) {
      // fallback آمن — نفس القيم الافتراضية في migration 0022
      return {
        scope: "global",
        provider: "noop",
        default_country: "EG",
        default_link_expiration_days: 7,
        reminders_enabled: true,
        reminder_max_count: 2,
        reminder_interval_hours: 48,
        updated_at: new Date().toISOString(),
        updated_by: null,
      };
    }
    return data as WhatsAppSettings;
  }

  static async dispatch(
    input: WhatsAppServiceDispatchInput
  ): Promise<WhatsAppSendResponse> {
    const supabase = createServiceClient();
    const settings = await this.getSettings(supabase);
    const providerName = settings.provider;

    let provider: WhatsAppProvider;
    try {
      provider = getWhatsAppProvider(providerName);
    } catch (err) {
      const message = err instanceof Error ? err.message : "مزوّد غير معروف";
      const resp: WhatsAppSendResponse = {
        success: false,
        provider: providerName,
        provider_message_id: null,
        latency_ms: 0,
        error: { code: "UNKNOWN_PROVIDER", message },
        request_id: crypto.randomUUID(),
      };
      await this.logRequest(supabase, {
        actorId: input.actorId ?? null,
        projectId: input.projectId ?? null,
        messageId: input.messageId ?? null,
        provider: providerName,
        purpose: input.request.purpose,
        success: false,
        latencyMs: 0,
        errorCode: "UNKNOWN_PROVIDER",
        retryCount: 0,
      });
      return resp;
    }

    const start = Date.now();
    let retryCount = 0;
    let lastError: unknown;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const response = await withTimeout(
          provider.send({
            ...input.request,
            timeoutMs: input.request.timeoutMs ?? DEFAULT_TIMEOUT_MS,
          }),
          input.request.timeoutMs ?? DEFAULT_TIMEOUT_MS,
          providerName
        );

        await this.logRequest(supabase, {
          actorId: input.actorId ?? null,
          projectId: input.projectId ?? null,
          messageId: input.messageId ?? null,
          provider: providerName,
          purpose: input.request.purpose,
          success: true,
          latencyMs: Date.now() - start,
          retryCount,
        });

        return response;
      } catch (err) {
        lastError = err;
        const retryable = err instanceof WhatsAppError ? err.retryable : false;
        if (!retryable || attempt === MAX_ATTEMPTS) break;
        retryCount++;
        await sleep(BASE_DELAY_MS * 2 ** (attempt - 1));
      }
    }

    const latency_ms = Date.now() - start;
    const err = lastError;
    const code =
      err instanceof WhatsAppError ? err.code : "PROVIDER_ERROR";
    const message =
      err instanceof Error ? err.message : "فشل غير معروف أثناء الإرسال.";
    const resp: WhatsAppSendResponse = {
      success: false,
      provider: providerName,
      provider_message_id: null,
      latency_ms,
      error: { code, message },
      request_id: crypto.randomUUID(),
    };

    await this.logRequest(supabase, {
      actorId: input.actorId ?? null,
      projectId: input.projectId ?? null,
      messageId: input.messageId ?? null,
      provider: providerName,
      purpose: input.request.purpose,
      success: false,
      latencyMs: latency_ms,
      errorCode: code,
      retryCount,
    });

    return resp;
  }

  static async healthCheck(
    providerName?: WhatsAppProviderName
  ): Promise<{ ok: boolean; message: string; provider: WhatsAppProviderName }> {
    const supabase = createServiceClient();
    const name = providerName ?? (await this.getSettings(supabase)).provider;
    try {
      const provider = getWhatsAppProvider(name);
      const result = await provider.healthCheck();
      await supabase.from("whatsapp_provider_status").upsert({
        provider: name,
        last_check_at: new Date().toISOString(),
        last_check_ok: result.ok,
        last_message: result.message,
      });
      return { ...result, provider: name };
    } catch (err) {
      const message = err instanceof Error ? err.message : "فشل غير معروف.";
      await supabase.from("whatsapp_provider_status").upsert({
        provider: name,
        last_check_at: new Date().toISOString(),
        last_check_ok: false,
        last_message: message,
      });
      return { ok: false, message, provider: name };
    }
  }

  /**
   * تطبيق قائمة أحداث webhook على صفوف whatsapp_messages المطابقة.
   * الأحداث المتأخرة (delivered وبعدها sent) ما بتتراجعش عن أعلى حالة.
   */
  static async processWebhookEvents(events: WhatsAppWebhookEvent[]): Promise<void> {
    if (events.length === 0) return;
    const supabase = createServiceClient();
    const STATUS_RANK: Record<string, number> = {
      queued: 0,
      sent: 1,
      delivered: 2,
      read: 3,
      failed: 4,
    };

    for (const event of events) {
      const { data: row } = await supabase
        .from("whatsapp_messages")
        .select("id, status")
        .eq("provider_message_id", event.provider_message_id)
        .maybeSingle();

      if (!row) continue;

      const newRank = STATUS_RANK[event.status] ?? 0;
      const oldRank = STATUS_RANK[row.status as string] ?? 0;
      // failed دايماً بيدهس أي حالة تانية
      if (event.status !== "failed" && newRank < oldRank) continue;

      const update: Record<string, unknown> = { status: event.status };
      if (event.status === "sent") update.sent_at = event.occurred_at;
      if (event.status === "delivered") update.delivered_at = event.occurred_at;
      if (event.status === "read") update.read_at = event.occurred_at;
      if (event.status === "failed") {
        update.failed_at = event.occurred_at;
        update.error_code = event.error_code ?? null;
        update.error_message = event.error_message ?? null;
      }

      await supabase.from("whatsapp_messages").update(update).eq("id", row.id);
    }
  }

  private static async logRequest(
    supabase: SupabaseClient,
    entry: {
      actorId: string | null;
      projectId: string | null;
      messageId: string | null;
      provider: WhatsAppProviderName;
      purpose: WhatsAppMessagePurpose;
      success: boolean;
      latencyMs: number;
      errorCode?: string;
      retryCount: number;
    }
  ) {
    await supabase.from("whatsapp_requests_log").insert({
      actor_id: entry.actorId,
      project_id: entry.projectId,
      message_id: entry.messageId,
      provider: entry.provider,
      purpose: entry.purpose,
      success: entry.success,
      latency_ms: entry.latencyMs,
      error_code: entry.errorCode ?? null,
      retry_count: entry.retryCount,
    });
  }
}

// Re-export للاستهلاك في الـ actions/webhook
export { WhatsAppConfigError };
