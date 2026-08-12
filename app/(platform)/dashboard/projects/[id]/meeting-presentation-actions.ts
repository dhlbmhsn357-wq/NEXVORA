"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireRole } from "@/lib/auth/rbac";
import {
  MeetingPresentationGenerationEngine,
  type PresentationGenerationResult,
} from "@/lib/meeting-presentation/generation-service";
import { applyManualSlideEdit, getPresentationById } from "@/lib/meeting-presentation/versioning";
import {
  captureLiveItem,
  endMeeting,
  getLiveState,
  startMeeting,
  updateCurrentSlide,
} from "@/lib/meeting-presentation/live-session-service";
import { processMeetingPipeline } from "@/lib/meetings/pipeline";
import { MeetingService } from "@/lib/meetings/meeting-service";
import { MEETINGS_BUCKET, meetingRecordingPath } from "@/lib/storage/meeting-storage";
import type {
  MeetingLifecycleEvent,
  MeetingLiveCapture,
  MeetingLiveCaptureType,
  MeetingLiveSession,
  MeetingPresentation,
  MeetingPresentationSlideKey,
  MeetingReview,
} from "@/lib/types/database";

/**
 * توليد عرض اجتماع جديد (أو إعادة توليد العرض المسوَّدة الحالية) كـ
 * Background Job — نفس أسلوب Client Presentation/PRD بالظبط: نحجز
 * الـ Lock ونرجّع فورًا، والتوليد الفعلي بيحصل في after().
 */
export async function generateMeetingPresentation(
  projectId: string,
  title: string,
  meetingDate: string | null
): Promise<PresentationGenerationResult> {
  const auth = await requireRole(["owner", "admin", "member"]);
  if (!auth.ok) return { status: "error", message: auth.message ?? "غير مصرّح." };

  const presentation = await MeetingPresentationGenerationEngine.ensureDraftPresentation(projectId);

  const supabase = createServiceClient();
  await supabase
    .from("meeting_presentations")
    .update({ title: title.trim() || presentation.title, meeting_date: meetingDate })
    .eq("id", presentation.id);

  const claimed = await MeetingPresentationGenerationEngine.tryClaimLock(presentation.id);
  if (!claimed) {
    revalidatePath(`/dashboard/projects/${projectId}`);
    return { status: "already_generating" };
  }

  after(async () => {
    try {
      await MeetingPresentationGenerationEngine.runFullGenerationCore(presentation.id, projectId, auth.userId);
    } catch (err) {
      console.error("[MeetingPresentation background] failed:", err);
    }
  });

  revalidatePath(`/dashboard/projects/${projectId}`);
  return { status: "started" };
}

export async function regenerateMeetingPresentationSlide(
  projectId: string,
  presentationId: string,
  slideKey: MeetingPresentationSlideKey
): Promise<PresentationGenerationResult> {
  const auth = await requireRole(["owner", "admin", "member"]);
  if (!auth.ok) return { status: "error", message: auth.message ?? "غير مصرّح." };

  const result = await MeetingPresentationGenerationEngine.regenerateSlide(presentationId, projectId, slideKey, auth.userId);
  revalidatePath(`/dashboard/projects/${projectId}`);
  return result;
}

export async function editMeetingPresentationSlide(
  projectId: string,
  presentationId: string,
  slideKey: MeetingPresentationSlideKey,
  value: unknown
): Promise<{ ok: boolean; message?: string }> {
  const auth = await requireRole(["owner", "admin", "member"]);
  if (!auth.ok) return { ok: false, message: auth.message };

  const supabase = await createClient();
  await applyManualSlideEdit(supabase, presentationId, slideKey, value, auth.userId);
  revalidatePath(`/dashboard/projects/${projectId}`);
  return { ok: true };
}

export async function getDraftMeetingPresentation(projectId: string): Promise<MeetingPresentation | null> {
  const auth = await requireRole(["owner", "admin", "member"]);
  if (!auth.ok) return null;
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("meeting_presentations")
    .select("*")
    .eq("project_id", projectId)
    .is("meeting_id", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as MeetingPresentation | null) ?? null;
}

