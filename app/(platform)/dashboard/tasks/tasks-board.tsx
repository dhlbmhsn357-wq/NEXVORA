"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, Search, X, Paperclip, Send, CheckCircle2, XCircle, Trash2, Clock } from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import Drawer from "@/components/ui/Drawer";
import Modal from "@/components/ui/Modal";
import {
  WTASK_KANBAN_COLUMNS,
  WTASK_PRIORITIES,
  WTASK_PRIORITY_LABELS,
  WTASK_PRIORITY_TONE,
  WTASK_STATUSES,
  WTASK_STATUS_LABELS,
  WTASK_STATUS_TONE,
  WTASK_TRANSITIONS,
  MANAGER_ONLY_TARGET_STATUSES,
  type WTaskPriority,
  type WTaskStatus,
} from "@/lib/workspace-tasks/statuses";
import { computeWTaskMetrics, isWTaskOverdue, checklistProgress, type ChecklistItem, type WTaskLink } from "@/lib/workspace-tasks/task-logic";
import type { WorkspaceTaskWithMeta } from "@/lib/workspace-tasks/service";
import {
  addCommentAction,
  changeStatusAction,
  createTaskAction,
  deleteTaskAction,
  loadTaskDetailAction,
  reviewTaskAction,
  setAssigneesAction,
  updateTaskAction,
  type TaskDetailPayload,
} from "./actions";

type Opt = { id: string; name: string };
const inputCls =
  "h-10 w-full rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-bg)] px-3 text-sm text-[var(--v-text)] outline-none focus:border-[var(--v-primary)]";

function initials(name: string): string {
  return (name || "?").trim().charAt(0).toUpperCase();
}
function fmtDate(d: string | null): string {
  return d ? new Date(d).toLocaleDateString("ar-EG", { day: "numeric", month: "short" }) : "—";
}

