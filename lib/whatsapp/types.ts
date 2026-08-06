import type {
  WhatsAppProviderName,
  WhatsAppMessagePurpose,
} from "@/lib/types/database";

export { WhatsAppProviderName, WhatsAppMessagePurpose };

/**
 * الطلب الموحّد لأي WhatsApp Provider — كل provider مسؤول بس عن
 * تحويل الشكل ده لاستدعاء الـ API الخاص بيه.
 */
export interface WhatsAppSendRequest {
  /** رقم الوجهة بصيغة E.164 بدون + (مثلاً 201001234567) */
  to: string;
  body: string;
  purpose: WhatsAppMessagePurpose;
  /** أقصى وقت مسموح للطلب بالمللي ثانية قبل ما يعتبر Timeout */
  timeoutMs?: number;
}

/**
 * الرد الموحّد من كل provider — أي provider جديد لازم يعبّي الشكل ده
 * بالظبط، والـ WhatsAppService هو الوحيد اللي بيفسّره.
 */
export interface WhatsAppSendResponse {
  success: boolean;
  provider: WhatsAppProviderName;
  /** id الرسالة عند المزوّد للربط لاحقًا مع الـ webhook */
  provider_message_id: string | null;
  latency_ms: number;
  error: { code: string; message: string } | null;
  request_id: string;
}

/**
 * حدث webhook مطبّع من أي مزوّد بعد فك تشفير الجسم الخاص به.
 * WhatsAppService.processWebhookEvent هو اللي بيطبّق الحدث ده.
 */
export interface WhatsAppWebhookEvent {
  provider: WhatsAppProviderName;
  /** id الرسالة عند المزوّد — نفس اللي رجع مع الإرسال */
  provider_message_id: string;
  status: "sent" | "delivered" | "read" | "failed";
  error_code?: string | null;
  error_message?: string | null;
  occurred_at: string;
}

export interface WhatsAppProvider {
  readonly name: WhatsAppProviderName;
  send(request: WhatsAppSendRequest): Promise<WhatsAppSendResponse>;
  healthCheck(): Promise<{ ok: boolean; message: string }>;
  /**
   * فكّ تشفير جسم الـ webhook إلى قائمة أحداث موحّدة. لو المزوّد
   * ما بيدعمش webhook، رجّع [] — الـ WhatsAppService هيتجاهله بلطف.
   */
  parseWebhook(payload: unknown): WhatsAppWebhookEvent[];
  /**
   * تحقّق من توقيع الـ webhook (لو المزوّد بيدعمه). يرجّع true لو الطلب
   * موثّق. null = المزوّد ما بيوقّع، فنعتمد على مسار سرّي فقط.
   */
  verifyWebhookSignature?(rawBody: string, headers: Headers): boolean | null;
}
