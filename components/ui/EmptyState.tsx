import type { ReactNode } from "react";
import { Inbox } from "lucide-react";
import Button from "./Button";

/**
 * حالة فارغة موحّدة — أيقونة + عنوان + وصف + إجراء أساسي/ثانوي
 * اختياريين. بديل لكل "p فاضي بجملة واحدة" المنتشر في اللوحات.
 */
export default function EmptyState({
  icon = <Inbox size={28} />,
  title,
  description,
  primaryAction,
  secondaryAction,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  primaryAction?: { label: string; onClick: () => void; loading?: boolean };
  secondaryAction?: { label: string; onClick: () => void };
}) {
  return (
    <div className="rounded-[var(--v-radius-lg)] border border-dashed border-[var(--v-border)] p-8 text-center">
      <div
        className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--v-surface)] text-[var(--v-text-muted)]"
        aria-hidden="true"
      >
        {icon}
      </div>
      <p className="text-sm font-semibold text-[var(--v-text)]">{title}</p>
      {description && <p className="mt-1 text-xs text-[var(--v-text-muted)]">{description}</p>}
      {(primaryAction || secondaryAction) && (
        <div className="mt-4 flex justify-center gap-2">
          {secondaryAction && (
            <Button variant="outline" size="sm" onClick={secondaryAction.onClick}>
              {secondaryAction.label}
            </Button>
          )}
          {primaryAction && (
            <Button variant="primary" size="sm" onClick={primaryAction.onClick} loading={primaryAction.loading}>
              {primaryAction.label}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
