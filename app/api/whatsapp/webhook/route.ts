import { NextResponse, type NextRequest } from "next/server";
import { WhatsAppService } from "@/lib/whatsapp/service";
import { getWhatsAppProvider } from "@/lib/whatsapp/registry";

/**
 * WhatsApp Webhook — نقطة واحدة تخدم كل المزوّدين (Meta/Twilio/…).
 *
 * GET: تحقق Meta (hub.challenge). لو المزوّد الحالي مش Meta، نرجّع 404
 *      بلطف — الـ Provider تاني ممكن ما يستخدمش verify challenge.
 *
 * POST: نقرأ الجسم كنص خام أولاً (للتحقق من التوقيع)، بعدين نستدعي
 *       parseWebhook للـ provider الحالي، ونطبّق الأحداث على whatsapp_messages.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  const verify = process.env.WHATSAPP_META_VERIFY_TOKEN;

  if (mode === "subscribe" && verify && token === verify && challenge) {
    return new NextResponse(challenge, { status: 200 });
  }
  return NextResponse.json({ ok: false }, { status: 403 });
}

export async function POST(request: NextRequest) {
  const settings = await WhatsAppService.getSettings();
  const providerName = settings.provider;

  let provider;
  try {
    provider = getWhatsAppProvider(providerName);
  } catch {
    return NextResponse.json({ ok: false }, { status: 200 });
  }

  const contentType = request.headers.get("content-type") ?? "";
  const rawBody = await request.text();

  // تحقّق التوقيع لو المزوّد بيدعمه
  if (provider.verifyWebhookSignature) {
    const result = provider.verifyWebhookSignature(rawBody, request.headers);
    if (result === false) {
      return NextResponse.json({ ok: false, error: "invalid signature" }, { status: 401 });
    }
    // result === null → المزوّد ما بيوقّع؛ نعتمد على مسار سرّي (ليس مثاليًا،
    // لكنه أفضل من رفض كل الأحداث). في الإنتاج يفضّل مزوّد يوقّع (Meta).
  }

  // parse payload حسب الـ content-type
  let payload: unknown;
  try {
    if (contentType.includes("application/x-www-form-urlencoded")) {
      const params = new URLSearchParams(rawBody);
      payload = Object.fromEntries(params.entries());
    } else {
      payload = JSON.parse(rawBody);
    }
  } catch {
    // Payload مش صحيح — رجّع 200 عشان المزوّد ما يعيدش المحاولة بلا نهاية
    return NextResponse.json({ ok: true });
  }

  const events = provider.parseWebhook(payload);
  if (events.length > 0) {
    try {
      await WhatsAppService.processWebhookEvents(events);
    } catch (err) {
      console.error("[whatsapp/webhook] failed to process events", err);
      // نرجّع 200 دايمًا للمزوّد — أي فشل داخلي بيتسجّل في logs
    }
  }

  return NextResponse.json({ ok: true });
}