export async function getMeetingPresentationHistory(projectId: string): Promise<MeetingPresentation[]> {
  const auth = await requireRole(["owner", "admin", "member"]);
  if (!auth.ok) return [];
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("meeting_presentations")
    .select("*")
    .eq("project_id", projectId)
    .not("meeting_id", "is", null)
    .order("created_at", { ascending: false });
  return (data as MeetingPresentation[] | null) ?? [];
}

export async function startLiveMeeting(
  projectId: string,
  presentationId: string
): Promise<{ ok: boolean; meetingId?: string; sessionId?: string; message?: string }> {
  const auth = await requireRole(["owner", "admin", "member"]);
  if (!auth.ok) return { ok: false, message: auth.message };

  try {
    const result = await startMeeting(projectId, presentationId, auth.userId ?? null);
    revalidatePath(`/dashboard/projects/${projectId}`);
    return { ok: true, ...result };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "فشل بدء الاجتماع." };
  }
}

export async function endLiveMeeting(projectId: string, sessionId: string): Promise<{ ok: boolean; message?: string }> {
  const auth = await requireRole(["owner", "admin", "member"]);
  if (!auth.ok) return { ok: false, message: auth.message };

  try {
    await endMeeting(sessionId, auth.userId ?? null);
    revalidatePath(`/dashboard/projects/${projectId}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "فشل إنهاء الاجتماع." };
  }
}

/**
 * رفع مستقل (بدون Live Meeting Mode ولا عرض تقديمي): بينشئ صف
 * meetings فاضي بس عشان getMeetingRecordingUploadTarget يقدر يبني مسار
 * الرفع منه — نفس نمط MeetingService.create المستخدم في Telegram
 * webhook وبدء Live Meeting Mode بالظبط، إعادة استخدام مش تكرار.
 */
export async function createMeetingForUploadAction(
  projectId: string,
  title?: string
): Promise<{ ok: boolean; meetingId?: string; message?: string }> {
  const auth = await requireRole(["owner", "admin", "member"]);
  if (!auth.ok) return { ok: false, message: auth.message };

  const supabase = createServiceClient();
  const { data: project } = await supabase.from("projects").select("project_code").eq("id", projectId).maybeSingle();
  if (!project) return { ok: false, message: "المشروع غير موجود." };

  try {
    const meeting = await MeetingService.create(supabase, projectId, project.project_code as string);

    const trimmedTitle = title?.trim();
    if (trimmedTitle) {
      await supabase.from("meetings").update({ title: trimmedTitle }).eq("id", meeting.id);
    }

    revalidatePath(`/dashboard/projects/${projectId}`);
    return { ok: true, meetingId: meeting.id };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "فشل إنشاء الاجتماع." };
  }
}

/**
 * مسار التسجيل داخل المنصة — الخطوة الأولى: يرجّع للمتصفح مسار Storage
 * اللي هيرفع عليه التسجيل مباشرة. الرفع المباشر (مش عبر Server Action)
 * مقصود: طلبات الـ Serverless عندها سقف حجم صغير، وتسجيل ساعة اجتماع
 * بيتخطّاه بسهولة.
 */
export async function getMeetingRecordingUploadTarget(
  projectId: string,
  meetingId: string
): Promise<{ ok: boolean; bucket?: string; path?: string; message?: string }> {
  const auth = await requireRole(["owner", "admin", "member"]);
  if (!auth.ok) return { ok: false, message: auth.message };

  const supabase = createServiceClient();
  const { data: project } = await supabase.from("projects").select("project_code").eq("id", projectId).maybeSingle();
  if (!project) return { ok: false, message: "المشروع غير موجود." };

  return {
    ok: true,
    bucket: MEETINGS_BUCKET,
    path: meetingRecordingPath(project.project_code as string, meetingId),
  };
}

/**
 * الخطوة الثانية: بعد ما المتصفح يرفع التسجيل، بنشغّل نفس خط المعالجة
 * الموجود (تفريغ → استخراج → Project Brain) في الخلفية. نفس الـ Pipeline
 * بتاع Telegram بالظبط — الفرق الوحيد مصدر الملف.
 */
export async function processInAppMeetingRecording(
  projectId: string,
  meetingId: string,
  storagePath: string,
  mimeType: string
): Promise<{ ok: boolean; message?: string }> {
  const auth = await requireRole(["owner", "admin", "member"]);
  if (!auth.ok) return { ok: false, message: auth.message };

  const supabase = createServiceClient();
  const { data: project } = await supabase.from("projects").select("project_code").eq("id", projectId).maybeSingle();
  if (!project) return { ok: false, message: "المشروع غير موجود." };

  // نتأكد إن الملف فعلًا موجود قبل ما نعد المستخدم بمعالجة.
  const expectedPath = meetingRecordingPath(project.project_code as string, meetingId);
  if (storagePath !== expectedPath) {
    return { ok: false, message: "مسار التسجيل غير صالح." };
  }

  await supabase.from("meetings").update({ recording_source: "in_app" }).eq("id", meetingId);

  after(() =>
    processMeetingPipeline({
      meetingId,
      projectId,
      projectCode: project.project_code as string,
      mimeType,
      source: { kind: "storage", storagePath },
    })
  );

  revalidatePath(`/dashboard/projects/${projectId}`);
  return { ok: true };
}

/** حالة معالجة الاجتماع — للـ polling في الواجهة بعد إنهاء الاجتماع. */
export async function getMeetingProcessingStatus(
  meetingId: string
): Promise<{ ok: boolean; status?: string; errorMessage?: string | null; message?: string }> {
  const auth = await requireRole(["owner", "admin", "member"]);
  if (!auth.ok) return { ok: false, message: auth.message };

  const supabase = createServiceClient();
  const { data } = await supabase
    .from("meetings")
    .select("status, error_message")
    .eq("id", meetingId)
    .maybeSingle();

  if (!data) return { ok: false, message: "الاجتماع غير موجود." };
  return { ok: true, status: data.status as string, errorMessage: (data.error_message as string | null) ?? null };
}

export async function updateLiveMeetingSlide(projectId: string, sessionId: string, slideIndex: number): Promise<{ ok: boolean }> {
  const auth = await requireRole(["owner", "admin", "member"]);
  if (!auth.ok) return { ok: false };
  await updateCurrentSlide(sessionId, slideIndex);
  return { ok: true };
}

export async function captureLiveMeetingItem(
  projectId: string,
  sessionId: string,
  captureType: MeetingLiveCaptureType,
  text: string
): Promise<{ ok: boolean; message?: string }> {
  const auth = await requireRole(["owner", "admin", "member"]);
  if (!auth.ok) return { ok: false, message: auth.message };

  try {
    await captureLiveItem(sessionId, captureType, text, auth.userId ?? null);
    return { ok: true };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "فشل تسجيل العنصر." };
  }
}

export async function getLiveMeetingState(
  projectId: string,
  meetingId: string
): Promise<{ session: MeetingLiveSession | null; captures: MeetingLiveCapture[] }> {
  const auth = await requireRole(["owner", "admin", "member"]);
  if (!auth.ok) return { session: null, captures: [] };
  return getLiveState(meetingId);
}

export async function getMeetingReviewForMeeting(projectId: string, meetingId: string): Promise<MeetingReview | null> {
  const auth = await requireRole(["owner", "admin", "member"]);
  if (!auth.ok) return null;
  const supabase = createServiceClient();
  const { data } = await supabase.from("meeting_reviews").select("*").eq("meeting_id", meetingId).maybeSingle();
  return (data as MeetingReview | null) ?? null;
}

export async function getMeetingLifecycleTimeline(projectId: string, meetingId: string): Promise<MeetingLifecycleEvent[]> {
  const auth = await requireRole(["owner", "admin", "member"]);
  if (!auth.ok) return [];
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("meeting_lifecycle_events")
    .select("*")
    .eq("meeting_id", meetingId)
    .order("created_at", { ascending: true });
  return (data as MeetingLifecycleEvent[] | null) ?? [];
}

export async function getPresentationByIdAction(projectId: string, presentationId: string): Promise<MeetingPresentation | null> {
  const auth = await requireRole(["owner", "admin", "member"]);
  if (!auth.ok) return null;
  const supabase = createServiceClient();
  return getPresentationById(supabase, presentationId);
}
