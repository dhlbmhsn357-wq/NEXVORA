"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getMeetingDetail } from "./meeting-detail-action";
import { retryMeeting } from "./meeting-retry-action";
import { Mic } from "lucide-react";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import MeetingReportPanel from "./meeting-report-panel";
import MeetingSearchPanel from "./meeting-search-panel";
import MeetingUploadButton from "./meeting-upload-button";
import type { Meeting, ProjectBrainEntry, Transcript, MeetingStatus } from "@/lib/types/database";
import type { MeetingReportData } from "@/lib/meetings/report-service";

const statusLabels: Record<MeetingStatus, string> = {
  pending: "في الانتظار",
  transcribing: "جاري التفريغ…",
  transcribed: "تم التفريغ",
  extracting: "جاري الاستخراج…",
  processed: "مكتمل",
  failed: "فشل",
};

const statusTones: Record<MeetingStatus, "neutral" | "warning" | "success" | "danger"> = {
  pending: "neutral",
  transcribing: "warning",
  transcribed: "warning",
  extracting: "warning",
  processed: "success",
  failed: "danger",
};

const inProgressStatuses: MeetingStatus[] = ["pending", "transcribing", "extracting"];

const entryTypeLabels: Record<ProjectBrainEntry["entry_type"], string> = {
  note: "ملاحظة",
  decision: "قرار",
  link: "رابط",
  risk: "مخاطرة",
  question: "سؤال",
  request: "طلب",
  deadline: "موعد نهائي",
};

