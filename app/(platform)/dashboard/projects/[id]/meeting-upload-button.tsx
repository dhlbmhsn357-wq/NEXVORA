"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { UploadCloud, Loader2 } from "lucide-react";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import Input from "@/components/ui/Input";
import { toast } from "@/components/ui/Toaster";
import { createClient } from "@/lib/supabase/client";
import { checkRecordingSize, baseMimeType } from "@/lib/meetings/recording-format";
import {
  createMeetingForUploadAction,
  getMeetingRecordingUploadTarget,
  processInAppMeetingRecording,
} from "./meeting-presentation-actions";

function defaultTitle(): string {
  return `اجتماع بتاريخ ${new Date().toLocaleDateString("ar-EG")}`;
}

/**
 * رفع تسجيل اجتماع جاهز (Zoom/موبايل/أي مصدر) مباشرة — بديل مستقل عن
 * تليجرام وعن Live Meeting Mode. الرفع بيتم من المتصفح مباشرة لـ
 * Supabase Storage (مش عبر Server Action)، فمفيش سقف حجم/وقت لطلبات
 * Vercel الـ Serverless.
 */
export default function MeetingUploadButton({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleOpen() {
    setTitle(defaultTitle());
    setFile(null);
    setError(null);
    setOpen(true);
  }

  function handleClose() {
    if (uploading) return; // ما تقفلش نافذة أثناء رفع فعلي
    setOpen(false);
  }

  async function handleSubmit() {
    if (!file) {
      setError("اختر ملف تسجيل الصوت أو الفيديو الأول.");
      return;
    }

    const sizeCheck = checkRecordingSize(file.size);
    if (!sizeCheck.ok) {
      setError(sizeCheck.reason);
      return;
    }

    setError(null);
    setUploading(true);

    try {
      const created = await createMeetingForUploadAction(projectId, title);
      if (!created.ok || !created.meetingId) {
        throw new Error(created.message ?? "تعذّر إنشاء الاجتماع.");
      }
      const meetingId = created.meetingId;

      const target = await getMeetingRecordingUploadTarget(projectId, meetingId);
      if (!target.ok || !target.bucket || !target.path) {
        throw new Error(target.message ?? "تعذّر تجهيز مكان الرفع.");
      }

      const contentType = baseMimeType(file.type || "audio/mpeg");
      const supabase = createClient();
      const { error: uploadError } = await supabase.storage
        .from(target.bucket)
        .upload(target.path, file, { contentType, upsert: true });
      if (uploadError) {
        throw new Error(`فشل رفع الملف: ${uploadError.message}`);
      }

      const started = await processInAppMeetingRecording(projectId, meetingId, target.path, contentType);
      if (!started.ok) {
        throw new Error(started.message ?? "تعذّر بدء المعالجة.");
      }

      toast.success("تم الرفع — جاري التفريغ في الخلفية.");
      setUploading(false);
      setOpen(false);
      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "فشل رفع التسجيل.";
      setError(msg);
      toast.error(msg);
      setUploading(false);
    }
  }

  return (
    <>
      <Button variant="primary" size="sm" onClick={handleOpen}>
        <UploadCloud size={14} /> ارفع تسجيل اجتماع
      </Button>

      <Modal open={open} onClose={handleClose}>
        <div className="space-y-4">
          <div>
            <p className="text-sm font-semibold text-[var(--v-text)]">ارفع تسجيل اجتماع</p>
            <p className="mt-1 text-xs text-[var(--v-text-muted)]">
              ملف صوتي أو فيديو مسجّل مسبقًا (Zoom، موبايل، أو أي مصدر) — هيتفرّغ وتتستخرج منه القرارات والمهام تلقائيًا.
            </p>
          </div>

          <Input
            label="عنوان الاجتماع (اختياري)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={defaultTitle()}
            disabled={uploading}
          />

          <div>
            <label className="mb-1.5 block text-xs font-medium text-[var(--v-text-secondary)]">ملف التسجيل</label>
            <label className="flex cursor-pointer items-center gap-2 rounded-[var(--v-radius-md)] border border-dashed border-[var(--v-border)] px-3 py-3 text-sm text-[var(--v-text-secondary)] transition hover:border-[var(--v-primary)]">
              <UploadCloud size={16} className="shrink-0 text-[var(--v-primary)]" />
              <span className="truncate">{file ? file.name : "اختر ملف صوتي أو فيديو…"}</span>
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*,video/*"
                className="hidden"
                disabled={uploading}
                onChange={(e) => {
                  setFile(e.target.files?.[0] ?? null);
                  setError(null);
                }}
              />
            </label>
          </div>

          {error && <p className="text-xs text-[var(--v-red)]">{error}</p>}

          {uploading && (
            <p className="flex items-center gap-1.5 text-xs text-[var(--v-text-muted)]">
              <Loader2 size={13} className="animate-spin" /> جاري الرفع…
            </p>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={handleClose} disabled={uploading}>
              إلغاء
            </Button>
            <Button variant="primary" size="sm" onClick={handleSubmit} loading={uploading} disabled={!file}>
              رفع وبدء التفريغ
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
