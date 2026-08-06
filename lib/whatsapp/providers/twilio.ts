import {
  WhatsAppAuthError,
  WhatsAppConfigError,
  WhatsAppProviderError,
  WhatsAppRateLimitError,
} from "../errors";
import type {
  WhatsAppProvider,
  WhatsAppSendRequest,
  WhatsAppSendResponse,
  WhatsAppWebhookEvent,
} from "../types";

/**
 * Twilio WhatsApp — Provider ثانوي. الإعداد:
 *   WHATSAPP_TWILIO_ACCOUNT_SID
 *   WHATSAPP_TWILIO_AUTH_TOKEN
 *   WHATSAPP_TWILIO_FROM       (بصيغة whatsapp:+14155238886)
 * الـ webhook: Twilio بيبعت form-encoded مع MessageSid + MessageStatus.
 */
export class TwilioWhatsAppProvider implements WhatsAppProvider {
  readonly name = "twilio" as const;

  private cfg() {
    const sid = process.env.WHATSAPP_TWILIO_ACCOUNT_SID;
    const token = process.env.WHATSAPP_TWILIO_AUTH_TOKEN;
    const from = process.env.WHATSAPP_TWILIO_FROM;
    if (!sid || !token || !from) {
      throw new WhatsAppConfigError(
        "متغيّرات Twilio (SID/TOKEN/FROM) غير مضبوطة.",
        this.name
      );
    }
    return { sid, token, from };
  }

  async send(request: WhatsAppSendRequest): Promise<WhatsAppSendResponse> {
    const started = Date.now();
    const { sid, token, from } = this.cfg();

    const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
    const auth = Buffer.from(`${sid}:${token}`).toString("base64");
    const body = new URLSearchParams({
      From: from,
      To: `whatsapp:+${request.to}`,
      Body: request.body,
    });

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });

    const latency_ms = Date.now() - started;
    const json = (await res.json().catch(() => ({}))) as { sid?: string; message?: string };

    if (!res.ok) {
      const message = json.message ?? `Twilio returned ${res.status}`;
      if (res.status === 401) throw new WhatsAppAuthError(message, this.name);
      if (res.status === 429) throw new WhatsAppRateLimitError(message, this.name);
      throw new WhatsAppProviderError(message, this.name);
    }

    return {
      success: true,
      provider: this.name,
      provider_message_id: json.sid ?? null,
      latency_ms,
      error: null,
      request_id: crypto.randomUUID(),
    };
  }

  async healthCheck(): Promise<{ ok: boolean; message: string }> {
    try {
      const { sid, token } = this.cfg();
      const auth = Buffer.from(`${sid}:${token}`).toString("base64");
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}.json`, {
        headers: { Authorization: `Basic ${auth}` },
      });
      if (!res.ok) return { ok: false, message: `Twilio (${res.status})` };
      return { ok: true, message: "متصل بـ Twilio." };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : "فشل الاتصال." };
    }
  }

  parseWebhook(payload: unknown): WhatsAppWebhookEvent[] {
    if (!payload || typeof payload !== "object") return [];
    const p = payload as Record<string, string | undefined>;
    const id = p.MessageSid;
    const status = p.MessageStatus;
    if (!id || !status) return [];
    const map: Record<string, WhatsAppWebhookEvent["status"]> = {
      sent: "sent",
      delivered: "delivered",
      read: "read",
      failed: "failed",
      undelivered: "failed",
    };
    const mapped = map[status];
    if (!mapped) return [];
    return [
      {
        provider: this.name,
        provider_message_id: id,
        status: mapped,
        error_code: p.ErrorCode ?? null,
        error_message: p.ErrorMessage ?? null,
        occurred_at: new Date().toISOString(),
      },
    ];
  }

  verifyWebhookSignature(): boolean | null {
    // Twilio signature verification يتطلب URL كامل + الجسم — أعقد من الإطار
    // الحالي. الحماية الأساسية = مسار سرّي عبر CRON_SECRET/ webhook path
    // مش قابل للتخمين. نرجّع null عشان الـ Service يعتمد على المسار السرّي.
    return null;
  }
}
