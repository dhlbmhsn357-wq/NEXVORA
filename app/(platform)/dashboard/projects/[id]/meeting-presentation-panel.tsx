"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Presentation as PresentationIcon, PlayCircle, History, Sparkles, Download, ExternalLink } from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";
import RegenerateConfirmDialog from "@/components/ui/RegenerateConfirmDialog";
import { toast } from "@/components/ui/Toaster";
import { generateMeetingPresentation, startLiveMeeting } from "./meeting-presentation-actions";
import MeetingSlideDeck, { SLIDE_LABELS, SLIDE_ORDER } from "./meeting-slide-deck";
import MeetingLiveMode from "./meeting-live-mode";
import MeetingReviewPanel from "./meeting-review-panel";
import type { MeetingPresentation } from "@/lib/types/database";
import { useBackgroundRefresh } from "@/lib/ui/use-background-refresh";

export default function MeetingPresentationPanel({
  projectId,
  draft,
  history,
}: {
  projectId: string;
  draft: MeetingPresentation | null;
  history: MeetingPresentation[];
}) {
  const router = useRouter();
  const [generating, setGenerating] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [title, setTitle] = useState(draft?.title ?? "");
  const [meetingDate, setMeetingDate] = useState(draft?.meeting_date?.slice(0, 16) ?? "");
  const [liveSession, setLiveSession] = useState<{ meetingId: string; sessionId: string } | null>(null);

  const isGenerating = draft?.status === "generating" || generating;
  const hasContent = !!(draft && draft.version > 0);

  // تحديث دوري مُجمَّع: منسّق واحد لكل الصفحة بدل مؤقّت لكل لوحة، بيقف
  // لما التبويب يكون مخفي وبيبطّل خالص لو المهمة اتعلّقت.
  useBackgroundRefresh(draft?.status === "generating");

  async function runGenerate() {
    setShowConfirm(false);
    setGenerating(true);
    const result = await generateMeetingPresentation(projectId, title, meetingDate ? new Date(meetingDate).toISOString() : null);
    if (result.status === "already_generating") {
      toast.error("فيه توليد شغال بالفعل، استنى يخلص.");
    } else if (result.status === "missing_data") {
      toast.error(result.message);
    }
    setGenerating(false);
    router.refresh();
  }

  async function handleStartMeeting() {
    if (!draft) return;
    const r = await startLiveMeeting(projectId, draft.id);
    if (!r.ok || !r.meetingId || !r.sessionId) {
      toast.error(r.message ?? "فشل بدء الاجتماع.");
      return;
    }
    setLiveSession({ meetingId: r.meetingId, sessionId: r.sessionId });
  }

  if (liveSession) {
    return (
      <MeetingLiveMode
        projectId={projectId}
        meetingId={liveSession.meetingId}
        sessionId={liveSession.sessionId}
        slides={draft?.slides ?? {}}
        slideOrder={SLIDE_ORDER}
        slideLabels={SLIDE_LABELS}
        onEnd={() => {
          setLiveSession(null);
          router.refresh();
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <Card padding="md">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="flex items-center gap-2 text-sm font-semibold text-[var(--v-text)]">
            <PresentationIcon size={16} className="text-[var(--v-primary)]" /> عرض اجتماع العميل القادم
          </p>
          {draft?.status === "failed" && <Badge tone="danger">فشل آخر توليد</Badge>}
          {isGenerating && <Badge tone="info">جاري التوليد…</Badge>}
          {hasContent && !isGenerating && <Badge tone="success">جاهز — نسخة {draft?.version}</Badge>}
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-[11px] font-medium text-[var(--v-text-muted)]">عنوان الاجتماع</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="مثال: اجتماع مراجعة النطاق مع العميل"
              className="w-full rounded-[var(--v-radius-sm)] border border-[var(--v-border)] bg-[var(--v-bg)] px-3 py-2 text-sm text-[var(--v-text)] outline-none focus:border-[var(--v-primary)]"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium text-[var(--v-text-muted)]">موعد الاجتماع (اختياري)</label>
            <input
              type="datetime-local"
              value={meetingDate}
              onChange={(e) => setMeetingDate(e.target.value)}
              className="w-full rounded-[var(--v-radius-sm)] border border-[var(--v-border)] bg-[var(--v-bg)] px-3 py-2 text-sm text-[var(--v-text)] outline-none focus:border-[var(--v-primary)]"
            />
          </div>
        </div>

        {draft?.last_error && <p className="mt-2 text-xs text-[var(--v-red)]">{draft.last_error}</p>}

        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="primary" size="sm" onClick={() => (hasContent ? setShowConfirm(true) : runGenerate())} disabled={isGenerating}>
            <Sparkles size={14} /> {hasContent ? "إعادة توليد العرض بالكامل" : "توليد العرض بالذكاء الاصطناعي"}
          </Button>
          {hasContent && (
            <Button variant="success" size="sm" onClick={handleStartMeeting} disabled={isGenerating}>
              <PlayCircle size={14} /> ابدأ الاجتماع (Live Meeting Mode)
            </Button>
          )}
          {hasContent && (
            <>
              <a
                href={`/meeting-presentation-pptx/${projectId}`}
                className="inline-flex items-center gap-1.5 rounded-[var(--v-radius-md)] border border-[var(--v-border)] px-3 py-1.5 text-sm font-medium text-[var(--v-text)] transition hover:border-[var(--v-primary)]"
              >
                <Download size={14} /> تحميل PowerPoint
              </a>
              <a
                href={`/meeting-present/${projectId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-[var(--v-radius-md)] border border-[var(--v-border)] px-3 py-1.5 text-sm font-medium text-[var(--v-text)] transition hover:border-[var(--v-primary)]"
              >
                <ExternalLink size={14} /> فتح كصفحة ويب
              </a>
            </>
          )}
        </div>
      </Card>

      {showConfirm && (
        <RegenerateConfirmDialog
          title="توليد عرض جديد بالكامل؟"
          message="هيتم استبدال كل شرائح العرض الحالية بمحتوى جديد مبني على أحدث نسخة من Project Brain."
          onCancel={() => setShowConfirm(false)}
          onConfirm={runGenerate}
        />
      )}

      {!hasContent && !isGenerating && (
        <EmptyState
          title="لسه معملتش عرض لهذا الاجتماع"
          description="اضغط «توليد العرض بالذكاء الاصطناعي» — هيتبني تلقائيًا من Project Brain وPRD وتجهيزات الاجتماع الحالية، كـ 15 شريحة حقيقية جاهزة للعرض."
        />
      )}

      {hasContent && <MeetingSlideDeck projectId={projectId} presentationId={draft!.id} slides={draft!.slides} disabled={isGenerating} />}

      {history.length > 0 && (
        <Card padding="md">
          <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--v-text)]">
            <History size={16} className="text-[var(--v-primary)]" /> اجتماعات سابقة ({history.length})
          </p>
          <div className="space-y-4">
            {history.map((p) => (
              <MeetingReviewPanel key={p.id} projectId={projectId} presentation={p} />
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
