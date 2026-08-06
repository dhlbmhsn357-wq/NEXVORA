import { createHmac, timingSafeEqual } from "crypto";
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

const GRAPH_VERSION = "v20.0";

interface MetaSendResponse {
  messages?: Array<{ id?: string }>;
  error?: { message?: string; type?: string; code?: number; error_subcode?: number };
}

/**
 * Meta WhatsApp Cloud API — Provider الأول المدعوم رسميًا.
 * الإعداد عبر متغيّرات البيئة (لا secrets في الكود):
 *   WHATSAPP_META_ACCESS_TOKEN
 *   WHATSAPP_META_PHONE_NUMBER_ID
 *   WHATSAPP_META_APP_SECRET       (للتحقق من X-Hub-Signature-256)
 *   WHATSAPP_META_VERIFY_TOKEN     (لتحقق GET من الـ webhook)
 */
export class MetaCloudWhatsAppProvider implements WhatsAppProvider {
  readonly name = "meta_cloud" as const;

  private cfg() {
    const token = process.env.WHATSAPP_META_ACCESS_TOKEN;
    const phoneId = process.env.WHATSAPP_META_PHONE_NUMBER_ID;
    if (!token || !phoneId) {
      throw new WhatsAppConfigError(
        "WHATSAPP_META_ACCESS_TOKEN أو WHATSAPP_META_PHONE_NUMBER_ID غير مضبوطين.",
        this.name
      );
    }
    return { token, phoneId };
  }

  async send(request: WhatsAppSendRequest): Promise<WhatsAppSendResponse> {
    const started = Date.now();
    const { token, phoneId } = this.cfg();

    const url = `https://graph.facebook.com/${GRAPH_VERSION}/${phoneId}/messages`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: request.to,
        type: "text",
        text: { preview_url: true, body: request.body },
      }),
    });

    const latency_ms = Date.now() - started;
    const json = (await res.json().catch(() => ({}))) as MetaSendResponse;

    if (!res.ok || json.error) {
      const message = json.error?.message ?? `Meta Cloud API returned ${res.status}`;
      if (res.status === 401 || res.status === 403) {
        throw new WhatsAppAuthError(message, this.name);
      }
      if (res.status === 429) {
        throw new WhatsAppRateLimitError(message, this.name);
      }
      throw new WhatsAppProviderError(message, this.name);
    }

    return {
      success: true,
      provider: this.name,
      provider_message_id: json.messages?.[0]?.id ?? null,
      latency_ms,
      error: null,
      request_id: crypto.randomUUID(),
    };
  }

  async healthCheck(): Promise<{ ok: boolean; message: string }> {
    try {
      const { token, phoneId } = this.cfg();
      const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        return { ok: false, message: `Meta Cloud (${res.status}): ${text.slice(0, 200)}` };
      }
      return { ok: true, message: "متصل بـ Meta Cloud API." };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : "فشل الاتصال." };
    }
  }

  verifyWebhookSignature(rawBody: string, headers: Headers): boolean | null {
    const secret = process.env.WHATSAPP_META_APP_SECRET;
    const sig = headers.get("x-hub-signature-256");
    if (!secret || !sig) return null;
    const expected = "sha256=" + createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
    try {
      const a = Buffer.from(sig);
      const b = Buffer.from(expected);
      if (a.length !== b.length) return false;
      return timingSafeEqual(a, b);
    } catch {
      return false;
    }
  }

  parseWebhook(payload: unknown): WhatsAppWebhookEvent[] {
    // شكل الجسم: { entry: [{ changes: [{ value: { statuses: [...] } }] }] }
    const events: WhatsAppWebhookEvent[] = [];
    if (!payload || typeof payload !== "object") return events;

    const entries = (payload as { entry?: unknown[] }).entry;
    if (!Array.isArray(entries)) return events;

    for (const entry of entries) {
      const changes = (entry as { changes?: unknown[] }).changes;
      if (!Array.isArray(changes)) continue;
      for (const change of changes) {
        const value = (change as { value?: unknown }).value as
          | { statuses?: unknown[] }
          | undefined;
        const statuses = value?.statuses;
        if (!Array.isArray(statuses)) continue;
        for (const s of statuses as Array<{
          id?: string;
          status?: string;
          timestamp?: string;
          errors?: Array<{ code?: number; title?: string; message?: string }>;
        }>) {
          if (!s.id || !s.status) continue;
          const map: Record<string, WhatsAppWebhookEvent["status"]> = {
            sent: "sent",
            delivered: "delivered",
            read: "read",
            failed: "failed",
          };
          const mapped = map[s.status];
          if (!mapped) continue;
          const ts = s.timestamp
            ? new Date(Number(s.timestamp) * 1000).toISOString()
            : new Date().toISOString();
          const err = s.errors?.[0];
          events.push({
            provider: this.name,
            provider_message_id: s.id,
            status: mapped,
            error_code: err?.code ? String(err.code) : null,
            error_message: err?.message ?? err?.title ?? null,
            occurred_at: ts,
          });
        }
      }
    }
    return events;
  }
}
