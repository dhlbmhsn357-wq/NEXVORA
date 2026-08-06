"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, LayoutGrid, List, Table2, Loader2, Sparkles, X, Trash2, GitBranch, Clock, AlertTriangle } from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Badge, { type BadgeTone } from "@/components/ui/Badge";
import Avatar from "@/components/ui/Avatar";
import { toast } from "@/components/ui/Toaster";
import {
  TASK_STATUS_LABELS, KANBAN_COLUMNS, TASK_PRIORITIES, TASK_PRIORITY_LABELS, PRIORITY_ORDER, COMMON_TASK_TYPES,
} from "@/lib/work/statuses";
import { isOverdue } from "@/lib/work/task-logic";
import { useRealtimeTasks } from "@/lib/work/use-realtime-tasks";
import {
  loadTasksAction, createTaskAction, changeTaskStatusAction, updateTaskAction, setTaskAssigneesAction,
  deleteTaskAction, addDependencyAction, analyzeTaskAction, addTaskCommentAction, loadTaskCommentsAction,
} from "./task-actions";
import type { TaskWithMeta } from "@/lib/work/task-service";
import type { TaskStatus, TaskPriority, Milestone, UserRole } from "@/lib/types/database";
import { canAssignTask, canDeleteTask } from "@/lib/work/permissions";

const PRIORITY_TONE: Record<TaskPriority, BadgeTone> = { critical: "danger", high: "warning", medium: "info", low: "neutral", optional: "neutral" };

interface Props {
  projectId: string;
  currentUserId: string;
  role: UserRole;
  members: { user_id: string; name: string }[];
  milestones: Milestone[];
}

type View = "kanban" | "list" | "table";

export default function WorkPanel({ projectId, currentUserId, role, members, milestones }: Props) {
  const [tasks, setTasks] = useState<TaskWithMeta[]>([]);
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(0);
  const [view, setView] = useState<View>("kanban");
  const [showCreate, setShowCreate] = useState(false);
  const [openTask, setOpenTask] = useState<TaskWithMeta | null>(null);
  const [filterMine, setFilterMine] = useState(false);

  const reload = useCallback(async () => {
    const r = await loadTasksAction(projectId);
    if (r.ok) { setTasks(r.tasks); setProgress(r.progress); }
    setLoading(false);
  }, [projectId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { reload(); }, [reload]);
  useRealtimeTasks(projectId, reload);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  const topLevel = useMemo(() => {
    let list = tasks.filter((t) => !t.parent_task_id);
    if (filterMine) list = list.filter((t) => t.assignees.some((x) => x.user_id === currentUserId));
    return list.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
  }, [tasks, filterMine, currentUserId]);

  return (
    <Card padding="md">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <ViewBtn active={view === "kanban"} onClick={() => setView("kanban")} icon={<LayoutGrid size={14} />} label="كانبان" />
          <ViewBtn active={view === "list"} onClick={() => setView("list")} icon={<List size={14} />} label="قائمة" />
          <ViewBtn active={view === "table"} onClick={() => setView("table")} icon={<Table2 size={14} />} label="جدول" />
          <label className="mr-2 flex items-center gap-1 text-xs text-[var(--v-text-secondary)]">
            <input type="checkbox" checked={filterMine} onChange={(e) => setFilterMine(e.target.checked)} /> مهامي فقط
          </label>
        </div>
        <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={() => setShowCreate(true)}>مهمة جديدة</Button>
      </div>

      {loading ? (
        <p className="py-8 text-center text-xs text-[var(--v-text-muted)]"><Loader2 size={14} className="inline animate-spin" /> جاري التحميل…</p>
      ) : topLevel.length === 0 ? (
        <p className="py-8 text-center text-xs text-[var(--v-text-muted)]">مفيش مهام بعد — اضغط «مهمة جديدة».</p>
      ) : view === "kanban" ? (
        <KanbanView tasks={topLevel} progress={progress} now={now} onOpen={setOpenTask} />
      ) : view === "list" ? (
        <ListView tasks={topLevel} progress={progress} now={now} onOpen={setOpenTask} />
      ) : (
        <TableView tasks={topLevel} progress={progress} now={now} onOpen={setOpenTask} />
      )}

      {showCreate && (
        <CreateTaskModal projectId={projectId} milestones={milestones} members={members} canAssign={canAssignTask(role)} onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); reload(); }} />
      )}
      {openTask && (
        <TaskDetailDrawer
          key={openTask.id}
          projectId={projectId}
          task={tasks.find((t) => t.id === openTask.id) ?? openTask}
          subtasks={tasks.filter((t) => t.parent_task_id === openTask.id)}
          allTasks={tasks}
          members={members}
          role={role}
          onClose={() => setOpenTask(null)}
          onChanged={reload}
        />
      )}
    </Card>
  );
}

function ViewBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button type="button" onClick={onClick} className={`flex items-center gap-1 rounded-[var(--v-radius-sm)] px-2 py-1 text-xs ${active ? "bg-[var(--v-primary)]/10 text-[var(--v-primary)]" : "text-[var(--v-text-muted)] hover:bg-[var(--v-surface)]"}`}>
      {icon} {label}
    </button>
  );
}

function TaskCardMini({ task, prog, now, onOpen }: { task: TaskWithMeta; prog: number; now: number; onOpen: () => void }) {
  const overdue = isOverdue(task, now);
  return (
    <button type="button" onClick={onOpen} className="block w-full rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-bg)] p-2 text-right hover:border-[var(--v-primary)]">
      <div className="flex items-start justify-between gap-1">
        <p className="text-xs font-medium text-[var(--v-text)] line-clamp-2">{task.title}</p>
        <Badge tone={PRIORITY_TONE[task.priority]}>{TASK_PRIORITY_LABELS[task.priority]}</Badge>
      </div>
      <div className="mt-1.5 flex items-center justify-between">
        <div className="flex -space-x-1">
          {task.assignees.slice(0, 3).map((x) => <Avatar key={x.user_id} name={x.name} size={18} />)}
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-[var(--v-text-muted)]">
          {task.dependency_ids.length > 0 && <GitBranch size={10} />}
          {task.due_date && <span className={overdue ? "text-[var(--v-red)]" : ""}><Clock size={10} className="inline" /> {task.due_date}</span>}
          <span>{prog}%</span>
        </div>
      </div>
    </button>
  );
}

