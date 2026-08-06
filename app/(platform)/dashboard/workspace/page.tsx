import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { listUserTasks } from "@/lib/work/task-service";
import { listUserProjects } from "@/lib/work/project-members-service";
import { isOverdue } from "@/lib/work/task-logic";
import { TASK_STATUS_LABELS, TASK_PRIORITY_LABELS, PROJECT_ROLE_LABELS } from "@/lib/work/statuses";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import { FolderKanban, ListTodo, AlertTriangle, CalendarClock, ListChecks } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";

export const dynamic = "force-dynamic";

export default async function WorkspacePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const [tasks, projects] = await Promise.all([listUserTasks(user.id), listUserProjects(user.id)]);
  const service = createServiceClient();
  const projectNameById = new Map(projects.map((p) => [p.id, p.name]));
  // أسماء مشاريع المهام اللي مش ضمن projects (نادر)
  const missing = [...new Set(tasks.map((t) => t.project_id))].filter((id) => !projectNameById.has(id));
  if (missing.length > 0) {
    const { data } = await service.from("projects").select("id, name").in("id", missing);
    for (const p of (data ?? []) as { id: string; name: string }[]) projectNameById.set(p.id, p.name);
  }

  // Server Component (يُنفَّذ لكل طلب) — Date.now آمن هنا.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const today = new Date().toISOString().slice(0, 10);
  const overdue = tasks.filter((t) => isOverdue(t, now));
  const dueToday = tasks.filter((t) => t.due_date === today);
  const upcoming = tasks.filter((t) => t.due_date && t.due_date > today).slice(0, 10);
  const active = tasks.filter((t) => t.status !== "completed");

  return (
    <div>
      <PageHeader title="مساحتي" icon={ListChecks} description="مشاريعك ومهامك المكلّف بها عبر المنصة." />


      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <StatCard icon={<FolderKanban size={16} />} label="مشاريعي" value={projects.length} />
        <StatCard icon={<ListTodo size={16} />} label="مهام نشطة" value={active.length} />
        <StatCard icon={<AlertTriangle size={16} />} label="متأخرة" value={overdue.length} tone="danger" />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card padding="md">
          <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-[var(--v-text)]"><FolderKanban size={15} /> مشاريعي</p>
          {projects.length === 0 ? <Empty text="مش معيّن على أي مشروع بعد." /> : (
            <div className="space-y-1">
              {projects.map((p) => (
                <Link key={p.id} href={`/dashboard/projects/${p.id}?tab=tasks`} className="flex items-center justify-between rounded-[var(--v-radius-sm)] px-2 py-1.5 text-sm text-[var(--v-text)] hover:bg-[var(--v-surface)]">
                  {p.name} <Badge tone="neutral">{p.project_role === "owner" ? "مالك" : PROJECT_ROLE_LABELS[p.project_role]}</Badge>
                </Link>
              ))}
            </div>
          )}
        </Card>

        <Card padding="md">
          <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-[var(--v-text)]"><AlertTriangle size={15} className="text-[var(--v-red)]" /> متأخرة + اليوم</p>
          {overdue.length === 0 && dueToday.length === 0 ? <Empty text="مفيش مهام متأخرة أو مستحقة اليوم 🎉" /> : (
            <div className="space-y-1">
              {[...overdue, ...dueToday].map((t) => (
                <Link key={t.id} href={`/dashboard/projects/${t.project_id}?tab=tasks`} className="flex items-center justify-between rounded-[var(--v-radius-sm)] px-2 py-1.5 text-xs hover:bg-[var(--v-surface)]">
                  <span className="text-[var(--v-text)]">{t.title}</span>
                  <span className="text-[var(--v-text-muted)]">{projectNameById.get(t.project_id) ?? ""} · {t.due_date}</span>
                </Link>
              ))}
            </div>
          )}
        </Card>

        <Card padding="md" className="lg:col-span-2">
          <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-[var(--v-text)]"><CalendarClock size={15} /> مواعيد قادمة</p>
          {upcoming.length === 0 ? <Empty text="مفيش مواعيد قادمة." /> : (
            <div className="space-y-1">
              {upcoming.map((t) => (
                <Link key={t.id} href={`/dashboard/projects/${t.project_id}?tab=tasks`} className="flex items-center justify-between rounded-[var(--v-radius-sm)] px-2 py-1.5 text-xs hover:bg-[var(--v-surface)]">
                  <span className="text-[var(--v-text)]">{t.title}</span>
                  <span className="flex items-center gap-2 text-[var(--v-text-muted)]">
                    <Badge tone="neutral">{TASK_STATUS_LABELS[t.status]}</Badge>
                    <Badge tone="info">{TASK_PRIORITY_LABELS[t.priority]}</Badge>
                    {t.due_date}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone?: "danger" }) {
  return (
    <Card padding="md">
      <p className="flex items-center gap-1.5 text-xs text-[var(--v-text-muted)]">{icon} {label}</p>
      <p className={`font-display mt-1 text-2xl ${tone === "danger" && value > 0 ? "text-[var(--v-red)]" : "text-[var(--v-text)]"}`}>{value}</p>
    </Card>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="py-4 text-center text-xs text-[var(--v-text-muted)]">{text}</p>;
}
