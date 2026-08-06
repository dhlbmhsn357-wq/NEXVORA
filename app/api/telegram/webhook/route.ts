import { NextResponse, after, type NextRequest } from "next/server";
import { TelegramClient } from "@/lib/telegram/client";
import { extractAudioMessage, extractProjectCode } from "@/lib/telegram/parse-update";
import { createServiceClient } from "@/lib/supabase/service";
import { MeetingService } from "@/lib/meetings/meeting-service";
import { processMeetingPipeline } from "@/lib/meetings/pipeline";
import { findRecentUnrecordedStartedMeeting } from "@/lib/meeting-presentation/live-session-service";

/**
 * Telegram Webhook — بدون أي أوامر أو Menu أو محادثة. الوظيفة الوحيدة:
 * استقبال ملف صوتي، قراءة الـ Caption لاستخراج Project Code، إنشاء
 * Meeting، والرد فورًا (لتفادي إعادة إرسال Telegram للتحديث)، ثم إكمال
 * المعالجة الثقيلة في الخلفية عبر after().
 */
export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-telegram-bot-api-secret-token");
  if (!secret || secret !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    console.error("[TelegramWebhook] TELEGRAM_BOT_TOKEN غير مُعد");
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  const update = await request.json().catch(() => null);
  const parsed = extractAudioMessage(update);

  // مش رسالة صوتية — نتجاهلها بهدوء (مفيش أوامر ولا محادثة في البوت ده)
  if (!parsed) {
    return NextResponse.json({ ok: true });
  }

  const telegram = new TelegramClient(botToken);
  const projectCode = extractProjectCode(parsed.caption);

  if (!projectCode) {
    await telegram.sendMessage(
      parsed.chatId,
      "من فضلك أضف كود المشروع في تعليق الرسالة (Caption)، مثال: PRJ-A7X2"
    );
    return NextResponse.json({ ok: true });
  }

  const supabase = createServiceClient();
  const project = await MeetingService.findProjectByCode(supabase, projectCode);

  if (!project) {
    await telegram.sendMessage(
      parsed.chatId,
      `كود المشروع "${projectCode}" غير صحيح. تأكد من الكود وحاول مرة أخرى.`
    );
    return NextResponse.json({ ok: true });
  }

  // لو فيه اجتماع "بدأ" فعلًا من Meeting Presentation (Live Meeting Mode)
  // لسه معندوش تسجيل مرفوع، نربط التسجيل الجاي بيه بدل إنشاء صف جديد
  // منفصل — عشان Meeting Review يقدر يقارن الخطة بالـ Transcript الصح.
  const linkedMeetingId = await findRecentUnrecordedStartedMeeting(supabase, project.id);
  const meeting = linkedMeetingId ? { id: linkedMeetingId } : await MeetingService.create(supabase, project.id, project.project_code);
  await telegram.sendMessage(parsed.chatId, "تم استلام التسجيل، جاري المعالجة…");

  after(() =>
    processMeetingPipeline({
      meetingId: meeting.id,
      projectId: project.id,
      projectCode: project.project_code,
      mimeType: parsed.mimeType,
      source: { kind: "telegram", fileId: parsed.fileId, botToken, chatId: parsed.chatId },
    })
  );

  return NextResponse.json({ ok: true });
}
