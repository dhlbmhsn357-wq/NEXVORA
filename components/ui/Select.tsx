import type { SelectHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";

type ConflictingHandlers = "onDrag" | "onDragStart" | "onDragEnd" | "onAnimationStart" | "onAnimationEnd" | "onAnimationIteration";

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, ConflictingHandlers> {
  label?: string;
  helperText?: string;
  error?: string;
}

/**
 * القائمة المنسدلة الموحّدة — Select أصلي (يفتح Picker النظام على
 * الموبايل تلقائيًا) بس بمظهر موحّد وسهم Chevron مخصص بدل سهم المتصفح.
 */
export default function Select({ label, helperText, error, id, className = "", children, ...rest }: SelectProps) {
  const inputId = id ?? rest.name;

  return (
    <div className="w-full">
      {label && (
        <label htmlFor={inputId} className="mb-1.5 block text-xs font-medium text-[var(--v-text-secondary)]">
          {label}
        </label>
      )}
      <div className="relative">
        <select
          id={inputId}
          aria-invalid={!!error}
          aria-describedby={error ? `${inputId}-error` : helperText ? `${inputId}-helper` : undefined}
          className={`h-10 w-full appearance-none rounded-[var(--v-radius-md)] border bg-[var(--v-bg)] pe-9 ps-3 text-sm text-[var(--v-text)] outline-none transition-colors focus:border-[var(--v-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--v-primary)] ${
            error ? "border-[var(--v-red)]" : "border-[var(--v-border)]"
          } ${className}`}
          {...rest}
        >
          {children}
        </select>
        <ChevronDown
          size={14}
          className="pointer-events-none absolute top-1/2 end-3 -translate-y-1/2 text-[var(--v-text-muted)]"
        />
      </div>
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
