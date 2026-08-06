"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, CheckCircle2, XCircle, HelpCircle, GitPullRequestArrow, ListChecks, ShieldAlert, Compass } from "lucide-react";
import Badge from "@/components/ui/Badge";
import { getMeetingLifecycleTimeline, getMeetingReviewForMeeting } from "./meeting-presentation-actions";
import MeetingTimeline from "./meeting-timeline";
import type { MeetingLifecycleEvent, MeetingPresentation, MeetingReview } from "@/lib/types/database";

function ListBlock({ icon: Icon, label, tone, items }: { icon: React.ElementType; label: string; tone: "success" | "danger" | "warning" | "info"; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold text-[var(--v-text-muted)]">
        <Icon size={12} /> {label}
      </p>
      <div className="flex flex-wrap gap-1">
        {items.map((item, i) => (
          <Badge key={i} tone={tone}>
            {item}
          </Badge>
        ))}
      </div>
    </div>
  );
}

export default function MeetingReviewPanel({ projectId, presentation }: { projectId: string; presentation: MeetingPresentation }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [review, setReview] = useState<MeetingReview | null>(null);
  const [timeline, setTimeline] = useState<MeetingLifecycleEvent[]>([]);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && !loaded && presentation.meeting_id) {
      setLoading(true);
      const [r, t] = await Promise.all([
        getMeetingReviewForMeeting(projectId, presentation.meeting_id),
        getMeetingLifecycleTimeline(projectId, presentation.meeting_id),
      ]);
      setReview(r);
      setTimeline(t);
      setLoading(false);
      setLoaded(true);
    }
  }

  return (
    <div className="rounded-[var(--v-radius-md)] border border-[var(--v-border)]">
      <button
        type="button"
        onClick={toggle}
        className="flex w-full items-center justify-between p-3 text-right focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--v-primary)]"
      >
        <div>
          <p className="text-sm font-semibold text-[var(--v-text)]">{presentation.title || "اجتماع بدون عنوان"}</p>
          <p className="text-[11px] text-[var(--v-text-muted)]">
            {presentation.meeting_date ? new Date(presentation.meeting_date).toLocaleString("ar-EG") : "—"}
          </p>
        </div>
        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>

      {open && (
        <div className="border-t border-[var(--v-border)] p-3">
          {loading && <p className="text-xs text-[var(--v-text-muted)]">جاري التحميل…</p>}

          {!loading && timeline.length > 0 && (
            <div className="mb-3">
              <MeetingTimeline events={timeline} />
            </div>
          )}

          {!loading && !review && <p className="text-xs text-[var(--v-text-muted)]">لسه مفيش مراجعة لهذا الاجتماع (بتتولد تلقائيًا بعد رفع التسجيل وتحليله).</p>}

          {!loading && review && review.status === "generating" && <Badge tone="info">جاري توليد المراجعة…</Badge>}

          {!loading && review && review.status === "ready" && (
            <div className="space-y-3">
              <ListBlock icon={CheckCircle2} label="تمت مناقشته" tone="success" items={review.discussed} />
              <ListBlock icon={XCircle} label="لم تتم مناقشته" tone="danger" items={review.not_discussed} />
              <ListBlock icon={HelpCircle} label="أسئلة مفتوحة" tone="warning" items={review.open_questions} />
              <ListBlock icon={GitPullRequestArrow} label="قرارات جديدة" tone="info" items={review.new_decisions} />
              <ListBlock icon={ListChecks} label="مهام جديدة" tone="info" items={review.new_tasks} />
              <ListBlock icon={ShieldAlert} label="مخاطر جديدة" tone="danger" items={review.new_risks} />
              <ListBlock icon={Compass} label="افتراضات جديدة" tone="warning" items={review.new_assumptions} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
