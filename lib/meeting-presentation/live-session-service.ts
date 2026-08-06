import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { MeetingService } from "@/lib/meetings/meeting-service";
import { proposeChanges } from "@/lib/brain-v2/knowledge-aggregation";
import { buildManualNoteCandidate } from "@/lib/brain-v2/manual-notes";
import { checkPreparationCompleteness } from "@/lib/meeting-prep/completeness";
import type { MeetingPreparationRow } from "@/lib/meeting-prep/types";
import type {
  MeetingLifecycleEventType,
  MeetingLiveCapture,
  MeetingLiveCaptureType,
  MeetingLiveSession,
  MeetingPresentation,
  MeetingPrepParticipant,
  MeetingRequiredItem,
} from "@/lib/types/database";

/** المدة اللي بعدها اجتماع "بدأ" من غير تسجيل مرفوع يُعتبر قديم — تجاهل أي مطابقة بعدها. */
const UNRECORDED_MEETING_MATCH_WINDOW_HOURS = 48;

export async function writeLifecycleEvent(
  supabase: SupabaseClient,
  projectId: string,
  meetingId: string,
  eventType: MeetingLifecycleEventType,
  detail: string | null,
  actorId: string | null
): Promise<void> {
  await supabase.from("meeting_lifecycle_events").insert({
    project_id: projectId,
    meeting_id: meetingId,
    event_type: eventType,
    detail,
    actor_id: actorId,
  });
}

/**
 * تبدأ اجتماع حقيقي من عرض تقديمي جاهز: بتنشئ صف meetings حقيقي (نفس
 * MeetingService.create المستخدم أصلًا من بوت Telegram — إعادة استخدام،
 * مش تكرار)، تربطه بالعرض، وتبدأ جلسة Live Mode. الـ Pipeline الحالي
 * (رفع تسجيل → تفريغ → تحليل) بيكمل زي ما هو بالظبط لاحقًا لما الـ PM
 * يبعت التسجيل على Telegram — webhook.ts بقى بيدوّر على اجتماع "بدأ"
 * زي ده قبل ما يعمل صف جديد (شوف findRecentUnrecordedStartedMeeting).
 */
export async function startMeeting(
  projectId: string,
  presentationId: string,
  actorId: string | null
): Promise<{ meetingId: string; sessionId: string }> {
  const supabase = createServiceClient();

  const { data: project } = await supabase.from("projects").select("id, project_code").eq("id", projectId).single();
  if (!project) throw new Error("المشروع غير موجود.");

  // بوابة التحقق: "مفيش اجتماع يبدأ من غير تجهيز مكتمل" — Phase 2.
  const { data: prep } = await supabase.from("meeting_preparations").select("*").eq("project_id", projectId).maybeSingle();
  if (prep) {
    const [{ data: participants }, { data: requiredItems }] = await Promise.all([
      supabase.from("meeting_prep_participants").select("*").eq("meeting_preparation_id", prep.id),
      supabase.from("meeting_required_items").select("*").eq("meeting_preparation_id", prep.id),
    ]);
    const completeness = checkPreparationCompleteness(
      prep as MeetingPreparationRow,
      (participants as MeetingPrepParticipant[] | null) ?? [],
      (requiredItems as MeetingRequiredItem[] | null) ?? []
    );
    if (!completeness.complete) {
      throw new Error(`التجهيز غير مكتمل: ${completeness.missingReasons.join(" ")}`);
    }
  }

  const { data: presentation } = await supabase
    .from("meeting_presentations")
    .select("*")
    .eq("id", presentationId)
    .single();
  if (!presentation) throw new Error("العرض التقديمي غير موجود.");
  const pres = presentation as MeetingPresentation;

  const meeting = await MeetingService.create(supabase, projectId, project.project_code);
  if (pres.title) {
    await supabase.from("meetings").update({ title: pres.title, meeting_date: pres.meeting_date ?? new Date().toISOString() }).eq("id", meeting.id);
  }

  await supabase.from("meeting_presentations").update({ meeting_id: meeting.id }).eq("id", presentationId);

  const { data: session, error } = await supabase
    .from("meeting_live_sessions")
    .insert({ project_id: projectId, presentation_id: presentationId, meeting_id: meeting.id, started_by: actorId })
    .select("id")
    .single();
  if (error || !session) throw new Error(`فشل بدء جلسة الاجتماع: ${error?.message ?? "سبب غير معروف"}`);

  await writeLifecycleEvent(supabase, projectId, meeting.id, "planned", "تم تجهيز الاجتماع من العرض التقديمي", actorId);
  await writeLifecycleEvent(supabase, projectId, meeting.id, "started", "بدأ الاجتماع فعليًا (Live Meeting Mode)", actorId);

  return { meetingId: meeting.id, sessionId: session.id };
}

