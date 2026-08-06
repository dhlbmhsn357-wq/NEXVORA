"use client";

import { useState } from "react";
import { Star, UploadCloud, FileText, X, Download, Check } from "lucide-react";
import {
  getQuestionTypeMeta,
  DEFAULT_UPLOAD_ACCEPT,
  DEFAULT_MAX_FILE_MB,
} from "@/lib/discovery-templates/field-types";
import type { DiscoveryQuestion, DiscoveryUploadedFile } from "@/lib/types/database";

const fieldClass =
  "w-full rounded-[var(--v-radius-md)] border border-[var(--v-border-strong)] bg-[var(--v-bg)] px-4 py-3 text-base text-[var(--v-text)] outline-none transition focus:border-[var(--v-primary)] focus:ring-2 focus:ring-[var(--v-primary)]/15";

export default function PortalQuestionField({
  token,
  question,
  value,
  onChange,
}: {
  token: string;
  question: DiscoveryQuestion;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  switch (question.type) {
    case "long_text":
      return (
        <textarea
          autoFocus
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          rows={5}
          maxLength={question.validation?.maxLength}
          placeholder={question.placeholder ?? "اكتب إجابتك هنا…"}
          className={fieldClass}
          aria-label={question.question}
        />
      );

    case "short_text":
      return (
        <input
          autoFocus
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          maxLength={question.validation?.maxLength}
          placeholder={question.placeholder ?? ""}
          className={fieldClass}
          aria-label={question.question}
        />
      );

    case "number":
      return (
        <input
          autoFocus
          type="number"
          value={(value as number | string) ?? ""}
          onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
          placeholder={question.placeholder ?? ""}
          className={fieldClass}
          aria-label={question.question}
        />
      );

    case "website":
      return (
        <input
          autoFocus
          type="url"
          dir="ltr"
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={question.placeholder ?? "https://"}
          className={fieldClass}
          aria-label={question.question}
        />
      );

    case "email":
      return (
        <input
          autoFocus
          type="email"
          dir="ltr"
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={question.placeholder ?? "name@example.com"}
          className={fieldClass}
          aria-label={question.question}
        />
      );

    case "phone":
      return (
        <input
          autoFocus
          type="tel"
          dir="ltr"
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={question.placeholder ?? ""}
          className={fieldClass}
          aria-label={question.question}
        />
      );

    case "date":
      return (
        <input
          autoFocus
          type="date"
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          className={fieldClass}
          aria-label={question.question}
        />
      );

    case "time":
      return (
        <input
          autoFocus
          type="time"
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          className={fieldClass}
          aria-label={question.question}
        />
      );

    case "currency":
      return (
        <div className="relative">
          <input
            autoFocus
            type="number"
            inputMode="decimal"
            value={(value as number | string) ?? ""}
            onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
            placeholder={question.placeholder ?? "0"}
            className={`${fieldClass} pl-14`}
            aria-label={question.question}
          />
          <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-sm text-[var(--v-text-muted)]">
            المبلغ
          </span>
        </div>
      );

    case "yes_no":
      return (
        <div className="flex gap-3">
          {[
            { v: true, label: "نعم" },
            { v: false, label: "لا" },
          ].map((opt) => {
            const active = value === opt.v;
            return (
              <button
                key={opt.label}
                type="button"
                onClick={() => onChange(opt.v)}
                aria-pressed={active}
                className={`flex-1 rounded-[var(--v-radius-lg)] border px-4 py-4 text-base font-medium transition ${
                  active
                    ? "border-[var(--v-primary)] bg-[var(--v-primary-tint)] text-[var(--v-primary)] shadow-[var(--v-shadow-sm)]"
                    : "border-[var(--v-border-strong)] text-[var(--v-text-secondary)] hover:border-[var(--v-primary)]"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      );

    case "multiple_choice":
      return (
        <div className="grid gap-2.5 sm:grid-cols-2">
          {question.options.map((opt) => {
            const active = value === opt;
            return (
              <button
                key={opt}
                type="button"
                onClick={() => onChange(opt)}
                aria-pressed={active}
                className={`flex items-center justify-between gap-2 rounded-[var(--v-radius-lg)] border px-4 py-3.5 text-start text-base transition ${
                  active
                    ? "border-[var(--v-primary)] bg-[var(--v-primary-tint)] text-[var(--v-primary)] shadow-[var(--v-shadow-sm)]"
                    : "border-[var(--v-border-strong)] text-[var(--v-text-secondary)] hover:border-[var(--v-primary)]"
                }`}
              >
                <span>{opt}</span>
                {active && <Check size={18} className="shrink-0" />}
              </button>
            );
          })}
        </div>
      );

    case "checkbox":
    case "multi_select": {
      const selected = Array.isArray(value) ? (value as string[]) : [];
      return (
        <div className="grid gap-2.5 sm:grid-cols-2">
          {question.options.map((opt) => {
            const on = selected.includes(opt);
            return (
              <button
                key={opt}
                type="button"
                onClick={() =>
                  onChange(on ? selected.filter((s) => s !== opt) : [...selected, opt])
                }
                aria-pressed={on}
                className={`flex items-center justify-between gap-2 rounded-[var(--v-radius-lg)] border px-4 py-3.5 text-start text-base transition ${
                  on
                    ? "border-[var(--v-primary)] bg-[var(--v-primary-tint)] text-[var(--v-primary)] shadow-[var(--v-shadow-sm)]"
                    : "border-[var(--v-border-strong)] text-[var(--v-text-secondary)] hover:border-[var(--v-primary)]"
                }`}
              >
                <span>{opt}</span>
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-[6px] border ${
                    on ? "border-[var(--v-primary)] bg-[var(--v-primary)] text-white" : "border-[var(--v-border-strong)]"
                  }`}
                >
                  {on && <Check size={13} />}
                </span>
              </button>
            );
          })}
        </div>
      );
    }

    case "rating": {
      const rating = Number(value) || 0;
      return (
        <div className="flex items-center gap-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => onChange(n)}
              aria-label={`${n} من 5`}
              className="transition hover:scale-110"
            >
              <Star
                size={34}
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
        <PortalFileUpload
          token={token}
          question={question}
          value={value as DiscoveryUploadedFile | null}
          onChange={onChange}
        />
      );

    default:
      return null;
  }
}

function PortalFileUpload({
  token,
  question,
  value,
  onChange,
}: {
  token: string;
  question: DiscoveryQuestion;
  value: DiscoveryUploadedFile | null;
  onChange: (value: unknown) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const meta = getQuestionTypeMeta(question.type);
  const allowed =
    question.validation?.allowedFileTypes && question.validation.allowedFileTypes.length > 0
      ? question.validation.allowedFileTypes
      : DEFAULT_UPLOAD_ACCEPT[question.type] ?? [];
  const maxMb = question.validation?.maxFileSizeMb ?? DEFAULT_MAX_FILE_MB;
  const accept = allowed.map((e) => `.${e}`).join(",");

  async function handleFile(file: File) {
    setUploading(true);
    setUploadError("");
    const fd = new FormData();
    fd.set("questionId", question.id);
    fd.set("file", file);
    try {
      const res = await fetch(`/api/discovery/${token}/upload`, { method: "POST", body: fd });
      const data = await res.json();
      if (!data.ok) {
        setUploadError(data.error ?? "فشل رفع الملف.");
        return;
      }
      onChange(data.file);
    } catch {
      setUploadError("تعذّر الاتصال، حاول مرة أخرى.");
    } finally {
      setUploading(false);
    }
  }

  async function handleDownload() {
    if (!value) return;
    try {
      const res = await fetch(`/api/discovery/${token}/file-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: value.path }),
      });
      const data = await res.json();
      if (data.ok) window.open(data.url, "_blank");
    } catch {
      /* تجاهل */
    }
  }

  if (value) {
    return (
      <div className="flex items-center gap-3 rounded-[var(--v-radius-lg)] border border-[var(--v-border-strong)] bg-[var(--v-surface)] px-4 py-3.5">
        <FileText size={20} className="shrink-0 text-[var(--v-primary)]" />
        <span className="flex-1 truncate text-sm text-[var(--v-text)]">{value.name}</span>
        <button
          type="button"
          onClick={handleDownload}
          className="text-[var(--v-text-muted)] hover:text-[var(--v-primary)]"
          aria-label="تنزيل"
        >
          <Download size={18} />
        </button>
        <button
          type="button"
          onClick={() => onChange(null)}
          className="text-[var(--v-text-muted)] hover:text-[var(--v-red)]"
          aria-label="إزالة"
        >
          <X size={18} />
        </button>
      </div>
    );
  }

  return (
    <div>
      <label
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-[var(--v-radius-lg)] border-2 border-dashed border-[var(--v-border-strong)] px-4 py-8 text-center transition hover:border-[var(--v-primary)] ${
          uploading ? "pointer-events-none opacity-60" : ""
        }`}
      >
        <UploadCloud size={28} className="text-[var(--v-text-muted)]" />
        <span className="text-sm font-medium text-[var(--v-text-secondary)]">
          {uploading ? "جاري الرفع…" : meta.label}
        </span>
        <span className="text-xs text-[var(--v-text-subtle)]">
          {allowed.length > 0 ? allowed.join("، ") : "أي نوع"} · حتى {maxMb} ميجا
        </span>
        <input
          type="file"
          accept={accept || undefined}
          disabled={uploading}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.target.value = "";
          }}
        />
      </label>
      {uploadError && <p className="mt-1.5 text-sm text-[var(--v-red)]">{uploadError}</p>}
    </div>
  );
}
