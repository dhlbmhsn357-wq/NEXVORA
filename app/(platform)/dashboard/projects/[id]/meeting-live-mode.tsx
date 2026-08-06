"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Clock,
  ChevronRight,
  ChevronLeft,
  StopCircle,
  GitPullRequestArrow,
  ShieldAlert,
  ListChecks,
  Lightbulb,
  HelpCircle,
  CheckSquare,
  MessageSquareHeart,
  StickyNote,
  Scale,
  Frown,
  Lock,
  Link2,
  Mic,
  MicOff,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  UploadCloud,
} from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import { toast } from "@/components/ui/Toaster";
import { createClient } from "@/lib/supabase/client";
import {
  captureLiveMeetingItem,
  endLiveMeeting,
  getLiveMeetingState,
  getMeetingProcessingStatus,
  getMeetingRecordingUploadTarget,
  processInAppMeetingRecording,
  updateLiveMeetingSlide,
} from "./meeting-presentation-actions";
import {
  RECORDING_AUDIO_BITS_PER_SECOND,
  baseMimeType,
  checkRecordingSize,
  describeMicError,
  pickRecordingMimeType,
} from "@/lib/meetings/recording-format";
import { getSlideSummary } from "@/lib/meeting-presentation/slide-summary";
import type { MeetingLiveCapture, MeetingLiveCaptureType, MeetingPresentationSlideKey, MeetingPresentationSlides } from "@/lib/types/database";

const CAPTURE_TYPES: { key: MeetingLiveCaptureType; label: string; icon: React.ElementType }[] = [
  { key: "decision", label: "قرار", icon: GitPullRequestArrow },
  { key: "risk", label: "خطر", icon: ShieldAlert },
  { key: "requirement", label: "متطلب", icon: ListChecks },
  { key: "idea", label: "فكرة", icon: Lightbulb },
  { key: "question", label: "سؤال", icon: HelpCircle },
  { key: "action_item", label: "مهمة", icon: CheckSquare },
  { key: "client_feedback", label: "ملاحظة عميل", icon: MessageSquareHeart },
  { key: "business_rule", label: "قاعدة عمل", icon: Scale },
  { key: "pain_point", label: "نقطة ألم", icon: Frown },
  { key: "constraint", label: "قيد", icon: Lock },
  { key: "dependency", label: "اعتماد", icon: Link2 },
];

function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}

