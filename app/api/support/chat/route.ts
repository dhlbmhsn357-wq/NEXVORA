import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { SupportChatEngine } from "@/lib/support/chat-engine";
import { logSupportEvent } from "@/lib/support/observability";
import { checkRateLimit, extractClientIp } from "@/lib/rate-limit/rate-limiter";
import { signHistory, verifyHistorySignature } from "@/lib/support/history-integrity";
import type { ClientDiagnostics } from "@/lib/support/chat-engine";
import type { ConversationMessage } from "@/lib/types/database";

const MAX_CLIENT_ERRORS = 5;

/** بيانات حقيقية مُلتقطة فعليًا من متصفح العميل وقت إنشاء التذكرة — مفيش أي رقم/قيمة ملفّقة هنا. */
function sanitizeDiagnostics(raw: unknown): ClientDiagnostics | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const d = raw as Record<string, unknown>;

  const browserInfo = typeof d.browserInfo === "object" && d.browserInfo !== null ? (d.browserInfo as Record<string, unknown>) : undefined;
  const environmentInfo = typeof d.environmentInfo === "object" && d.environmentInfo !== null ? (d.environmentInfo as Record<string, unknown>) : undefined;
  const recentClientErrors = Array.isArray(d.recentClientErrors)
    ? d.recentClientErrors
        .filter((e): e is { message: string; source?: string; at: string } => typeof e === "object" && e !== null && typeof (e as { message?: unknown }).message === "string")
        .slice(0, MAX_CLIENT_ERRORS)
        .map((e) => ({ message: String(e.message).slice(0, 500), source: typeof e.source === "string" ? e.source.slice(0, 200) : undefined, at: typeof e.at === "string" ? e.at : new Date().toISOString() }))
    : undefined;

  return { browserInfo, environmentInfo, recentClientErrors };
}

const MAX_HISTORY_MESSAGES = 40;
const UNEXPECTED_ERROR_REPLY = "حصل خطأ غير متوقع — جاري تحويلك لفريق الدعم، من فضلك حاول تاني بعد شوية.";

// حدود Rate Limiting: 20 طلب لكل widget_key و20 طلب لكل IP في الدقيقة.
// الاتنين معًا يمنعوا استنزاف مقصود لتكلفة Gemini API.
const RATE_LIMIT_PER_WIDGET_PER_MINUTE = 20;
const RATE_LIMIT_PER_IP_PER_MINUTE = 20;
const RATE_LIMIT_WINDOW_SECONDS = 60;
const TOO_MANY_REQUESTS_REPLY = "بعتّلي رسائل كتير أوي في وقت قصير — استنّى دقيقة ورجّع حاول تاني.";

function sanitizeHistory(raw: unknown): ConversationMessage[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (m): m is ConversationMessage =>
        typeof m === "object" &&
        m !== null &&
        (m.role === "customer" || m.role === "assistant") &&
        typeof m.content === "string"
    )
    .slice(-MAX_HISTORY_MESSAGES)
    .map((m) => ({
      role: m.role,
      content: m.content,
      created_at: m.created_at ?? new Date().toISOString(),
      attachmentPath: typeof m.attachmentPath === "string" ? m.attachmentPath : null,
    }));
}

/**
 * API عام (بدون تسجيل دخول) للـ Support Widget — نطاق الوصول محصور
 * بمشروع واحد بس عبر widget_key (نفس نمط present/[token])، فمينفعش
 * الـ Widget يوصل لأي مشروع تاني حتى لو اتغيّر الـ Payload المُرسل.
 */