export async function endMeeting(sessionId: string, actorId: string | null): Promise<void> {
  const supabase = createServiceClient();
  const { data: session } = await supabase.from("meeting_live_sessions").select("*").eq("id", sessionId).single();
  if (!session) throw new Error("جلسة الاجتماع غير موجودة.");
  const s = session as MeetingLiveSession;
  if (s.status === "ended") return;

  await supabase.from("meeting_live_sessions").update({ status: "ended", ended_at: new Date().toISOString() }).eq("id", sessionId);
  await writeLifecycleEvent(supabase, s.project_id, s.meeting_id, "finished", "انتهى الاجتماع", actorId);
}

export async function updateCurrentSlide(sessionId: string, slideIndex: number): Promise<void> {
  const supabase = createServiceClient();
  await supabase.from("meeting_live_sessions").update({ current_slide_index: slideIndex }).eq("id", sessionId);
}

/**
 * التقاط عنصر أثناء الاجتماع (قرار/خطر/متطلب/فكرة/سؤال/مهمة/ملاحظة
 * عميل) — بيتسجّل فورًا في meeting_live_captures (Realtime)، وبيتقدّم
 * كـ KnowledgeCandidate لنفس Knowledge Aggregation Layer اللي بتستخدمها
 * الملاحظات اليدوية العادية (source_type='manual_note' — نفس الثقة
 * ونفس منطق بناء الـ Candidate، صفر تكرار).
 */
export async function captureLiveItem(
  sessionId: string,
  captureType: MeetingLiveCaptureType,
  text: string,
  actorId: string | null
): Promise<MeetingLiveCapture> {
  const trimmed = text.trim();
  if (!trimmed) throw new Error("النص فارغ.");

  const supabase = createServiceClient();
  const { data: session } = await supabase.from("meeting_live_sessions").select("*").eq("id", sessionId).single();
  if (!session) throw new Error("جلسة الاجتماع غير موجودة.");
  const s = session as MeetingLiveSession;

  const { data: capture, error } = await supabase
    .from("meeting_live_captures")
    .insert({ project_id: s.project_id, session_id: sessionId, meeting_id: s.meeting_id, capture_type: captureType, text: trimmed, created_by: actorId })
    .select("*")
    .single();
  if (error || !capture) throw new Error(`فشل تسجيل العنصر: ${error?.message ?? "سبب غير معروف"}`);

  try {
    const candidate = buildManualNoteCandidate(captureType, trimmed);
    await proposeChanges(s.project_id, "manual_note", `live-${sessionId}`, "تقاط مباشر أثناء الاجتماع", [candidate]);
  } catch (err) {
    console.error(`[MeetingLiveMode] proposeChanges threw for capture in session ${sessionId}:`, err);
  }

  return capture as MeetingLiveCapture;
}

export async function getLiveState(
  meetingId: string
): Promise<{ session: MeetingLiveSession | null; captures: MeetingLiveCapture[] }> {
  const supabase = createServiceClient();
  const { data: session } = await supabase
    .from("meeting_live_sessions")
    .select("*")
    .eq("meeting_id", meetingId)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!session) return { session: null, captures: [] };

  const { data: captures } = await supabase
    .from("meeting_live_captures")
    .select("*")
    .eq("session_id", (session as MeetingLiveSession).id)
    .order("created_at", { ascending: true });

  return { session: session as MeetingLiveSession, captures: (captures as MeetingLiveCapture[] | null) ?? [] };
}

/**
 * يدوّر على أحدث اجتماع "بدأ" من Live Meeting Mode لسه معندوش تسجيل
 * مرفوع — عشان Telegram webhook يربط أي تسجيل جاي بيه بدل ما يعمل صف
 * meetings جديد منفصل (المطابقة الوحيدة الممكنة هنا: نفس المشروع، فيه
 * جلسة Live بدأت، والتسجيل لسه فاضي). لو مفيش، الاستدعاء الحالي (يرجّع
 * null) بيسيب السلوك القديم زي ما هو بالظبط — إنشاء اجتماع جديد.
 */
export async function findRecentUnrecordedStartedMeeting(
  supabase: SupabaseClient,
  projectId: string
): Promise<string | null> {
  const cutoff = new Date(Date.now() - UNRECORDED_MEETING_MATCH_WINDOW_HOURS * 60 * 60_000).toISOString();

  const { data } = await supabase
    .from("meeting_live_sessions")
    .select("meeting_id, started_at, meetings!inner(id, recording_url, status)")
    .eq("project_id", projectId)
    .gte("started_at", cutoff)
    .order("started_at", { ascending: false })
    .limit(5);

  if (!data) return null;

  type SessionMeetingRow = { meeting_id: string; meetings: { recording_url: string | null; status: string } | { recording_url: string | null; status: string }[] };
  for (const row of data as unknown as SessionMeetingRow[]) {
    const meeting = Array.isArray(row.meetings) ? row.meetings[0] : row.meetings;
    if (meeting && !meeting.recording_url && meeting.status === "pending") {
      return row.meeting_id;
    }
  }
  return null;
}