export default function MeetingLiveMode({
  projectId,
  meetingId,
  sessionId,
  slides,
  slideOrder,
  slideLabels,
  onEnd,
}: {
  projectId: string;
  meetingId: string;
  sessionId: string;
  slides: MeetingPresentationSlides;
  slideOrder: MeetingPresentationSlideKey[];
  slideLabels: Record<MeetingPresentationSlideKey, string>;
  onEnd: () => void;
}) {
  const [startedAt] = useState(() => Date.now());
  const [elapsed, setElapsed] = useState(0);
  const [slideIndex, setSlideIndex] = useState(0);
  const [captures, setCaptures] = useState<MeetingLiveCapture[]>([]);
  const [captureType, setCaptureType] = useState<MeetingLiveCaptureType>("decision");
  const [captureText, setCaptureText] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [ending, setEnding] = useState(false);

  // ===== التسجيل الصوتي داخل المنصة =====
  type RecordingState = "idle" | "starting" | "recording" | "unsupported" | "blocked" | "stopped";
  type ProcessingPhase = "idle" | "uploading" | "processing" | "done" | "failed";
  const [recordingState, setRecordingState] = useState<RecordingState>("idle");
  const [micMessage, setMicMessage] = useState<string | null>(null);
  const [micRetryable, setMicRetryable] = useState(true);
  const [processingPhase, setProcessingPhase] = useState<ProcessingPhase>("idle");
  const [processingMessage, setProcessingMessage] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const mimeTypeRef = useRef<string>("audio/webm");

  useEffect(() => {
    const id = setInterval(() => setElapsed(Date.now() - startedAt), 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  /** يوقف الميكروفون فعليًا (لمبة التسجيل في المتصفح بتطفى). */
  const releaseMic = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  /**
   * بدء التسجيل — لازم يتنادى من ضغطة المستخدم مباشرة (إيماءة حقيقية).
   * الطلب التلقائي عند فتح الوضع كان بيتسبب في رفض المتصفح وحفظ الرفض،
   * وبعدها أي ضغطة بتترفض فورًا من غير ما يظهر طلب إذن أصلًا.
   */
  const startRecording = useCallback(async () => {
    if (typeof window === "undefined" || typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setRecordingState("unsupported");
      setMicMessage("المتصفح ده مش بيدعم التسجيل — استخدم Chrome أو Edge، أو ارفع ملف تسجيل جاهز.");
      return;
    }
    const mimeType = pickRecordingMimeType((m) => MediaRecorder.isTypeSupported(m));
    if (!mimeType) {
      setRecordingState("unsupported");
      setMicMessage("المتصفح مش بيدعم أي صيغة تسجيل مناسبة — ارفع ملف تسجيل جاهز بدلًا من كده.");
      return;
    }

    setRecordingState("starting");
    setMicMessage(null);

    // هل المتصفح حافظ رفضًا سابقًا؟ لو أيوه، إعادة الطلب مش هتظهر أي
    // نافذة إذن — فبنقول للمستخدم الحل الحقيقي بدل "اضغط للسماح".
    let permanentlyDenied = false;
    try {
      const status = await navigator.permissions?.query({ name: "microphone" as PermissionName });
      permanentlyDenied = status?.state === "denied";
    } catch {
      // Permissions API مش متاحة في كل المتصفحات — منكملش على تخمين.
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      streamRef.current = stream;
      mimeTypeRef.current = mimeType;
      chunksRef.current = [];

      const recorder = new MediaRecorder(stream, {
        mimeType,
        audioBitsPerSecond: RECORDING_AUDIO_BITS_PER_SECOND,
      });
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      // قطع كل 5 ثواني — يقلّل فقد البيانات لو التبويب اتقفل فجأة.
      recorder.start(5000);
      recorderRef.current = recorder;
      setRecordingState("recording");
      setMicMessage(null);
    } catch (err) {
      const info = describeMicError((err as { name?: string })?.name, permanentlyDenied);
      setRecordingState("blocked");
      setMicMessage(info.message);
      setMicRetryable(info.retryable);
    }
  }, []);

  // تنظيف عند الخروج — نوقف المسجّل ونطفي الميكروفون.
  useEffect(() => {
    return () => {
      const recorder = recorderRef.current;
      if (recorder && recorder.state === "recording") recorder.stop();
      releaseMic();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** يوقف المسجّل وينتظر آخر قطعة بيانات ثم يرجّع الملف كاملًا. */
  function stopRecordingAndGetBlob(): Promise<Blob | null> {
    return new Promise((resolve) => {
      const recorder = recorderRef.current;
      if (!recorder || recorder.state === "inactive") {
        resolve(chunksRef.current.length > 0 ? new Blob(chunksRef.current, { type: mimeTypeRef.current }) : null);
        return;
      }
      recorder.onstop = () => {
        releaseMic();
        setRecordingState("stopped");
        resolve(chunksRef.current.length > 0 ? new Blob(chunksRef.current, { type: mimeTypeRef.current }) : null);
      };
      recorder.stop();
    });
  }

  /**
   * الرفع + تشغيل خط التفريغ — مشترك بين التسجيل داخل المنصة ورفع ملف
   * جاهز، عشان المسارين يدّوا نفس النتيجة بالظبط.
   */
  async function uploadAndProcess(blob: Blob, contentType: string) {
    const sizeCheck = checkRecordingSize(blob.size);
    if (!sizeCheck.ok) {
      setProcessingPhase("failed");
      setProcessingMessage(sizeCheck.reason);
      toast.error(sizeCheck.reason);
      return;
    }

    setProcessingPhase("uploading");
    setProcessingMessage("جاري رفع التسجيل…");

    try {
      const target = await getMeetingRecordingUploadTarget(projectId, meetingId);
      if (!target.ok || !target.bucket || !target.path) {
        throw new Error(target.message ?? "تعذّر تجهيز مكان الرفع.");
      }

      const supabase = createClient();
      const { error: uploadError } = await supabase.storage
        .from(target.bucket)
        .upload(target.path, blob, { contentType, upsert: true });
      if (uploadError) throw new Error(`فشل رفع التسجيل: ${uploadError.message}`);

      const started = await processInAppMeetingRecording(projectId, meetingId, target.path, contentType);
      if (!started.ok) throw new Error(started.message ?? "تعذّر بدء المعالجة.");

      setProcessingPhase("processing");
      setProcessingMessage("جاري التفريغ واستخراج القرارات والمهام…");
      toast.success("اترفع التسجيل — التفريغ والتحليل شغّالين دلوقتي.");
      pollProcessing();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "فشل رفع التسجيل.";
      setProcessingPhase("failed");
      setProcessingMessage(msg);
      toast.error(msg);
    }
  }

  /**
   * بديل كامل للتسجيل داخل المنصة: ارفع ملفًا سجّلته بموبايلك — بيمرّ
   * على نفس خط التفريغ والاستخراج، من غير تليجرام.
   */
  async function handleFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    await uploadAndProcess(file, baseMimeType(file.type || "audio/mpeg"));
  }

  /** متابعة حالة المعالجة على الخادم لحد ما تخلص أو تفشل. */
  const pollProcessing = useCallback(async () => {
    const deadline = Date.now() + 15 * 60_000;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 5000));
      const r = await getMeetingProcessingStatus(meetingId);
      if (!r.ok) continue;
      if (r.status === "processed") {
        setProcessingPhase("done");
        setProcessingMessage("تم تفريغ الاجتماع واستخراج القرارات والمهام — راجعها في Project Brain.");
        return;
      }
      if (r.status === "failed") {
        setProcessingPhase("failed");
        setProcessingMessage(r.errorMessage ?? "فشلت معالجة التسجيل.");
        return;
      }
    }
    setProcessingPhase("failed");
    setProcessingMessage("المعالجة أخذت وقتًا أطول من المتوقع — راجع حالة الاجتماع لاحقًا.");
  }, [meetingId]);

  useEffect(() => {
    getLiveMeetingState(projectId, meetingId).then(({ captures }) => setCaptures(captures));

    const supabase = createClient();
    const channel = supabase
      .channel(`meeting-live-${sessionId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "meeting_live_captures", filter: `session_id=eq.${sessionId}` }, (payload) => {
        setCaptures((prev) => [...prev, payload.new as MeetingLiveCapture]);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [projectId, meetingId, sessionId]);

  const currentSlideKey = slideOrder[slideIndex];
  const currentSlide = currentSlideKey ? getSlideSummary(currentSlideKey, slides[currentSlideKey]) : null;

  const checklist = useMemo(
    () => slideOrder.map((key, i) => ({ key, label: slideLabels[key], done: i < slideIndex })),
    [slideOrder, slideLabels, slideIndex]
  );

  function goTo(index: number) {
    const clamped = Math.max(0, Math.min(slideOrder.length - 1, index));
    setSlideIndex(clamped);
    updateLiveMeetingSlide(projectId, sessionId, clamped);
  }

  async function submitCapture() {
    if (!captureText.trim()) return;
    setSubmitting(true);
    const r = await captureLiveMeetingItem(projectId, sessionId, captureType, captureText.trim());
    setSubmitting(false);
    if (!r.ok) {
      toast.error(r.message ?? "فشل تسجيل العنصر.");
      return;
    }
    setCaptureText("");
  }

  /**
   * إنهاء الاجتماع = وقف التسجيل → رفعه مباشرة لـ Storage → تشغيل خط
   * التفريغ والاستخراج تلقائيًا. الرفع من المتصفح مباشرة (مش عبر Server
   * Action) عشان يتخطّى سقف حجم الطلب في Serverless.
   */
  async function handleEnd() {
    setEnding(true);

    const blob = await stopRecordingAndGetBlob();
    const endResult = await endLiveMeeting(projectId, sessionId);
    if (!endResult.ok) {
      setEnding(false);
      toast.error(endResult.message ?? "فشل إنهاء الاجتماع.");
      return;
    }

    setEnding(false);

    // مفيش تسجيل داخل المنصة — الاجتماع بينتهي عادي، والعناصر الملتقطة
    // يدويًا محفوظة أصلًا. لسه تقدر ترفع ملف تسجيل من الزرار تحت.
    if (!blob) {
      toast.success("انتهى الاجتماع. لو معاك تسجيل صوتي، ارفعه من «رفع ملف تسجيل» وهيتفرّغ تلقائيًا.");
      return;
    }

    await uploadAndProcess(blob, baseMimeType(mimeTypeRef.current));
  }

  return (
    <div className="space-y-4">
      <Card padding="md">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="success">Live Meeting Mode</Badge>
            {recordingState === "recording" && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--v-red)]/10 px-2.5 py-1 text-[11px] font-medium text-[var(--v-red)]">
                <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--v-red)]" />
                <Mic size={12} /> بيسجّل
              </span>
            )}
            {recordingState === "starting" && (
              <span className="inline-flex items-center gap-1.5 text-[11px] text-[var(--v-text-muted)]">
                <Loader2 size={12} className="animate-spin" /> جاري تشغيل الميكروفون…
              </span>
            )}
            {recordingState === "idle" && processingPhase === "idle" && (
              <Button variant="primary" size="sm" onClick={startRecording}>
                <Mic size={13} /> ابدأ التسجيل
              </Button>
            )}
            {recordingState === "blocked" && micRetryable && (
              <Button variant="outline" size="sm" onClick={startRecording}>
                <Mic size={13} /> حاول تاني
              </Button>
            )}
            {(recordingState === "blocked" || recordingState === "unsupported") && !micRetryable && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--v-amber)]/10 px-2.5 py-1 text-[11px] font-medium text-[var(--v-amber)]">
                <MicOff size={12} /> الميكروفون متوقف
              </span>
            )}
          </div>
          <p className="flex items-center gap-1.5 font-mono-plex text-lg font-bold text-[var(--v-text)]">
            <Clock size={16} className="text-[var(--v-primary)]" /> {formatElapsed(elapsed)}
          </p>
          <Button variant="danger" size="sm" onClick={handleEnd} disabled={ending || processingPhase !== "idle"}>
            <StopCircle size={14} /> {ending ? "جاري الإنهاء…" : "إنهاء الاجتماع"}
          </Button>
        </div>

        {recordingState === "recording" && (
          <p className="mt-2 text-[11px] text-[var(--v-text-muted)]">
            بمجرد ما تضغط «إنهاء الاجتماع» هيترفع التسجيل تلقائيًا ويتفرّغ وتتستخرج منه القرارات والمهام والمخاطر.
          </p>
        )}

        {recordingState === "idle" && processingPhase === "idle" && (
          <p className="mt-2 text-[11px] text-[var(--v-text-muted)]">
            اضغط «ابدأ التسجيل» وهيطلب منك المتصفح إذن الميكروفون. أو ارفع ملف تسجيل جاهز من الزرار تحت.
          </p>
        )}

        {/* تشخيص الميكروفون + البديل الدائم: رفع ملف تسجيل */}
        {(micMessage || processingPhase === "idle") && recordingState !== "recording" && (
          <div className="mt-3 rounded-[var(--v-radius-md)] border border-[var(--v-border)] p-3">
            {micMessage && (
              <p className="mb-2 flex items-start gap-1.5 text-xs text-[var(--v-amber)]">
                <AlertTriangle size={13} className="mt-0.5 shrink-0" /> {micMessage}
              </p>
            )}
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-[var(--v-radius-md)] border border-[var(--v-border)] px-3 py-1.5 text-xs font-medium text-[var(--v-text)] transition hover:border-[var(--v-primary)]">
              <UploadCloud size={14} /> رفع ملف تسجيل
              <input type="file" accept="audio/*" className="hidden" onChange={handleFilePicked} />
            </label>
            <p className="mt-1.5 text-[10px] text-[var(--v-text-muted)]">
              سجّل بموبايلك وارفع الملف هنا — هيتفرّغ وتتستخرج منه البيانات بنفس الطريقة، من غير تليجرام.
            </p>
          </div>
        )}

        {processingPhase !== "idle" && (
          <div
            className={`mt-3 flex items-start gap-2 rounded-[var(--v-radius-md)] border p-3 text-xs ${
              processingPhase === "failed"
                ? "border-[var(--v-red)]/40 bg-[var(--v-red)]/5 text-[var(--v-red)]"
                : processingPhase === "done"
                  ? "border-[var(--v-green)]/40 bg-[var(--v-green)]/5 text-[var(--v-text)]"
                  : "border-[var(--v-primary)]/40 bg-[var(--v-primary)]/5 text-[var(--v-text)]"
            }`}
          >
            {processingPhase === "uploading" && <UploadCloud size={14} className="mt-0.5 shrink-0 animate-pulse" />}
            {processingPhase === "processing" && <Loader2 size={14} className="mt-0.5 shrink-0 animate-spin" />}
            {processingPhase === "done" && <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-[var(--v-green)]" />}
            {processingPhase === "failed" && <AlertTriangle size={14} className="mt-0.5 shrink-0" />}
            <div className="flex-1">
              <p>{processingMessage}</p>
              {processingPhase === "processing" && (
                <p className="mt-1 text-[10px] text-[var(--v-text-muted)]">
                  تقدر تقفل الصفحة — المعالجة بتكمل في الخلفية وهتلاقي النتيجة في Project Brain.
                </p>
              )}
              {(processingPhase === "done" || processingPhase === "failed") && (
                <Button variant="outline" size="sm" className="mt-2" onClick={onEnd}>
                  إغلاق وضع الاجتماع
                </Button>
              )}
            </div>
          </div>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-3">
          <Card padding="md">
            <div className="flex items-center justify-between">
              <Button variant="outline" size="sm" onClick={() => goTo(slideIndex - 1)} disabled={slideIndex === 0}>
                <ChevronRight size={14} /> السابقة
              </Button>
              <p className="text-xs text-[var(--v-text-muted)]">
                {slideIndex + 1} / {slideOrder.length}
              </p>
              <Button variant="outline" size="sm" onClick={() => goTo(slideIndex + 1)} disabled={slideIndex === slideOrder.length - 1}>
                التالية <ChevronLeft size={14} />
              </Button>
            </div>
            {currentSlide ? (
              <div className="mt-3">
                <p className="text-base font-bold text-[var(--v-text)]">{currentSlide.heading}</p>
                {currentSlide.bullets.length > 0 && (
                  <ul className="mr-4 mt-2 list-disc space-y-1 text-sm text-[var(--v-text-secondary)]">
                    {currentSlide.bullets.map((b, i) => (
                      <li key={i}>{b}</li>
                    ))}
                  </ul>
                )}
              </div>
            ) : (
              <p className="mt-3 text-sm text-[var(--v-text-muted)]">مفيش محتوى لهذه الشريحة.</p>
            )}
          </Card>

          <Card padding="md">
            <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-[var(--v-text)]">
              <StickyNote size={15} className="text-[var(--v-primary)]" /> ملاحظاتك الشخصية أثناء الاجتماع
            </p>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              placeholder="ملاحظات حرة (محلية، مش بتتسجّل في Project Brain)…"
              className="w-full rounded-[var(--v-radius-sm)] border border-[var(--v-border)] bg-[var(--v-bg)] px-3 py-2 text-sm text-[var(--v-text)] outline-none focus:border-[var(--v-primary)]"
            />
          </Card>

          <Card padding="md">
            <p className="mb-2 text-sm font-semibold text-[var(--v-text)]">Checklist الأجندة</p>
            <div className="flex flex-wrap gap-1.5">
              {checklist.map((item) => (
                <Badge key={item.key} tone={item.done ? "success" : "neutral"}>
                  {item.label}
                </Badge>
              ))}
            </div>
          </Card>
        </div>

        <div className="space-y-3">
          <Card padding="md">
            <p className="mb-2 text-sm font-semibold text-[var(--v-text)]">تسجيل عنصر جديد</p>
            <div className="mb-2 flex flex-wrap gap-1">
              {CAPTURE_TYPES.map((t) => {
                const Icon = t.icon;
                return (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setCaptureType(t.key)}
                    className={`flex items-center gap-1 rounded-[var(--v-radius-sm)] border px-2 py-1 text-[11px] font-medium transition ${
                      captureType === t.key
                        ? "border-[var(--v-primary)] bg-[var(--v-primary)]/10 text-[var(--v-primary)]"
                        : "border-[var(--v-border)] text-[var(--v-text-secondary)] hover:border-[var(--v-primary)]"
                    }`}
                  >
                    <Icon size={12} /> {t.label}
                  </button>
                );
              })}
            </div>
            <textarea
              value={captureText}
              onChange={(e) => setCaptureText(e.target.value)}
              rows={2}
              placeholder="اكتب هنا…"
              className="w-full rounded-[var(--v-radius-sm)] border border-[var(--v-border)] bg-[var(--v-bg)] px-2 py-1.5 text-xs text-[var(--v-text)] outline-none focus:border-[var(--v-primary)]"
            />
            <Button variant="primary" size="sm" className="mt-2 w-full" onClick={submitCapture} disabled={submitting || !captureText.trim()}>
              تسجيل
            </Button>
            <p className="mt-1.5 text-[10px] text-[var(--v-text-muted)]">كل عنصر بيتسجّل فورًا في Project Brain كمعرفة معلّقة بانتظار المراجعة.</p>
          </Card>

          <Card padding="md">
            <p className="mb-2 text-sm font-semibold text-[var(--v-text)]">العناصر المسجَّلة ({captures.length})</p>
            {captures.length === 0 ? (
              <p className="text-xs text-[var(--v-text-muted)]">لسه معملتش أي تسجيل.</p>
            ) : (
              <div className="max-h-72 space-y-1.5 overflow-y-auto">
                {captures.map((c) => {
                  const meta = CAPTURE_TYPES.find((t) => t.key === c.capture_type);
                  const Icon = meta?.icon ?? StickyNote;
                  return (
                    <div key={c.id} className="flex items-start gap-1.5 rounded-[var(--v-radius-sm)] border border-[var(--v-border)] p-1.5 text-xs">
                      <Icon size={12} className="mt-0.5 shrink-0 text-[var(--v-primary)]" />
                      <div>
                        <p className="text-[10px] font-semibold text-[var(--v-text-muted)]">{meta?.label ?? c.capture_type}</p>
                        <p className="text-[var(--v-text)]">{c.text}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
