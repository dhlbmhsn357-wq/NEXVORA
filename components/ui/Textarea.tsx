import type { TextareaHTMLAttributes } from "react";

type ConflictingHandlers = "onDrag" | "onDragStart" | "onDragEnd" | "onAnimationStart" | "onAnimationEnd" | "onAnimationIteration";

export interface TextareaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, ConflictingHandlers> {
  label?: string;
  helperText?: string;
  error?: string;
}

/**
 * حقل النص الطويل الموحّد — نفس منطق Input بس لـ textarea.
 */
export default function Textarea({ label, helperText, error, id, className = "", ...rest }: TextareaProps) {
  const inputId = id ?? rest.name;

  return (
    <div className="w-full">
      {label && (
        <label htmlFor={inputId} className="mb-1.5 block text-xs font-medium text-[var(--v-text-secondary)]">
          {label}
        </label>
      )}
      <textarea
        id={inputId}
        aria-invalid={!!error}
        aria-describedby={error ? `${inputId}-error` : helperText ? `${inputId}-helper` : undefined}
        className={`w-full rounded-[var(--v-radius-md)] border bg-[var(--v-bg)] px-3 py-2 text-sm text-[var(--v-text)] outline-none transition-colors placeholder:text-[var(--v-text-muted)] focus:border-[var(--v-primary)] ${
          error ? "border-[var(--v-red)]" : "border-[var(--v-border)]"
        } ${className}`}
        {...rest}
      />
      {error ? (
        <p id={`${inputId}-error`} className="mt-1.5 text-xs text-[var(--v-red)]">
          {error}
        </p>
      ) : (
        helperText && (
          <p id={`${inputId}-helper`} className="mt-1.5 text-xs text-[var(--v-text-muted)]">
            {helperText}
          </p>
        )
      )}
    </div>
  );
}