export default function TasksBoard({
  initialTasks,
  currentUserId,
  isManager,
  canCreate,
  canAssign,
  canApprove,
  canDelete,
  members,
  projects,
  clients,
}: {
  initialTasks: WorkspaceTaskWithMeta[];
  currentUserId: string;
  isManager: boolean;
  canCreate: boolean;
  canAssign: boolean;
  canApprove: boolean;
  canDelete: boolean;
  members: Opt[];
  projects: Opt[];
  clients: Opt[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [view, setView] = useState<"kanban" | "list">("kanban");
  const [query, setQuery] = useState("");
  const [fStatus, setFStatus] = useState<WTaskStatus | "all">("all");
  const [fPriority, setFPriority] = useState<WTaskPriority | "all">("all");
  const [fProject, setFProject] = useState<string>("all");
  const [fAssignee, setFAssignee] = useState<string>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // فتح مهمة من رابط الإشعار (?task=id)
  useEffect(() => {
    const t = searchParams.get("task");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (t) setSelectedId(t);
  }, [searchParams]);

  const tasks = initialTasks;
  const [nowMs] = useState(() => Date.now());

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tasks.filter((t) => {
      if (q && !t.title.toLowerCase().includes(q) && !(t.description ?? "").toLowerCase().includes(q)) return false;
      if (fStatus !== "all" && t.status !== fStatus) return false;
      if (fPriority !== "all" && t.priority !== fPriority) return false;
      if (fProject !== "all" && t.project_id !== fProject) return false;
      if (fAssignee !== "all" && !t.assignee_ids.includes(fAssignee)) return false;
      return true;
    });
  }, [tasks, query, fStatus, fPriority, fProject, fAssignee]);

  const metrics = useMemo(() => computeWTaskMetrics(tasks, nowMs), [tasks, nowMs]);
  const selected = tasks.find((t) => t.id === selectedId) ?? null;

  return (
    <div className="mt-4">
      {isManager && (
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric label="إجمالي المهام" value={metrics.total} />
          <Metric label="مكتملة" value={`${metrics.completed} (${metrics.completionPct}%)`} tone="success" />
          <Metric label="متأخرة" value={metrics.overdue} tone={metrics.overdue > 0 ? "danger" : "neutral"} />
          <Metric label="متوسط زمن التنفيذ" value={metrics.avgExecutionHours != null ? `${metrics.avgExecutionHours} س` : "—"} />
        </div>
      )}

      {/* شريط الأدوات */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[180px] flex-1">
          <Search size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[var(--v-text-subtle)]" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="بحث في المهام…" className={`${inputCls} pe-9`} />
        </div>
        <select value={fStatus} onChange={(e) => setFStatus(e.target.value as WTaskStatus | "all")} className={`${inputCls} w-auto`}>
          <option value="all">كل الحالات</option>
          {WTASK_STATUSES.map((s) => (
            <option key={s} value={s}>{WTASK_STATUS_LABELS[s]}</option>
          ))}
        </select>
        <select value={fPriority} onChange={(e) => setFPriority(e.target.value as WTaskPriority | "all")} className={`${inputCls} w-auto`}>
          <option value="all">كل الأولويات</option>
          {WTASK_PRIORITIES.map((p) => (
            <option key={p} value={p}>{WTASK_PRIORITY_LABELS[p]}</option>
          ))}
        </select>
        {isManager && (
          <>
            <select value={fProject} onChange={(e) => setFProject(e.target.value)} className={`${inputCls} w-auto`}>
              <option value="all">كل المشاريع</option>
              {projects.map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
            </select>
            <select value={fAssignee} onChange={(e) => setFAssignee(e.target.value)} className={`${inputCls} w-auto`}>
              <option value="all">كل الأشخاص</option>
              {members.map((m) => (<option key={m.id} value={m.id}>{m.name}</option>))}
            </select>
          </>
        )}
        <div className="flex overflow-hidden rounded-[var(--v-radius-md)] border border-[var(--v-border)]">
          <button type="button" onClick={() => setView("kanban")} className={`px-3 py-2 text-xs ${view === "kanban" ? "bg-[var(--v-primary-tint)] text-[var(--v-primary)]" : "text-[var(--v-text-muted)]"}`}>لوحة</button>
          <button type="button" onClick={() => setView("list")} className={`px-3 py-2 text-xs ${view === "list" ? "bg-[var(--v-primary-tint)] text-[var(--v-primary)]" : "text-[var(--v-text-muted)]"}`}>قائمة</button>
        </div>
        {canCreate && (
          <Button variant="primary" size="sm" icon={<Plus size={15} />} onClick={() => setCreateOpen(true)}>مهمة جديدة</Button>
        )}
      </div>

      {filtered.length === 0 ? (
        <Card padding="lg"><p className="text-center text-sm text-[var(--v-text-muted)]">لا توجد مهام مطابقة.</p></Card>
      ) : view === "kanban" ? (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {WTASK_KANBAN_COLUMNS.map((col) => {
            const colTasks = filtered.filter((t) => t.status === col);
            return (
              <div key={col} className="w-[260px] shrink-0">
                <div className="mb-2 flex items-center justify-between px-1">
                  <span className="text-xs font-semibold text-[var(--v-text-secondary)]">{WTASK_STATUS_LABELS[col]}</span>
                  <span className="text-[11px] text-[var(--v-text-subtle)]">{colTasks.length}</span>
                </div>
                <div className="flex flex-col gap-2">
                  {colTasks.map((t) => <TaskCard key={t.id} task={t} nowMs={nowMs} onClick={() => setSelectedId(t.id)} />)}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((t) => <TaskCard key={t.id} task={t} nowMs={nowMs} onClick={() => setSelectedId(t.id)} listMode />)}
        </div>
      )}

      {createOpen && (
        <CreateTaskModal
          members={members}
          projects={projects}
          clients={clients}
          canAssign={canAssign}
          onClose={() => setCreateOpen(false)}
          onCreated={() => { setCreateOpen(false); router.refresh(); }}
        />
      )}

      {selected && (
        <TaskDrawer
          task={selected}
          currentUserId={currentUserId}
          isManager={isManager}
          canAssign={canAssign}
          canApprove={canApprove}
          canDelete={canDelete}
          members={members}
          pending={pending}
          onClose={() => { setSelectedId(null); }}
          run={(fn) => startTransition(async () => { await fn(); router.refresh(); })}
        />
      )}
    </div>
  );
}

function Metric({ label, value, tone = "neutral" }: { label: string; value: string | number; tone?: "neutral" | "success" | "danger" }) {
  const color = tone === "success" ? "text-[var(--v-green)]" : tone === "danger" ? "text-[var(--v-red)]" : "text-[var(--v-text)]";
  return (
    <Card padding="md">
      <p className="text-[11px] text-[var(--v-text-muted)]">{label}</p>
      <p className={`mt-1 font-display text-xl ${color}`}>{value}</p>
    </Card>
  );
}

function TaskCard({ task, nowMs, onClick, listMode }: { task: WorkspaceTaskWithMeta; nowMs: number; onClick: () => void; listMode?: boolean }) {
  const overdue = isWTaskOverdue(task, nowMs);
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-bg)] p-3 text-start transition hover:border-[var(--v-primary)] ${listMode ? "flex items-center justify-between gap-3" : ""}`}
    >
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center gap-1.5">
          <Badge tone={WTASK_PRIORITY_TONE[task.priority]}>{WTASK_PRIORITY_LABELS[task.priority]}</Badge>
          {listMode && <Badge tone={WTASK_STATUS_TONE[task.status]}>{WTASK_STATUS_LABELS[task.status]}</Badge>}
        </div>
        <p className="truncate text-sm font-medium text-[var(--v-text)]">{task.title}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--v-text-subtle)]">
          {task.project_name && <span>📁 {task.project_name}</span>}
          {task.client_name && <span>🏢 {task.client_name}</span>}
          <span className={overdue ? "text-[var(--v-red)]" : ""}>🗓 {fmtDate(task.due_date)}</span>
          {task.comment_count > 0 && <span>💬 {task.comment_count}</span>}
        </div>
      </div>
      {task.assignees.length > 0 && (
        <div className="mt-2 flex -space-x-1 rtl:space-x-reverse">
          {task.assignees.slice(0, 3).map((a) => (
            <span key={a.id} title={a.name} className="flex h-6 w-6 items-center justify-center rounded-full border border-[var(--v-bg)] bg-[var(--v-primary-tint)] text-[10px] font-semibold text-[var(--v-primary)]">{initials(a.name)}</span>
          ))}
        </div>
      )}
    </button>
  );
}

// ============ Create modal ============
function CreateTaskModal({ members, projects, clients, canAssign, onClose, onCreated }: {
  members: Opt[]; projects: Opt[]; clients: Opt[]; canAssign: boolean; onClose: () => void; onCreated: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [projectId, setProjectId] = useState("");
  const [clientId, setClientId] = useState("");
  const [priority, setPriority] = useState<WTaskPriority>("medium");
  const [startDate, setStartDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [assignees, setAssignees] = useState<string[]>([]);
  const [tags, setTags] = useState("");
  const [notes, setNotes] = useState("");
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [checkText, setCheckText] = useState("");
  const [error, setError] = useState("");

  function submit() {
    setError("");
    if (!title.trim()) { setError("عنوان المهمة مطلوب."); return; }
    startTransition(async () => {
      const res = await createTaskAction({
        title, description, projectId: projectId || null, clientId: clientId || null, priority,
        startDate: startDate || null, dueDate: dueDate || null,
        assigneeIds: canAssign ? assignees : [],
        tags: tags.split(",").map((s) => s.trim()).filter(Boolean),
        checklist, notes: notes || null,
      });
      if (res.ok) onCreated();
      else setError(res.message ?? "فشل الإنشاء.");
    });
  }

  return (
    <Modal open onClose={onClose} maxWidth="max-w-lg">
      <div className="space-y-3">
        <h3 className="text-base font-semibold text-[var(--v-text)]">مهمة جديدة</h3>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="عنوان المهمة *" className={inputCls} />
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="وصف تفصيلي" rows={3} className={`${inputCls} h-auto py-2`} />
        <div className="grid grid-cols-2 gap-3">
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className={inputCls}><option value="">— مشروع (اختياري) —</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
          <select value={clientId} onChange={(e) => setClientId(e.target.value)} className={inputCls}><option value="">— عميل (اختياري) —</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          <select value={priority} onChange={(e) => setPriority(e.target.value as WTaskPriority)} className={inputCls}>{WTASK_PRIORITIES.map((p) => <option key={p} value={p}>{WTASK_PRIORITY_LABELS[p]}</option>)}</select>
          <div />
          <label className="text-[11px] text-[var(--v-text-muted)]">تاريخ البداية<input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputCls} /></label>
          <label className="text-[11px] text-[var(--v-text-muted)]">موعد التسليم<input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={inputCls} /></label>
        </div>
        {canAssign && (
          <div>
            <p className="mb-1 text-xs text-[var(--v-text-muted)]">المسؤولون</p>
            <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
              {members.map((m) => {
                const on = assignees.includes(m.id);
                return (
                  <button key={m.id} type="button" onClick={() => setAssignees((a) => on ? a.filter((x) => x !== m.id) : [...a, m.id])}
                    className={`rounded-full border px-2.5 py-1 text-xs ${on ? "border-[var(--v-primary)] bg-[var(--v-primary-tint)] text-[var(--v-primary)]" : "border-[var(--v-border)] text-[var(--v-text-secondary)]"}`}>{m.name}</button>
                );
              })}
            </div>
          </div>
        )}
        <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="وسوم مفصولة بفاصلة" className={inputCls} />
        <div>
          <div className="flex gap-2">
            <input value={checkText} onChange={(e) => setCheckText(e.target.value)} placeholder="عنصر تشيك-ليست" className={inputCls}
              onKeyDown={(e) => { if (e.key === "Enter" && checkText.trim()) { setChecklist((c) => [...c, { id: crypto.randomUUID(), text: checkText.trim(), done: false }]); setCheckText(""); e.preventDefault(); } }} />
          </div>
          {checklist.length > 0 && (
            <ul className="mt-2 space-y-1">
              {checklist.map((c) => (
                <li key={c.id} className="flex items-center justify-between rounded bg-[var(--v-surface)] px-2 py-1 text-xs">
                  <span>{c.text}</span>
                  <button type="button" onClick={() => setChecklist((l) => l.filter((x) => x.id !== c.id))}><X size={13} /></button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="ملاحظات" rows={2} className={`${inputCls} h-auto py-2`} />
        {error && <p className="text-xs text-[var(--v-red)]">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>إلغاء</Button>
          <Button variant="primary" loading={pending} onClick={submit}>إنشاء</Button>
        </div>
      </div>
    </Modal>
  );
}

// ============ Detail drawer ============
function TaskDrawer({ task, currentUserId, isManager, canAssign, canApprove, canDelete, members, pending, onClose, run }: {
  task: WorkspaceTaskWithMeta; currentUserId: string; isManager: boolean; canAssign: boolean; canApprove: boolean; canDelete: boolean;
  members: Opt[]; pending: boolean; onClose: () => void; run: (fn: () => Promise<unknown>) => void;
}) {
  const [detail, setDetail] = useState<TaskDetailPayload | null>(null);
  const [tab, setTab] = useState<"comments" | "activity">("comments");
  const [commentText, setCommentText] = useState("");
  const [isReport, setIsReport] = useState(false);
  const [rejectMode, setRejectMode] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const isParticipant = task.created_by === currentUserId || task.assignee_ids.includes(currentUserId);
  const canAct = isManager || isParticipant;

  useEffect(() => {
    let alive = true;
    loadTaskDetailAction(task.id).then((r) => { if (alive && r.ok && r.data) setDetail(r.data); });
    return () => { alive = false; };
  }, [task.id]);

  const nextStatuses = (WTASK_TRANSITIONS[task.status] ?? []).filter((to) => {
    if (MANAGER_ONLY_TARGET_STATUSES.includes(to)) return canApprove;
    return canAct;
  });

  return (
    <Drawer open onClose={onClose} title="تفاصيل المهمة">
      <div className="space-y-4 p-2">
        <div>
          <div className="mb-1 flex flex-wrap items-center gap-1.5">
            <Badge tone={WTASK_STATUS_TONE[task.status]}>{WTASK_STATUS_LABELS[task.status]}</Badge>
            <Badge tone={WTASK_PRIORITY_TONE[task.priority]}>{WTASK_PRIORITY_LABELS[task.priority]}</Badge>
          </div>
          <h3 className="text-base font-semibold text-[var(--v-text)]">{task.title}</h3>
          {task.description && <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--v-text-secondary)]">{task.description}</p>}
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs text-[var(--v-text-muted)]">
          <span>📁 {task.project_name ?? "—"}</span>
          <span>🏢 {task.client_name ?? "—"}</span>
          <span>🗓 التسليم: {fmtDate(task.due_date)}</span>
          <span>▶ البداية: {fmtDate(task.start_date)}</span>
          <span>👤 المنشئ: {task.creator_name ?? "—"}</span>
          <span>✅ المسؤولون: {task.assignees.map((a) => a.name).join("، ") || "—"}</span>
        </div>
        {task.tags.length > 0 && <div className="flex flex-wrap gap-1">{task.tags.map((t) => <span key={t} className="rounded-full bg-[var(--v-surface)] px-2 py-0.5 text-[11px] text-[var(--v-text-secondary)]">#{t}</span>)}</div>}
        {task.reject_reason && task.status === "in_progress" && (
          <div className="rounded-[var(--v-radius-md)] bg-[var(--v-red)]/10 p-2 text-xs text-[var(--v-red)]">سبب الرفض السابق: {task.reject_reason}</div>
        )}

        {/* Checklist */}
        {task.checklist.length > 0 && (
          <div>
            <p className="mb-1 text-xs font-semibold text-[var(--v-text-secondary)]">قائمة المهام الفرعية ({checklistProgress(task.checklist)}%)</p>
            <ul className="space-y-1">
              {task.checklist.map((c) => (
                <li key={c.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={c.done} disabled={!canAct || pending}
                    onChange={() => run(() => updateTaskAction(task.id, { checklist: task.checklist.map((x) => x.id === c.id ? { ...x, done: !x.done } : x) }))} />
                  <span className={c.done ? "text-[var(--v-text-subtle)] line-through" : "text-[var(--v-text)]"}>{c.text}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Links */}
        {task.links.length > 0 && (
          <div className="space-y-1">
            {task.links.map((l: WTaskLink, i) => (
              <a key={i} href={l.url} target="_blank" rel="noopener noreferrer" className="block truncate text-xs text-[var(--v-primary)] hover:underline">🔗 {l.label || l.url}</a>
            ))}
          </div>
        )}

        {/* Status actions */}
        {canAct && nextStatuses.length > 0 && (
          <div className="flex flex-wrap gap-1.5 border-t border-[var(--v-border)] pt-3">
            {nextStatuses.map((to) => (
              <Button key={to} size="sm" variant="outline" disabled={pending}
                onClick={() => run(() => changeStatusAction(task.id, to))}>→ {WTASK_STATUS_LABELS[to]}</Button>
            ))}
          </div>
        )}

        {/* Review actions (manager, waiting_review) */}
        {canApprove && task.status === "waiting_review" && (
          <div className="rounded-[var(--v-radius-md)] border border-[var(--v-border)] p-2">
            <p className="mb-2 text-xs font-semibold text-[var(--v-text-secondary)]">مراجعة المهمة</p>
            {!rejectMode ? (
              <div className="flex gap-2">
                <Button size="sm" variant="success" icon={<CheckCircle2 size={14} />} disabled={pending} onClick={() => run(() => reviewTaskAction(task.id, "approve"))}>اعتماد</Button>
                <Button size="sm" variant="danger" icon={<XCircle size={14} />} disabled={pending} onClick={() => setRejectMode(true)}>رفض</Button>
              </div>
            ) : (
              <div className="space-y-2">
                <textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="سبب الرفض" rows={2} className={`${inputCls} h-auto py-2`} />
                <div className="flex gap-2">
                  <Button size="sm" variant="danger" disabled={pending || !rejectReason.trim()} onClick={() => run(() => reviewTaskAction(task.id, "reject", rejectReason))}>تأكيد الرفض</Button>
                  <Button size="sm" variant="ghost" onClick={() => setRejectMode(false)}>إلغاء</Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Assignees (manager) */}
        {canAssign && (
          <div>
            <p className="mb-1 text-xs font-semibold text-[var(--v-text-secondary)]">إدارة الإسناد</p>
            <div className="flex max-h-24 flex-wrap gap-1.5 overflow-y-auto">
              {members.map((m) => {
                const on = task.assignee_ids.includes(m.id);
                return (
                  <button key={m.id} type="button" disabled={pending}
                    onClick={() => run(() => setAssigneesAction(task.id, on ? task.assignee_ids.filter((x) => x !== m.id) : [...task.assignee_ids, m.id]))}
                    className={`rounded-full border px-2.5 py-1 text-xs ${on ? "border-[var(--v-primary)] bg-[var(--v-primary-tint)] text-[var(--v-primary)]" : "border-[var(--v-border)] text-[var(--v-text-secondary)]"}`}>{m.name}</button>
                );
              })}
            </div>
          </div>
        )}

        {/* Attachments */}
        <div>
          <div className="mb-1 flex items-center justify-between">
            <p className="text-xs font-semibold text-[var(--v-text-secondary)]">المرفقات</p>
            {canAct && (
              <>
                <button type="button" onClick={() => fileRef.current?.click()} className="flex items-center gap-1 text-xs text-[var(--v-primary)]"><Paperclip size={13} /> رفع</button>
                <input ref={fileRef} type="file" className="hidden" onChange={(e) => {
                  const f = e.target.files?.[0]; if (!f) return;
                  const fd = new FormData(); fd.append("file", f);
                  run(async () => { const { uploadAttachmentAction } = await import("./actions"); return uploadAttachmentAction(task.id, fd); });
                }} />
              </>
            )}
          </div>
          <div className="space-y-1">
            {(detail?.attachments ?? []).map((a) => (
              <a key={a.id} href={a.url ?? "#"} target="_blank" rel="noopener noreferrer" className="block truncate text-xs text-[var(--v-primary)] hover:underline">📎 {a.file_name}</a>
            ))}
            {detail && detail.attachments.length === 0 && <p className="text-[11px] text-[var(--v-text-subtle)]">لا مرفقات.</p>}
          </div>
        </div>

        {/* Comments / Activity */}
        <div className="border-t border-[var(--v-border)] pt-3">
          <div className="mb-2 flex gap-3 text-xs">
            <button type="button" onClick={() => setTab("comments")} className={tab === "comments" ? "font-semibold text-[var(--v-primary)]" : "text-[var(--v-text-muted)]"}>التعليقات والتقارير</button>
            <button type="button" onClick={() => setTab("activity")} className={tab === "activity" ? "font-semibold text-[var(--v-primary)]" : "text-[var(--v-text-muted)]"}>السجل الزمني</button>
          </div>
          {tab === "comments" ? (
            <div className="space-y-2">
              {(detail?.comments ?? []).map((c) => (
                <div key={c.id} className="rounded-[var(--v-radius-md)] bg-[var(--v-surface)] p-2 text-xs">
                  <div className="mb-0.5 flex items-center gap-2 text-[10px] text-[var(--v-text-subtle)]">
                    <span>{c.author_name ?? "مستخدم"}</span>
                    {c.is_report && <Badge tone="info">تقرير مرحلي</Badge>}
                    <span>· {new Date(c.created_at).toLocaleString("ar-EG")}</span>
                  </div>
                  <p className="whitespace-pre-wrap text-[var(--v-text)]">{c.body}</p>
                </div>
              ))}
              {canAct && (
                <div className="space-y-1.5">
                  <textarea value={commentText} onChange={(e) => setCommentText(e.target.value)} placeholder="اكتب تعليقًا أو تقريرًا مرحليًا…" rows={2} className={`${inputCls} h-auto py-2`} />
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-1.5 text-[11px] text-[var(--v-text-muted)]">
                      <input type="checkbox" checked={isReport} onChange={(e) => setIsReport(e.target.checked)} /> تقرير مرحلي
                    </label>
                    <Button size="sm" variant="primary" icon={<Send size={13} />} disabled={pending || !commentText.trim()}
                      onClick={() => run(async () => { const r = await addCommentAction(task.id, commentText, isReport); setCommentText(""); return r; })}>إرسال</Button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <ul className="space-y-1.5">
              {(detail?.activity ?? []).map((ev) => (
                <li key={ev.id} className="flex items-start gap-2 text-[11px] text-[var(--v-text-secondary)]">
                  <Clock size={12} className="mt-0.5 shrink-0 text-[var(--v-text-subtle)]" />
                  <span>{ev.actor_name ?? "النظام"} · {ev.event_type} · {new Date(ev.created_at).toLocaleString("ar-EG")}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {canDelete && (
          <div className="border-t border-[var(--v-border)] pt-3">
            <Button size="sm" variant="danger" icon={<Trash2 size={14} />} disabled={pending}
              onClick={() => { if (confirm("حذف المهمة؟ (حذف ناعم)")) run(async () => { const r = await deleteTaskAction(task.id); onClose(); return r; }); }}>حذف المهمة</Button>
          </div>
        )}
      </div>
    </Drawer>
  );
}
