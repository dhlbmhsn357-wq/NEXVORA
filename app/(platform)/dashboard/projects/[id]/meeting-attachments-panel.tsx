"use client";

import { useRef, useState, useTransition } from "react";
import { Paperclip, FileText, Image as ImageIcon, FileSpreadsheet, File as FileIcon, ExternalLink } from "lucide-react";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import EmptyState from "@/components/ui/EmptyState";
import { uploadMeetingAttachmentAction, getMeetingAttachmentUrlAction } from "./meeting-attachments-actions";
import type { MeetingAttachment, MeetingAttachmentAiStatus, MeetingAttachmentFileType } from "@/lib/types/database";

const FILE_ICON: Record<MeetingAttachmentFileType, typeof FileIcon> = {
  image: ImageIcon, pdf: FileText, docx: FileText, xlsx: FileSpreadsheet, csv: FileSpreadsheet, other: FileIcon,
};

const AI_STATUS_TONE: Record<MeetingAttachmentAiStatus, "success" | "warning" | "danger" | "neutral"> = {
  ready: "success", analyzing: "warning", pending: "neutral", failed: "danger", unsupported: "neutral",
};
const AI_STATUS_LABEL: Record<MeetingAttachmentAiStatus, string> = {
  ready: "تم التحليل", analyzing: "جاري التحليل", pending: "في الانتظار", failed: "فشل التحليل", unsupported: "غير مدعوم للتحليل",
};

export default function MeetingAttachmentsPanel({
  projectId,
  meetingId,
  meetingPreparationId,
  attachments,
}: {
  projectId: string;
  meetingId?: string | null;
  meetingPreparationId?: string | null;
  attachments: MeetingAttachment[];
}) {
  const [isPending, startAction] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleUpload() {
    const file = fileInputRef.current?.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.set("projectId", projectId);
    if (meetingId) formData.set("meetingId", meetingId);
    if (meetingPreparationId) formData.set("meetingPreparationId", meetingPreparationId);
    formData.set("title", title);
    formData.set("file", file);

    setError(null);
    startAction(async () => {
      const result = await uploadMeetingAttachmentAction(formData);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      if (fileInputRef.current) fileInputRef.current.value = "";
      setTitle("");
    });
  }

  async function handleOpen(path: string) {
    const result = await getMeetingAttachmentUrlAction(path);
    if (result.ok) window.open(result.url, "_blank", "noopener,noreferrer");
  }

  return (
    <Card padding="md">
      <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--v-text)]">
        <Paperclip size={16} className="text-[var(--v-primary)]" /> المرفقات
      </p>

      <div className="mb-4 flex flex-wrap items-end gap-2 rounded-[var(--v-radius-md)] border border-dashed border-[var(--v-border)] p-3">
        <div className="flex-1 min-w-[160px]">
          <label className="mb-1 block text-[11px] text-[var(--v-text-muted)]">عنوان (اختياري)</label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="مثال: مخطط قاعدة البيانات" />
        </div>
        <input ref={fileInputRef} type="file" className="text-xs text-[var(--v-text-secondary)]" />
        <Button variant="primary" size="sm" onClick={handleUpload} disabled={isPending}>
          رفع
        </Button>
      </div>
      {error && <p className="mb-3 text-xs text-[var(--v-danger)]">{error}</p>}

      {attachments.length === 0 ? (
        <EmptyState title="لا توجد مرفقات بعد" description="صور، PDF، DOCX، أو CSV — الذكاء الاصطناعي بيحللها تلقائيًا بعد الرفع." />
      ) : (
        <div className="space-y-2">
          {attachments.map((a) => {
            const Icon = FILE_ICON[a.file_type];
            return (
              <div key={a.id} className="rounded-[var(--v-radius-md)] border border-[var(--v-border)] p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Icon size={15} className="text-[var(--v-text-muted)]" />
                    <span className="text-sm font-medium text-[var(--v-text)]">{a.title}</span>
                    {a.ai_confidence !== null && (
                      <span className="text-[11px] tabular-nums text-[var(--v-text-muted)]">ثقة {a.ai_confidence}%</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={AI_STATUS_TONE[a.ai_status]}>{AI_STATUS_LABEL[a.ai_status]}</Badge>
                    <button type="button" onClick={() => handleOpen(a.storage_path)} className="text-[var(--v-primary)] hover:underline">
                      <ExternalLink size={14} />
                    </button>
                  </div>
                </div>
                {a.ai_summary && <p className="mt-2 text-xs text-[var(--v-text-secondary)]">{a.ai_summary}</p>}
                {a.last_error && a.ai_status === "failed" && <p className="mt-2 text-xs text-[var(--v-danger)]">{a.last_error}</p>}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
