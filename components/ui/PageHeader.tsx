import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/**
 * ترويسة الصفحة الموحّدة (UI/UX Phase 3) — العنصر الجامع اللي بيخلّي كل
 * صفحات المنصة "منتج واحد": عنوان + وصف + منطقة إجراءات + أيقونة اختيارية،
 * بنفس التسلسل الهرمي والمسافات في كل مكان. Server-safe (بدون "use client")
 * عشان يُستخدم في صفحات الخادم مباشرةً. presentation-only.
 */
export default function PageHeader({
  title,
  description,
  icon: Icon,
  actions,
  className = "",
}: {
  title: string;
  description?: string;
  icon?: LucideIcon;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`v-animate-in mb-6 flex flex-wrap items-start justify-between gap-4 ${className}`}>
      <div className="flex min-w-0 items-start gap-3">
        {Icon && (
          <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--v-radius-md)] bg-[var(--v-primary-tint)] text-[var(--v-primary)]">
            <Icon size={20} />
          </span>
        )}
        <div className="min-w-0">
          <h1 className="font-display text-h1 text-[var(--v-text)]">{title}</h1>
          {description && <p className="mt-1 text-body text-[var(--v-text-secondary)]">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
