import type {
  WhatsAppProvider,
  WhatsAppSendRequest,
  WhatsAppSendResponse,
  WhatsAppWebhookEvent,
} from "../types";

/**
 * NoOp Provider — بيسجّل بس بدون ما يبعت فعليًا. مفيد قبل ربط مزوّد حقيقي
 * (Meta/Twilio) عشان الفريق يقدر يجرّب الـ workflow كامل من غير حساب خارجي.
 * الرسائل بتتحفظ في whatsapp_messages بحالة "sent" مع provider_message_id
 * وهمي، والـ webhook مش هيوصل — ده مقصود.
 */
export class NoOpWhatsAppProvider implements WhatsAppProvider {
  readonly name = "noop" as const;

  async send(_request: WhatsAppSendRequest): Promise<WhatsAppSendResponse> {
    const started = Date.now();
    return {
      success: true,
      provider: "noop",
      provider_message_id: `noop-${crypto.randomUUID()}`,
      latency_ms: Date.now() - started,
      error: null,
      request_id: crypto.randomUUID(),
    };
  }

  async healthCheck(): Promise<{ ok: boolean; message: string }> {
    return {
      ok: true,
      message: "NoOp provider — الرسائل بتتسجّل محليًا بدون إرسال فعلي.",
    };
  }

  parseWebhook(): WhatsAppWebhookEvent[] {
    return [];
  }
}
