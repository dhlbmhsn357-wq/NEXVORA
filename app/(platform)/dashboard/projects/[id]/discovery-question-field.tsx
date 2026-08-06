"use client";

import { useState } from "react";
import { Star, Upload, FileText, X, Download } from "lucide-react";
import { toast } from "@/components/ui/Toaster";
import {
  uploadDiscoveryFileAction,
  getDiscoveryFileUrlAction,
} from "./discovery-upload-action";
import { DEFAULT_UPLOAD_ACCEPT, DEFAULT_MAX_FILE_MB } from "@/lib/discovery-templates/field-types";
import type { DiscoveryQuestion, DiscoveryUploadedFile } from "@/lib/types/database";

const inputClass =
  "w-full rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-bg)] px-3 py-2 text-sm text-[var(--v-text)] outline-none focus:border-[var(--v-primary)] disabled:opacity-60";

export default function DiscoveryQuestionField({
  projectId,
  question,
  value,
  onChange,
  disabled,
  error,
}: {
  projectId: string;
  question: DiscoveryQuestion;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled: boolean;
  error?: string;
}) {
  const maxLength = question.validation?.maxLength;

  function renderControl() {
    switch (question.type) {
      case "long_text":
        return (
          <textarea
            value={(value as string) ?? ""}
            onChange={(e) => onChange(e.target.value)}
            rows={3}
            maxLength={maxLength}
            placeholder={question.placeholder ?? ""}
            disabled={disabled}
            className={inputClass}
          />
        );

      case "short_text":
        return (
          <input
            value={(value as string) ?? ""}
            onChange={(e) => onChange(e.target.value)}
            maxLength={maxLength}
            placeholder={question.placeholder ?? ""}
            disabled={disabled}
            className={inputClass}
          />
        );

      case "number":
        return (
          <input
            type="number"
            value={(value as number | string) ?? ""}
            onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
            placeholder={question.placeholder ?? ""}
            disabled={disabled}
            className={inputClass}
          />
        );

      case "website":
        return (
          <input
            type="url"
            dir="ltr"
            value={(value as string) ?? ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder={question.placeholder ?? "https://"}
            disabled={disabled}
            className={inputClass}
          />
        );

      case "email":
        return (
          <input
            type="email"
            dir="ltr"
            value={(value as string) ?? ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder={question.placeholder ?? "name@example.com"}
            disabled={disabled}
            className={inputClass}
          />
        );

      case "phone":
        return (
          <input
            type="tel"
            dir="ltr"
            value={(value as string) ?? ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder={question.placeholder ?? ""}
            disabled={disabled}
            className={inputClass}
          />
        );

      case "date":
        return (
          <input
            type="date"
            value={(value as string) ?? ""}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            className={inputClass}
          />
        );

      case "yes_no":
        return (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onChange(true)}
              disabled={disabled}
              className={`rounded-[var(--v-radius-md)] border px-4 py-1.5 text-xs disabled:opacity-60 ${
                value === true
                  ? "border-[var(--v-green)] bg-[var(--v-green)]/10 text-[var(--v-green)]"
                  : "border-[var(--v-border)] text-[var(--v-text-muted)]"
              }`}
            >
              نعم
            </button>
            <button
              type="button"
              onClick={() => onChange(false)}
              disabled={disabled}
              className={`rounded-[var(--v-radius-md)] border px-4 py-1.5 text-xs disabled:opacity-60 ${
                value === false
                  ? "border-[var(--v-red)] bg-[var(--v-red)]/10 text-[var(--v-red)]"
                  : "border-[var(--v-border)] text-[var(--v-text-muted)]"
              }`}
            >
              لا
            </button>
          </div>
        );

      case "multiple_choice":
        return (
          <div className="flex flex-wrap gap-2">
            {question.options.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => onChange(opt)}
                disabled={disabled}
                className={`rounded-[var(--v-radius-md)] border px-3 py-1.5 text-xs disabled:opacity-60 ${
                  value === opt
                    ? "border-[var(--v-primary)] bg-[var(--v-primary-tint)] text-[var(--v-primary)]"
                    : "border-[var(--v-border)] text-[var(--v-text-muted)] hover:border-[var(--v-primary)]"
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
        );

      case "checkbox": {
        const selected = Array.isArray(value) ? (value as string[]) : [];
        return (
          <div className="flex flex-wrap gap-2">
            {question.options.map((opt) => {
              const on = selected.includes(opt);
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() =>
                    onChange(on ? selected.filter((s) => s !== opt) : [...selected, opt])
                  }
                  disabled={disabled}
                  className={`rounded-[var(--v-radius-md)] border px-3 py-1.5 text-xs disabled:opacity-60 ${
                    on
                      ? "border-[var(--v-primary)] bg-[var(--v-primary-tint)] text-[var(--v-primary)]"
                      : "border-[var(--v-border)] text-[var(--v-text-muted)] hover:border-[var(--v-primary)]"
                  }`}
                >
                  {opt}
                </button>
              );
            })}
          </div>
        );
      }

      case "rating": {
        const rating = Number(value) || 0;
        return (
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => onChange(n)}
                disabled={disabled}
                aria-label={`${n} من 5`}
                className="disabled:opacity-60"
              >
                <Star
                  size={22}
                  className={
                    n <= rating
                      ? "fill-[var(--v-amber)] text-[var(--v-amber)]"
                      : "text-[var(--v-text-subtle)]"
                  }
                />
              </button>
            ))}
          </div>
        );
      }

      case "file_upload":
      case "logo_upload":
      case "document_upload":
        return (
          <FileUploadControl
            projectId={projectId}
            question={question}
            value={value as DiscoveryUploadedFile | null}
            onChange={onChange}
            disabled={disabled}
          />
        );

      default:
        return null;
    }
  }

  const currentLen =
    typeof value === "string" && (question.type === "short_text" || question.type === "long_text")
      ? value.length
      : null;

  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-[var(--v-text)]">
        {question.question}
        {question.required && <span className="text-[var(--v-red)]"> *</span>}
      </label>
      {question.description && (
        <p className="mb-1.5 text-xs text-[var(--v-text-muted)]">{question.description}</p>
      )}
      {renderControl()}
      <div className="mt-1 flex items-center justify-between gap-2">
        <div>
          {error && <p className="text-xs text-[var(--v-red)]">{error}</p>}
          {question.help_text && !error && (
            <p className="text-xs text-[var(--v-text-subtle)]">{question.help_text}</p>
          )}
        </div>
        {maxLength && currentLen !== null && (
          <span className="shrink-0 font-mono-plex text-[10px] text-[var(--v-text-subtle)]">
            {currentLen}/{maxLength}
          </span>
        )}
      </div>
    </div>
  );
}

function FileUploadControl({
  projectId,
  question,
  value,
  onChange,
  disabled,
}: {
  projectId: string;
  question: DiscoveryQuestion;
  value: DiscoveryUploadedFile | null;
  onChange: (value: unknown) => void;
  disabled: boolean;
}) {
  const [uploading, setUploading] = useState(false);
  const allowed =
    question.validation?.allowedFileTypes && question.validation.allowedFileTypes.length > 0
      ? question.validation.allowedFileTypes
      : DEFAULT_UPLOAD_ACCEPT[question.type] ?? [];
  const maxMb = question.validation?.maxFileSizeMb ?? DEFAULT_MAX_FILE_MB;
  const accept = allowed.map((e) => `.${e}`).join(",");

  async function handleFile(file: File) {
    setUploading(true);
    const fd = new FormData();
    fd.set("projectId", projectId);
    fd.set("questionId", question.id);
    fd.set("file", file);
    fd.set("allowedTypes", allowed.join(","));
    fd.set("maxMb", String(maxMb));
    const result = await uploadDiscoveryFileAction(fd);
    setUploading(false);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    onChange(result.file);
    toast.success("تم رفع الملف");
  }

  async function handleDownload() {
    if (!value) return;
    const result = await getDiscoveryFileUrlAction(value.path);
    if (result.ok) window.open(result.url, "_blank");
    else toast.error("تعذّر فتح الملف");
  }

  if (value) {
    return (
      <div className="flex items-center gap-2 rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-surface)] px-3 py-2">
        <FileText size={16} className="shrink-0 text-[var(--v-text-muted)]" />
        <span className="flex-1 truncate text-xs text-[var(--v-text)]">{value.name}</span>
        <button
          type="button"
          onClick={handleDownload}
          className="text-[var(--v-text-muted)] hover:text-[var(--v-primary)]"
          aria-label="تنزيل"
        >
          <Download size={15} />
        </button>
        {!disabled && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-[var(--v-text-muted)] hover:text-[var(--v-red)]"
            aria-label="إزالة"
          >
            <X size={15} />
          </button>
        )}
      </div>
    );
  }

  return (
    <label
      className={`flex cursor-pointer items-center justify-center gap-2 rounded-[var(--v-radius-md)] border border-dashed border-[var(--v-border-strong)] px-3 py-3 text-xs text-[var(--v-text-muted)] transition hover:border-[var(--v-primary)] ${
        disabled || uploading ? "pointer-events-none opacity-60" : ""
      }`}
    >
      <Upload size={15} />
      {uploading ? "جاري الرفع…" : "اختر ملفًا للرفع"}
      <input
        type="file"
        accept={accept || undefined}
        disabled={disabled || uploading}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = "";
        }}
      />
    </label>
  );
}