export async function POST(request: NextRequest) {
  const supabase = createServiceClient();
  const body = await request.json().catch(() => null);

  const widgetKey = typeof body?.widgetKey === "string" ? body.widgetKey : null;
  if (!widgetKey) {
    return NextResponse.json({ ok: false, error: "widgetKey مطلوب." }, { status: 400 });
  }

  const { data: project } = await supabase
    .from("projects")
    .select("id, archived_at")
    .eq("widget_key", widgetKey)
    .maybeSingle();

  if (!project || project.archived_at) {
    return NextResponse.json({ ok: false, error: "Widget غير صالح." }, { status: 404 });
  }

  // تتبّع آخر استخدام للـ widget_key (fire-and-forget، مش بيوقف الطلب)
  void supabase
    .from("projects")
    .update({ widget_key_last_used_at: new Date().toISOString() })
    .eq("id", project.id);

  // Rate Limit على مستويين: widget_key وIP معًا. أي واحد فيهم يتجاوز → رفض.
  // بيرد بـ 200 مع reply واضح بدل 429 عشان الواجهة تعرضه للعميل مباشرة.
  const clientIp = extractClientIp(request.headers);
  const [widgetLimit, ipLimit] = await Promise.all([
    checkRateLimit(supabase, {
      scope: "support_chat_widget",
      identifier: widgetKey,
      limit: RATE_LIMIT_PER_WIDGET_PER_MINUTE,
      windowSeconds: RATE_LIMIT_WINDOW_SECONDS,
    }),
    checkRateLimit(supabase, {
      scope: "support_chat_ip",
      identifier: clientIp,
      limit: RATE_LIMIT_PER_IP_PER_MINUTE,
      windowSeconds: RATE_LIMIT_WINDOW_SECONDS,
    }),
  ]);

  if (!widgetLimit.allowed || !ipLimit.allowed) {
    await logSupportEvent(supabase, {
      eventType: "widget_error",
      projectId: project.id,
      success: false,
      message: "Rate limit exceeded",
      metadata: { ip: clientIp, widgetKey },
    });
    return NextResponse.json(
      { ok: true, reply: TOO_MANY_REQUESTS_REPLY, done: false, escalated: false },
      { status: 200 }
    );
  }

  const message = typeof body?.message === "string" ? body.message : "";
  const customerIdentifier =
    typeof body?.customerIdentifier === "string" ? body.customerIdentifier.slice(0, 200) : null;
  const attachmentPath = typeof body?.attachmentPath === "string" ? body.attachmentPath : null;
  const rawHistory = sanitizeHistory(body?.history);
  const diagnostics = sanitizeDiagnostics(body?.diagnostics);

  // فحص سلامة التاريخ: لو التوقيع مش صالح، ما نصدّقش رسائل "assistant"
  // اللي في الـ history (ممكن تكون مزوّرة). في الحالة دي بنسيب بس رسائل
  // العميل عشان الـ AI يشتغل على سياق مضمون مصدره العميل نفسه.
  const providedSignature = typeof body?.historySignature === "string" ? body.historySignature : null;
  const historyIsTrusted = rawHistory.length === 0 || verifyHistorySignature(rawHistory, providedSignature);
  const history = historyIsTrusted ? rawHistory : rawHistory.filter((m) => m.role === "customer");

  if (!historyIsTrusted && rawHistory.length > 0) {
    await logSupportEvent(supabase, {
      eventType: "widget_error",
      projectId: project.id,
      success: false,
      message: "توقيع تاريخ المحادثة غير صالح — رسائل assistant اتشالت من السياق كإجراء وقائي.",
      metadata: { ip: clientIp },
    });
  }

  try {
    const result = await SupportChatEngine.converse({
      projectId: project.id,
      history,
      message,
      customerIdentifier,
      attachmentPath,
      diagnostics,
    });
    // كل رد بيتضمّن توقيع HMAC للـ history المُحدَّث — الـ Widget بيرجّعه
    // مع الطلب الجاي عشان نتأكد إنه ما اتلعبش فيه بين الطلبين.
    const nextHistory: ConversationMessage[] = [
      ...history,
      { role: "customer", content: message, created_at: new Date().toISOString(), attachmentPath },
      { role: "assistant", content: result.reply, created_at: new Date().toISOString() },
    ];
    const historySignature = signHistory(result.done ? [] : nextHistory);
    return NextResponse.json({ ok: true, ...result, historySignature });
  } catch (err) {
    console.error("[SupportChatAPI] Unexpected failure:", err);
    await logSupportEvent(supabase, {
      eventType: "widget_error",
      projectId: project.id,
      success: false,
      message: err instanceof Error ? err.message : "خطأ غير متوقع في API الدردشة.",
    });
    return NextResponse.json({ ok: true, reply: UNEXPECTED_ERROR_REPLY, done: false, escalated: false });
  }
}
