"use client";

import { CalendarPlus, PlayCircle, CheckCircle2, FileAudio, Sparkles, Brain, Presentation as PresentationIcon } from "lucide-react";
import type { MeetingLifecycleEvent, MeetingLifecycleEventType } from "@/lib/types/database";

const STAGE_ORDER: MeetingLifecycleEventType[] = [
  "planned",
  "started",
  "finished",
  "transcript_uploaded",
  "analysis_completed",
  "brain_updated",
  "presentation_updated",
];

const STAGE_LABELS: Record<MeetingLifecycleEventType, string> = {
  planned: "تم التخطيط",
  started: "بدأ الاجتماع",
  finished: "انتهى الاجتماع",
  transcript_uploaded: "رُفع التسجيل",
  analysis_completed: "اكتمل التحليل",
  brain_updated: "تحديث Project Brain",
  presentation_updated: "تحديث العرض التقديمي",
};

const STAGE_ICONS: Record<MeetingLifecycleEventType, React.ElementType> = {
  planned: CalendarPlus,
  started: PlayCircle,
  finished: CheckCircle2,
  transcript_uploaded: FileAudio,
  analysis_completed: Sparkles,
  brain_updated: Brain,
  presentation_updated: PresentationIcon,
};

/** Timeline بصري لدورة حياة الاجتماع الكاملة — الـ 7 مراحل بالترتيب. */
export default function MeetingTimeline({ events }: { events: MeetingLifecycleEvent[] }) {
  const byType = new Map(events.map((e) => [e.event_type, e]));

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {STAGE_ORDER.map((stage, i) => {
        const event = byType.get(stage);
        const Icon = STAGE_ICONS[stage];
        const reached = !!event;
        return (
          <div key={stage} className="flex items-center gap-1.5">
            <div
              title={event?.detail ?? undefined}
              className={`flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-medium ${
                reached
                  ? "border-[var(--v-green)] bg-[var(--v-green)]/10 text-[var(--v-green)]"
                  : "border-[var(--v-border)] text-[var(--v-text-muted)]"
              }`}
            >
              <Icon size={11} /> {STAGE_LABELS[stage]}
            </div>
            {i < STAGE_ORDER.length - 1 && <div className={`h-px w-3 ${reached ? "bg-[var(--v-green)]" : "bg-[var(--v-border)]"}`} />}
          </div>
        );
      })}
    </div>
  );
}
