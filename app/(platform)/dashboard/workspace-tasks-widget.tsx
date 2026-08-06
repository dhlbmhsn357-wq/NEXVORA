import Link from "next/link";
import { ListChecks, AlertTriangle } from "lucide-react";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import { createClient } from "@/lib/supabase/server";
import { listWorkspaceTasks } from "@/lib/workspace-tasks/service";
import { isWTaskDone, WTASK_PRIORITY_LABELS, WTASK_PRIORITY_TONE } from "@/lib/workspace-tasks/statuses";
import { isWTaskOverdue } from "@/lib/workspace-tasks/task-logic";

/**
 * Widgets لوحة التحكم: "المهام الخاصة بي" + "المهام المتأخرة" — مكوّن
 * سيرفر مستقل بيجيب مهام المستخدم الحالي المسندة إليه. بيظهر فقط لو عنده
 * مهام (ما يزوّدش ضجيج للي مالوش مهام).
 */
export default async function WorkspaceTasksWidget() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const tasks = await listWorkspaceTasks({ scope: "assigned", userId: user.id });
  if (tasks.length === 0) return null;

  // eslint-disable-next-line react-hooks/purity -- Server Component: يُنفَّذ مرة واحدة على السيرفر
  const nowMs = Date.now();
  const active = tasks.filter((t) => !isWTaskDone(t.status) && t.status !== "cancelled");
  const overdue = active.filter((t) => isWTaskOverdue(t, nowMs));
  const upcoming = active
    .filter((t) => t.due_date)
    .sort((a, b) => new Date(a.due_date!).getTime() - new Date(b.due_date!).getTime())
    .slice(0, 5);

  return (
    <div className="mt-9 grid grid-cols-1 gap-6 lg:grid-cols-2">
      <div>
        <p className="mb-3 flex items-center gap-2 text-xs font-semibold text-[var(--v-text-muted)]">
          <ListChecks size={14} /> المهام الخاصة بي ({active.length})
        </p>
        <div className="space-y-2">
          {upcoming.length === 0 ? (
            <Card padding="md"><p className="text-sm text-[var(--v-text-muted)]">لا مهام قادمة بمواعيد.</p></Card>
          ) : (
            upcoming.map((t) => (
              <Link key={t.id} href={`/dashboard/tasks?task=${t.id}`}>
                <Card padding="md" className="transition hover:border-[var(--v-primary)]">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-medium text-[var(--v-text)]">{t.title}</p>
                    <Badge tone={WTASK_PRIORITY_TONE[t.priority]}>{WTASK_PRIORITY_LABELS[t.priority]}</Badge>
                  </div>
                  <p className="mt-1 text-[11px] text-[var(--v-text-subtle)]">
                    التسليم: {t.due_date ? new Date(t.due_date).toLocaleDateString("ar-EG") : "—"}
                  </p>
                </Card>
              </Link>
            ))
          )}
        </div>
      </div>

      <div>
        <p className="mb-3 flex items-center gap-2 text-xs font-semibold text-[var(--v-text-muted)]">
          <AlertTriangle size={14} className={overdue.length > 0 ? "text-[var(--v-red)]" : ""} /> المهام المتأخرة ({overdue.length})
        </p>
        <div className="space-y-2">
          {overdue.length === 0 ? (
            <Card padding="md"><p className="text-sm text-[var(--v-text-muted)]">لا مهام متأخرة — ممتاز.</p></Card>
          ) : (
            overdue.map((t) => (
              <Link key={t.id} href={`/dashboard/tasks?task=${t.id}`}>
                <Card padding="md" className="border-[var(--v-red)]/30 transition hover:border-[var(--v-red)]">
                  <p className="truncate text-sm font-medium text-[var(--v-text)]">{t.title}</p>
                  <p className="mt-1 text-[11px] text-[var(--v-red)]">
                    متأخرة منذ {t.due_date ? new Date(t.due_date).toLocaleDateString("ar-EG") : ""}
                  </p>
                </Card>
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