export default function MeetingsPanel({
  projectId,
  projectCode,
  meetings,
}: {
  projectId: string;
  projectCode: string;
  meetings: Meeting[];
}) {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detailCache, setDetailCache] = useState<
    Record<string, { transcript: Transcript | null; entries: ProjectBrainEntry[]; report: MeetingReportData }>
  >({});
  const [loadingDetail, setLoadingDetail] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [retryError, setRetryError] = useState<Record<string, string>>({});

  async function handleRetry(meetingId: string) {
    setRetryingId(meetingId);
    setRetryError((prev) => ({ ...prev, [meetingId]: "" }));
    const result = await retryMeeting(meetingId, projectId);
    setRetryingId(null);
    if (!result.ok) {
      setRetryError((prev) => ({ ...prev, [meetingId]: result.message ?? "فشلت إعادة المحاولة." }));
      return;
    }
    router.refresh();
  }

  async function handleRefresh() {
    setRefreshing(true);
    router.refresh();
    setTimeout(() => setRefreshing(false), 500);
  }

  async function handleToggle(meetingId: string) {
    if (expandedId === meetingId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(meetingId);
    if (!detailCache[meetingId]) {
      setLoadingDetail(meetingId);
      const detail = await getMeetingDetail(meetingId);
      setDetailCache((prev) => ({ ...prev, [meetingId]: detail }));
      setLoadingDetail(null);
    }
  }

  return (
    <div>
      <div className="mb-4">
        <MeetingSearchPanel projectId={projectId} />
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[var(--v-text)]">اجتماعات المشروع</p>
          <p className="mt-1 text-xs text-[var(--v-text-muted)]">
            كود المشروع لربط التسجيلات:{" "}
            <span className="font-mono-plex font-bold text-[var(--v-primary)]">{projectCode}</span>{" "}
            — ابعت أي تسجيل صوتي للبوت وحط الكود ده في التعليق (Caption)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <MeetingUploadButton projectId={projectId} />
          <Button variant="outline" size="sm" onClick={handleRefresh} loading={refreshing}>
            تحديث
          </Button>
        </div>
      </div>

      {meetings.length === 0 && (
        <EmptyState icon={<Mic size={28} />} title="لا توجد اجتماعات بعد" description="ابعت أول تسجيل صوتي للبوت مع كود المشروع في الـ Caption." />
      )}

      <div className="space-y-2">
        {meetings.map((meeting) => {
          const isExpanded = expandedId === meeting.id;
          const detail = detailCache[meeting.id];
          const isLoading = loadingDetail === meeting.id;

          return (
            <Card key={meeting.id} padding="none">
              <button
                type="button"
                onClick={() => handleToggle(meeting.id)}
                aria-expanded={isExpanded}
                className="flex w-full items-center justify-between p-4 text-right focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--v-primary)]"
              >
                <div>
                  <p className="text-sm font-semibold text-[var(--v-text)]">
                    {meeting.title || "اجتماع بدون عنوان"}
                  </p>
                  <p className="mt-1 text-xs text-[var(--v-text-muted)]">
                    {new Date(meeting.meeting_date).toLocaleString("ar-EG")}
                  </p>
                </div>
                <Badge tone={statusTones[meeting.status]}>
                  {inProgressStatuses.includes(meeting.status) && (
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
                  )}
                  {statusLabels[meeting.status]}
                </Badge>
              </button>

              {isExpanded && (
                <div className="border-t border-[var(--v-border)] p-4">
                  {inProgressStatuses.includes(meeting.status) && (
                    <div className="space-y-2" aria-live="polite">
                      <p className="text-xs text-[var(--v-amber)]">
                        المعالجة لسه جارية — دوس &quot;تحديث&quot; فوق بعد شوية لمتابعة الحالة.
                      </p>
                      <div className="h-3 w-3/4 animate-pulse rounded bg-[var(--v-surface)]" />
                      <div className="h-3 w-1/2 animate-pulse rounded bg-[var(--v-surface)]" />
                    </div>
                  )}

                  {meeting.status === "failed" && (
                    <div className="mb-3 space-y-2">
                      <p className="text-xs font-medium text-[var(--v-red)]">
                        فشلت معالجة هذا الاجتماع.
                      </p>
                      {meeting.error_message && (
                        <p className="rounded-[var(--v-radius-md)] border border-[var(--v-red)]/30 bg-[var(--v-red)]/5 px-2 py-1.5 text-xs text-[var(--v-text-muted)]">
                          {meeting.error_message}
                        </p>
                      )}
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => handleRetry(meeting.id)}
                        loading={retryingId === meeting.id}
                      >
                        إعادة المحاولة
                      </Button>
                      {retryError[meeting.id] && (
                        <p className="text-xs text-[var(--v-red)]">{retryError[meeting.id]}</p>
                      )}
                    </div>
                  )}

                  {isLoading && (
                    <p className="text-xs text-[var(--v-text-muted)]">جاري تحميل التفاصيل…</p>
                  )}

                  {detail && (
                    <div className="space-y-4">
                      <MeetingReportPanel report={detail.report} />

                      {detail.entries.length > 0 && (
                        <div>
                          <p className="mb-2 text-xs font-semibold text-[var(--v-text)]">
                            العناصر المستخرجة
                          </p>
                          <div className="space-y-1.5">
                            {detail.entries.map((entry) => (
                              <div
                                key={entry.id}
                                className="flex items-start gap-2 rounded-[var(--v-radius-md)] bg-[var(--v-surface)] p-2 text-sm"
                              >
                                <span className="rounded bg-[var(--v-bg)] px-1.5 py-0.5 text-[10px] text-[var(--v-text-muted)]">
                                  {entryTypeLabels[entry.entry_type]}
                                </span>
                                <span className="text-[var(--v-text)]">{entry.content}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {detail.transcript && (
                        <div>
                          <p className="mb-2 text-xs font-semibold text-[var(--v-text)]">
                            النص المفرّغ
                          </p>
                          <div className="max-h-64 overflow-y-auto rounded-[var(--v-radius-md)] bg-[var(--v-surface)] p-3 text-sm leading-relaxed text-[var(--v-text-secondary)] whitespace-pre-wrap">
                            {detail.transcript.raw_text}
                          </div>
                        </div>
                      )}

                      {!detail.transcript && meeting.status === "processed" && (
                        <p className="text-xs text-[var(--v-text-muted)]">لا يوجد نص مفرّغ محفوظ.</p>
                      )}

                      <p className="text-[10px] text-[var(--v-text-muted)]">
                        آخر تحديث: {new Date(meeting.updated_at).toLocaleString("ar-EG")}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
