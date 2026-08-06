import type { InputHTMLAttributes } from "react";

type ConflictingHandlers = "onDrag" | "onDragStart" | "onDragEnd" | "onAnimationStart" | "onAnimationEnd" | "onAnimationIteration";

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, ConflictingHandlers> {
  label?: string;
  helperText?: string;
  error?: string;
}

/**
 * حقل النص الموحّد — Label + Helper/Error text موحّدين، بديل لكل
 * <input className="rounded-... border..."/> المكرر عبر النماذج.
 */
export default function Input({ label, helperText, error, id, className = "", ...rest }: InputProps) {
  const inputId = id ?? rest.name;

  return (
    <div className="w-full">
      {label && (
        <label htmlFor={inputId} className="mb-1.5 block text-xs font-medium text-[var(--v-text-secondary)]">
          {label}
        </label>
      )}
      <input
        id={inputId}
        aria-invalid={!!error}
        aria-describedby={error ? `${inputId}-error` : helperText ? `${inputId}-helper` : undefined}
        className={`h-10 w-full rounded-[var(--v-radius-md)] border bg-[var(--v-bg)] px-3 text-sm text-[var(--v-text)] outline-none transition-colors placeholder:text-[var(--v-text-muted)] focus:border-[var(--v-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--v-primary)] ${
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