function KanbanView({ tasks, progress, now, onOpen }: { tasks: TaskWithMeta[]; progress: Record<string, number>; now: number; onOpen: (t: TaskWithMeta) => void }) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-2">
      {KANBAN_COLUMNS.map((col) => {
        const colTasks = tasks.filter((t) => t.status === col);
        return (
          <div key={col} className="w-56 shrink-0">
            <p className="mb-1.5 flex items-center justify-between px-1 text-[11px] font-semibold text-[var(--v-text-secondary)]">
              {TASK_STATUS_LABELS[col]} <span className="text-[var(--v-text-muted)]">{colTasks.length}</span>
            </p>
            <div className="space-y-1.5">
              {colTasks.map((t) => <TaskCardMini key={t.id} task={t} prog={progress[t.id] ?? 0} now={now} onOpen={() => onOpen(t)} />)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ListView({ tasks, progress, now, onOpen }: { tasks: TaskWithMeta[]; progress: Record<string, number>; now: number; onOpen: (t: TaskWithMeta) => void }) {
  return (
    <div className="space-y-1.5">
      {tasks.map((t) => {
        const overdue = isOverdue(t, now);
        return (
          <button key={t.id} type="button" onClick={() => onOpen(t)} className="flex w-full items-center justify-between gap-2 rounded-[var(--v-radius-md)] border border-[var(--v-border)] p-2 text-right hover:border-[var(--v-primary)]">
            <div className="flex items-center gap-2">
              {overdue && <AlertTriangle size={13} className="text-[var(--v-red)]" />}
              <span className="text-sm text-[var(--v-text)]">{t.title}</span>
              <Badge tone={PRIORITY_TONE[t.priority]}>{TASK_PRIORITY_LABELS[t.priority]}</Badge>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-[var(--v-text-muted)]">
              <Badge tone="neutral">{TASK_STATUS_LABELS[t.status]}</Badge>
              <span>{progress[t.id] ?? 0}%</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function TableView({ tasks, progress, now, onOpen }: { tasks: TaskWithMeta[]; progress: Record<string, number>; now: number; onOpen: (t: TaskWithMeta) => void }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-right text-xs">
        <thead>
          <tr className="border-b border-[var(--v-border)] text-[var(--v-text-muted)]">
            <th className="p-2">المهمة</th><th className="p-2">الحالة</th><th className="p-2">الأولوية</th><th className="p-2">المكلّفون</th><th className="p-2">الاستحقاق</th><th className="p-2">التقدّم</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((t) => (
            <tr key={t.id} onClick={() => onOpen(t)} className="cursor-pointer border-b border-[var(--v-border)] hover:bg-[var(--v-surface)]">
              <td className="p-2 text-[var(--v-text)]">{t.title}</td>
              <td className="p-2">{TASK_STATUS_LABELS[t.status]}</td>
              <td className="p-2"><Badge tone={PRIORITY_TONE[t.priority]}>{TASK_PRIORITY_LABELS[t.priority]}</Badge></td>
              <td className="p-2">{t.assignees.map((x) => x.name).join("، ") || "—"}</td>
              <td className={`p-2 ${isOverdue(t, now) ? "text-[var(--v-red)]" : "text-[var(--v-text-muted)]"}`}>{t.due_date ?? "—"}</td>
              <td className="p-2">{progress[t.id] ?? 0}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CreateTaskModal({ projectId, milestones, members, canAssign, onClose, onCreated }: {
  projectId: string; milestones: Milestone[]; members: { user_id: string; name: string }[]; canAssign: boolean; onClose: () => void; onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [taskType, setTaskType] = useState<string>("development");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [milestoneId, setMilestoneId] = useState<string>("");
  const [dueDate, setDueDate] = useState("");
  const [assignee, setAssignee] = useState<string>("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!title.trim()) return;
    setSaving(true);
    const r = await createTaskAction({
      projectId, title, description, taskType, priority,
      milestoneId: milestoneId || null, dueDate: dueDate || null,
      assigneeIds: assignee ? [assignee] : [],
    });
    setSaving(false);
    if (!r.ok) return toast.error(r.message ?? "فشل الإنشاء.");
    toast.success("تم إنشاء المهمة.");
    onCreated();
  }

  return (
    <Overlay onClose={onClose} title="مهمة جديدة">
      <div className="space-y-2">
        <Input placeholder="عنوان المهمة" value={title} onChange={(e) => setTitle(e.target.value)} />
        <textarea placeholder="الوصف (اختياري)" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="w-full rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-bg)] px-3 py-2 text-sm" />
        <div className="grid grid-cols-2 gap-2">
          <Select label="النوع" value={taskType} onChange={setTaskType} options={COMMON_TASK_TYPES.map((t) => ({ value: t, label: t }))} />
          <Select label="الأولوية" value={priority} onChange={(v) => setPriority(v as TaskPriority)} options={TASK_PRIORITIES.map((p) => ({ value: p, label: TASK_PRIORITY_LABELS[p] }))} />
          <Select label="المرحلة" value={milestoneId} onChange={setMilestoneId} options={[{ value: "", label: "— بدون —" }, ...milestones.map((m) => ({ value: m.id, label: m.title }))]} />
          <div>
            <label className="text-[10px] text-[var(--v-text-muted)]">الاستحقاق</label>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="w-full rounded-[var(--v-radius-sm)] border border-[var(--v-border)] bg-[var(--v-bg)] px-2 py-1.5 text-sm" />
          </div>
          {canAssign && (
            <Select label="المكلّف" value={assignee} onChange={setAssignee} options={[{ value: "", label: "— بدون —" }, ...members.map((m) => ({ value: m.user_id, label: m.name }))]} />
          )}
        </div>
        <Button variant="primary" size="sm" className="w-full" loading={saving} onClick={submit}>إنشاء</Button>
      </div>
    </Overlay>
  );
}

function TaskDetailDrawer({ projectId, task, subtasks, allTasks, members, role, onClose, onChanged }: {
  projectId: string; task: TaskWithMeta; subtasks: TaskWithMeta[]; allTasks: TaskWithMeta[]; members: { user_id: string; name: string }[]; role: UserRole;
  onClose: () => void; onChanged: () => void;
}) {
  const [comments, setComments] = useState<{ id: string; body: string; author_name: string | null; created_at: string }[]>([]);
  const [newComment, setNewComment] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiResult, setAiResult] = useState<{ subtasks: string[]; estimate: { complexity: string; effort_hours: number; risk: string; rationale: string } | null } | null>(null);

  const loadComments = useCallback(async () => {
    const r = await loadTaskCommentsAction(task.id);
    if (r.ok) setComments(r.comments);
  }, [task.id]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadComments(); }, [loadComments]);

  async function setStatus(s: TaskStatus) {
    const r = await changeTaskStatusAction(task.id, projectId, s);
    if (!r.ok) return toast.error(r.message ?? "فشل.");
    onChanged();
  }
  async function runAi() {
    setAiBusy(true);
    const r = await analyzeTaskAction(projectId, task.title, task.description ?? "");
    setAiBusy(false);
    if (!r.ok || !r.result) return toast.error(r.message ?? "فشل التحليل.");
    setAiResult(r.result);
    if (r.result.estimate) await updateTaskAction(task.id, projectId, { estimated_hours: r.result.estimate.effort_hours });
  }
  async function addSubtaskFromAi(title: string) {
    const r = await createTaskAction({ projectId, title, parentTaskId: task.id, priority: "medium" });
    if (r.ok) { toast.success("اتضافت مهمة فرعية."); onChanged(); }
  }
  async function comment() {
    if (!newComment.trim()) return;
    const r = await addTaskCommentAction(task.id, projectId, newComment);
    if (!r.ok) return toast.error(r.message ?? "فشل.");
    setNewComment(""); loadComments();
  }
  async function assign(userId: string) {
    const current = task.assignees.map((x) => x.user_id);
    const next = current.includes(userId) ? current.filter((x) => x !== userId) : [...current, userId];
    const r = await setTaskAssigneesAction(task.id, projectId, next);
    if (!r.ok) return toast.error(r.message ?? "فشل.");
    onChanged();
  }
  async function remove() {
    if (!window.confirm("حذف المهمة؟")) return;
    const r = await deleteTaskAction(task.id, projectId);
    if (!r.ok) return toast.error(r.message ?? "فشل.");
    onClose(); onChanged();
  }
  async function addDep(depId: string) {
    const r = await addDependencyAction(task.id, projectId, depId);
    if (!r.ok) return toast.error(r.message ?? "فشل.");
    onChanged();
  }

  return (
    <Overlay onClose={onClose} title={task.title} wide extra={canDeleteTask(role) && <button type="button" onClick={remove} className="text-[var(--v-red)]"><Trash2 size={15} /></button>}>
      <div className="space-y-3 text-sm">
        {task.description && <p className="text-[var(--v-text-secondary)]">{task.description}</p>}

        <div className="flex flex-wrap gap-1.5">
          {KANBAN_COLUMNS.map((s) => (
            <button key={s} type="button" onClick={() => setStatus(s)} className={`rounded-[var(--v-radius-sm)] px-2 py-1 text-[11px] ${task.status === s ? "bg-[var(--v-primary)] text-white" : "border border-[var(--v-border)] text-[var(--v-text-secondary)]"}`}>
              {TASK_STATUS_LABELS[s]}
            </button>
          ))}
        </div>

        {/* المكلّفون */}
        <div>
          <p className="mb-1 text-[11px] font-semibold text-[var(--v-text)]">المكلّفون</p>
          <div className="flex flex-wrap gap-1">
            {members.map((m) => {
              const on = task.assignees.some((x) => x.user_id === m.user_id);
              return (
                <button key={m.user_id} type="button" onClick={() => assign(m.user_id)} disabled={!canAssignTask(role)} className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] ${on ? "border-[var(--v-primary)] bg-[var(--v-primary)]/10 text-[var(--v-primary)]" : "border-[var(--v-border)] text-[var(--v-text-muted)]"} disabled:opacity-50`}>
                  <Avatar name={m.name} size={16} /> {m.name}
                </button>
              );
            })}
          </div>
        </div>

        {/* التبعيات */}
        <div>
          <p className="mb-1 text-[11px] font-semibold text-[var(--v-text)]">التبعيات (لازم تكتمل قبل البدء)</p>
          {task.dependency_ids.length > 0 && (
            <ul className="mb-1 list-inside list-disc text-[11px] text-[var(--v-text-secondary)]">
              {task.dependency_ids.map((id) => <li key={id}>{allTasks.find((t) => t.id === id)?.title ?? id}</li>)}
            </ul>
          )}
          {canAssignTask(role) && (
            <select onChange={(e) => { if (e.target.value) addDep(e.target.value); e.currentTarget.value = ""; }} className="rounded-[var(--v-radius-sm)] border border-[var(--v-border)] bg-[var(--v-bg)] px-2 py-1 text-[11px]">
              <option value="">+ أضف تبعية…</option>
              {allTasks.filter((t) => t.id !== task.id && !task.dependency_ids.includes(t.id)).map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
            </select>
          )}
        </div>

        {/* AI */}
        <div className="rounded-[var(--v-radius-md)] border border-[var(--v-border)] p-2">
          <Button variant="outline" size="sm" icon={aiBusy ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />} onClick={runAi} disabled={aiBusy}>
            {aiBusy ? "جاري التحليل…" : "تحليل AI (تقدير + تقسيم)"}
          </Button>
          {aiResult?.estimate && (
            <p className="mt-2 text-[11px] text-[var(--v-text-secondary)]">
              التعقيد: {aiResult.estimate.complexity} · الجهد: {aiResult.estimate.effort_hours}س · المخاطر: {aiResult.estimate.risk} — {aiResult.estimate.rationale}
            </p>
          )}
          {aiResult && aiResult.subtasks.length > 0 && (
            <div className="mt-2 space-y-1">
              {aiResult.subtasks.map((s, i) => (
                <div key={i} className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="text-[var(--v-text-secondary)]">{s}</span>
                  <button type="button" onClick={() => addSubtaskFromAi(s)} className="text-[var(--v-primary)]">+ أضف</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Subtasks */}
        {subtasks.length > 0 && (
          <div>
            <p className="mb-1 text-[11px] font-semibold text-[var(--v-text)]">مهام فرعية</p>
            {subtasks.map((s) => (
              <div key={s.id} className="flex items-center justify-between border-b border-[var(--v-border)] py-1 text-[11px]">
                <span>{s.title}</span><Badge tone="neutral">{TASK_STATUS_LABELS[s.status]}</Badge>
              </div>
            ))}
          </div>
        )}

        {/* التعليقات */}
        <div>
          <p className="mb-1 text-[11px] font-semibold text-[var(--v-text)]">التعليقات</p>
          <div className="max-h-40 space-y-1 overflow-y-auto">
            {comments.map((c) => (
              <div key={c.id} className="rounded-[var(--v-radius-sm)] bg-[var(--v-surface)] p-1.5 text-[11px]">
                <span className="font-medium text-[var(--v-text)]">{c.author_name}:</span> <span className="text-[var(--v-text-secondary)]">{c.body}</span>
              </div>
            ))}
          </div>
          <div className="mt-1 flex gap-1">
            <input value={newComment} onChange={(e) => setNewComment(e.target.value)} onKeyDown={(e) => e.key === "Enter" && comment()} placeholder="تعليق…" className="flex-1 rounded-[var(--v-radius-sm)] border border-[var(--v-border)] bg-[var(--v-bg)] px-2 py-1 text-xs" />
            <Button variant="outline" size="sm" onClick={comment}>إرسال</Button>
          </div>
        </div>
      </div>
    </Overlay>
  );
}

function Overlay({ title, children, onClose, wide, extra }: { title: string; children: React.ReactNode; onClose: () => void; wide?: boolean; extra?: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/40 p-4" onClick={onClose}>
      <div className={`mt-10 w-full ${wide ? "max-w-lg" : "max-w-md"} rounded-[var(--v-radius-lg)] border border-[var(--v-border)] bg-[var(--v-bg)] p-4 shadow-2xl`} onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-semibold text-[var(--v-text)]">{title}</p>
          <div className="flex items-center gap-2">{extra}<button type="button" onClick={onClose}><X size={16} /></button></div>
        </div>
        {children}
      </div>
    </div>
  );
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <div>
      <label className="text-[10px] text-[var(--v-text-muted)]">{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-[var(--v-radius-sm)] border border-[var(--v-border)] bg-[var(--v-bg)] px-2 py-1.5 text-sm text-[var(--v-text)]">
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}
