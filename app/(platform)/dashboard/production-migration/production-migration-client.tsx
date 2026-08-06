"use client";

import { useState, useTransition, useCallback, useRef, useEffect } from "react";
import { Rocket, Play, Pause, Square, RotateCcw, ShieldCheck, Boxes, Brain, ChevronDown, Activity, ListChecks, FileText, AlertTriangle } from "lucide-react";
import Card from "@/components/ui/Card";
import Badge, { type BadgeTone } from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Textarea from "@/components/ui/Textarea";
import EmptyState from "@/components/ui/EmptyState";
import type { PmDashboard, PmSource, PmExecutionRow } from "@/lib/production-migration/dashboard";
import { startMigration, getStatus, getDetail, getLive, pause, resume, abort, recover, applyRecoveryAction, promote, getReports } from "./actions";
import LoadBridgePanel from "./load-bridge-panel";

interface ExecDetail {
  execution: PmExecutionRow & { status: string; phase: string; blockers: string[]; error: string | null; total_entities: number; total_tasks: number; completed_tasks: number; failed_tasks: number; chunk_size: number; worker_count: number; promoted_to_org_memory: boolean };
  tasks: Array<{ id: string; entity: string; label: string; task_order: number; level: number; chunk_index: number; status: string; processed: number; migrated: number; failed: number; retry_count: number; last_error: string | null }>;
  preflight: Array<{ check_key: string; label: string; passed: boolean; blocking: boolean; detail: string }>;
  events: Array<{ event_type: string; created_at: string; detail: Record<string, unknown> }>;
  backup: { backup_key: string; size_bytes: number; restore_command: string; status: string } | null;
  rollback: { status: string; data_loss: boolean; executed_at: string | null } | null;
}
interface Live { snapshot: { progress: number; processedRows: number; remainingRows: number; speedRowsPerSec: number; currentEntity: string | null; estimatedFinishSeconds: number; errors: number; retries: number }; alerts: Array<{ key: string; title: string; severity: string; suggestion: string }>; }

const RUNNING = new Set(["running", "paused", "backing_up", "preflight", "rolling_back"]);
function statusTone(s: string): BadgeTone {
  if (s === "completed") return "success";
  if (s === "failed" || s === "aborted") return "danger";
  if (s === "rolled_back") return "warning";
  if (RUNNING.has(s)) return "info";
  return "neutral";
}
const STATUS_LABEL: Record<string, string> = {
  draft: "مسودّة", preflight: "فحص أولي", backing_up: "نسخ احتياطي", ready: "جاهز", running: "قيد التنفيذ",
  paused: "مُوقَف مؤقتًا", completed: "مكتمل", failed: "فشل", rolling_back: "تراجع جارٍ", rolled_back: "تم التراجع", aborted: "أُجهِض",
};

export default function ProductionMigrationClient({ dashboard }: { dashboard: PmDashboard }) {
  const [banner, setBanner] = useState<{ tone: BadgeTone; text: string } | null>(null);
  const notify = useCallback((tone: BadgeTone, text: string) => setBanner({ tone, text }), []);
  const t = dashboard.totals;

  return (
    <div className="space-y-5">
      {banner && (
        <div className="rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-surface-2)] px-4 py-2.5 text-sm text-[var(--v-text)]">
          <Badge tone={banner.tone}>{banner.tone === "danger" ? "تنبيه" : "تم"}</Badge> <span className="ms-2">{banner.text}</span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="عمليات" value={t.runs} />
        <StatTile label="مكتملة" value={t.completed} tone="success" />
        <StatTile label="جارية" value={t.running} tone="info" />
        <StatTile label="مُتراجَع عنها" value={t.rolledBack} tone={t.rolledBack > 0 ? "warning" : "neutral"} />
      </div>

      <div className="rounded-[var(--v-radius-md)] border border-[var(--v-amber)]/40 bg-[var(--v-amber)]/5 px-4 py-3 text-xs text-[var(--v-text-secondary)]">
        <strong className="text-[var(--v-text)]">Mission Critical.</strong> نسخة احتياطية إلزامية قبل أول سجلّ · فحوص ما قبل التنفيذ حاجزة · تنفيذ على دفعات مرتّبة بالتبعية · استئناف من آخر نقطة · تراجع آمن في أي لحظة.
      </div>

      <h2 className="text-sm font-bold text-[var(--v-text)]">المصادر — ابدأ الترحيل الحقيقي</h2>

      {dashboard.sources.length === 0 ? (
        <EmptyState icon={<Rocket size={22} />} title="لا توجد مصادر جاهزة" description="أكمل المراحل ١-٥ (اكتشاف → Mapping → تنظيف → تحويل → محاكاة معتمَدة) لتفعيل الترحيل الحقيقي." />
      ) : (
        <div className="space-y-3">
          {dashboard.sources.map((s) => (
            <SourceCard key={s.id} source={s} latest={dashboard.executions.find((x) => x.source_id === s.id) ?? null} onNotify={notify} />
          ))}
        </div>
      )}
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: string | number; tone?: BadgeTone }) {
  return (
    <Card padding="sm">
      <div className="text-xs text-[var(--v-text-muted)]">{label}</div>
      <div className="mt-1 text-xl font-bold tabular-nums text-[var(--v-text)]">{value}</div>
    </Card>
  );
}

function SourceCard({ source, latest, onNotify }: { source: PmSource; latest: PmExecutionRow | null; onNotify: (t: BadgeTone, s: string) => void }) {
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState("");
  const [chunkSize, setChunkSize] = useState(1000);
  const [workers, setWorkers] = useState(4);
  const [pending, startTransition] = useTransition();
  const [execId, setExecId] = useState<string | null>(latest?.id ?? null);
  const [status, setStatus] = useState<string | null>(latest?.status ?? null);
  const [detail, setDetail] = useState<ExecDetail | null>(null);
  const [live, setLive] = useState<Live | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback((id: string) => {
    getDetail(id).then((r) => { if (r.ok && r.detail) setDetail(r.detail as ExecDetail); });
    getLive(id).then((r) => { if (r.ok && r.live) setLive(r.live as Live); });
  }, []);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const startPolling = useCallback((id: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      const r = await getStatus(id);
      if (r.ok && r.status) {
        setStatus(r.status);
        load(id);
        if (!RUNNING.has(r.status)) {
          if (pollRef.current) clearInterval(pollRef.current);
          onNotify(r.status === "completed" ? "success" : r.status === "failed" ? "danger" : "warning", `الترحيل: ${STATUS_LABEL[r.status] ?? r.status}`);
        }
      }
    }, 3000);
  }, [load, onNotify]);

  function begin() {
    startTransition(async () => {
      const r = await startMigration(source.id, content, chunkSize, workers);
      onNotify(r.ok ? "info" : "danger", r.message ?? (r.blockers?.join("، ") ?? ""));
      if (r.ok && r.executionId) {
        setExecId(r.executionId); setStatus("running"); setOpen(true);
        startPolling(r.executionId);
      } else if (r.executionId) {
        setExecId(r.executionId); setOpen(true); load(r.executionId);
      }
    });
  }

  function ctl(fn: (id: string) => Promise<{ ok: boolean; message?: string }>) {
    if (!execId) return;
    startTransition(async () => {
      const r = await fn(execId);
      onNotify(r.ok ? "success" : "danger", r.message ?? "");
      if (r.ok) { load(execId); startPolling(execId); }
    });
  }

  return (
    <Card padding="md">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-bold text-[var(--v-text)]">{source.name}</span>
          <Badge tone="neutral">{source.source_type}</Badge>
          {latest && <Badge tone={statusTone(latest.status)}>{STATUS_LABEL[latest.status] ?? latest.status}</Badge>}
        </div>
        <div className="flex items-center gap-2">
          {!source.simulation_approved && <span className="text-xs text-[var(--v-amber)]">يتطلّب محاكاة معتمَدة غير محظورة (المرحلة ٥).</span>}
          {(execId || source.simulation_approved) && (
            <Button variant="ghost" size="sm" onClick={() => { setOpen((o) => !o); if (!detail && execId) load(execId); }} icon={<ChevronDown size={15} className={open ? "rotate-180 transition" : "transition"} />}>
              {open ? "إخفاء" : "التفاصيل"}
            </Button>
          )}
        </div>
      </div>

      {open && (
        <div className="mt-4 space-y-4 border-t border-[var(--v-border)] pt-4">
          {source.simulation_approved && (!status || !RUNNING.has(status)) && (
            <div className="space-y-2">
              <div className="text-xs font-bold text-[var(--v-text)]">ابدأ ترحيلًا حقيقيًا — الصق بيانات المصدر</div>
              <Textarea rows={4} value={content} onChange={(e) => setContent(e.target.value)} placeholder='CSV أو JSON متعدّد الكيانات' />
              <div className="flex flex-wrap items-center gap-3 text-xs">
                <label className="flex items-center gap-1.5">حجم الدفعة <input type="number" value={chunkSize} min={100} max={10000} onChange={(e) => setChunkSize(Number(e.target.value))} className="w-20 rounded-[var(--v-radius-sm)] border border-[var(--v-border)] bg-[var(--v-surface)] px-2 py-1 text-[var(--v-text)]" /></label>
                <label className="flex items-center gap-1.5">عمّال <input type="number" value={workers} min={1} max={12} onChange={(e) => setWorkers(Number(e.target.value))} className="w-16 rounded-[var(--v-radius-sm)] border border-[var(--v-border)] bg-[var(--v-surface)] px-2 py-1 text-[var(--v-text)]" /></label>
                <Button variant="primary" size="sm" onClick={begin} loading={pending} disabled={pending} icon={<Play size={15} />}>ابدأ الترحيل الحقيقي</Button>
              </div>
            </div>
          )}

          {status && RUNNING.has(status) && (
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" size="sm" disabled={pending || status !== "running"} onClick={() => ctl((id) => pause(id))} icon={<Pause size={14} />}>إيقاف مؤقت</Button>
              <Button variant="secondary" size="sm" disabled={pending || status !== "paused"} onClick={() => ctl((id) => resume(id))} icon={<Play size={14} />}>استئناف</Button>
              <Button variant="danger" size="sm" disabled={pending} onClick={() => ctl((id) => abort(id))} icon={<Square size={14} />}>إجهاض + تراجع</Button>
            </div>
          )}

          {detail && <ExecutionView detail={detail} live={live} status={status} onNotify={onNotify} onReload={() => execId && load(execId)} pending={pending} startTransition={startTransition} />}
        </div>
      )}
    </Card>
  );
}

function ExecutionView({ detail, live, status, onNotify, onReload, pending, startTransition }: { detail: ExecDetail; live: Live | null; status: string | null; onNotify: (t: BadgeTone, s: string) => void; onReload: () => void; pending: boolean; startTransition: React.TransitionStartFunction }) {
  const e = detail.execution;
  const failedPre = detail.preflight.filter((c) => !c.passed);
  const reviewTasks = detail.tasks.filter((t) => t.status === "review" || t.status === "failed");

  return (
    <div className="space-y-4">
      {/* حالة + شريط تقدّم */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={statusTone(e.status)}>{STATUS_LABEL[e.status] ?? e.status}</Badge>
          <span className="text-xs text-[var(--v-text-muted)]">المرحلة: {e.phase}</span>
          {e.promoted_to_org_memory && <Badge tone="info">مُرقّاة للذاكرة</Badge>}
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--v-surface-2)]">
          <div className="h-full rounded-full bg-[var(--v-primary)] transition-all" style={{ width: `${live?.snapshot.progress ?? e.progress}%` }} />
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--v-text-muted)] tabular-nums">
          <span>التقدّم {live?.snapshot.progress ?? e.progress}%</span>
          <span>مُرحَّل {e.migrated_rows}/{e.total_rows}</span>
          <span>مهام {e.completed_tasks}/{e.total_tasks}</span>
          {live && <span>سرعة {live.snapshot.speedRowsPerSec}/ث</span>}
          {live && live.snapshot.estimatedFinishSeconds > 0 && <span>متبقٍّ ~{live.snapshot.estimatedFinishSeconds}ث</span>}
          {e.failed_tasks > 0 && <span className="text-[var(--v-red)]">فشل {e.failed_tasks}</span>}
        </div>
        {e.error && <div className="rounded-[var(--v-radius-md)] border border-[var(--v-red)]/40 bg-[var(--v-red)]/5 px-3 py-2 text-xs text-[var(--v-text)]"><Badge tone="danger">خطأ</Badge> <span className="ms-2">{e.error}</span></div>}
      </div>

      {/* تنبيهات مراقبة حيّة */}
      {live && live.alerts.length > 0 && (
        <Section icon={<Activity size={15} />} title="مراقبة حيّة (AI Monitoring)">
          {live.alerts.map((a, i) => (
            <div key={i} className="py-1 text-xs"><Badge tone={a.severity === "critical" ? "danger" : "warning"}>{a.title}</Badge> <span className="ms-1 text-[var(--v-text-secondary)]">{a.suggestion}</span></div>
          ))}
        </Section>
      )}

      {/* فحوص ما قبل التنفيذ */}
      <Section icon={<ShieldCheck size={15} />} title={`فحوص ما قبل التنفيذ — ${failedPre.length === 0 ? "اجتاز الكل" : `${failedPre.length} فشل`}`}>
        <div className="grid gap-1 sm:grid-cols-2">
          {detail.preflight.map((c) => (
            <div key={c.check_key} className="flex items-center justify-between gap-2 text-xs">
              <span className="text-[var(--v-text)]">{c.label}{c.blocking && <span className="text-[var(--v-red)]"> *</span>}</span>
              <Badge tone={c.passed ? "success" : c.blocking ? "danger" : "warning"}>{c.passed ? "✓" : "✕"}</Badge>
            </div>
          ))}
        </div>
      </Section>

      {/* النسخة الاحتياطية */}
      {detail.backup && (
        <Section icon={<Boxes size={15} />} title="النسخة الاحتياطية الإلزامية">
          <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--v-text-secondary)]">
            <Badge tone={detail.backup.status === "ready" ? "success" : "warning"}>{detail.backup.status}</Badge>
            <span>{(detail.backup.size_bytes / 1024).toFixed(1)} KB</span>
            <code className="rounded bg-[var(--v-surface-2)] px-1.5 py-0.5 text-[0.65rem]">{detail.backup.restore_command}</code>
          </div>
        </Section>
      )}

      {/* المهام (دفعات مرتّبة بالتبعية) */}
      <Section icon={<ListChecks size={15} />} title={`الدفعات — ${detail.tasks.length} (مرتّبة بالتبعية)`}>
        <div className="max-h-56 space-y-1 overflow-y-auto">
          {detail.tasks.map((tk, i) => (
            <div key={i} className="flex items-center justify-between gap-2 rounded-[var(--v-radius-sm)] bg-[var(--v-surface-2)] px-2.5 py-1.5 text-xs">
              <span className="flex items-center gap-2"><Badge tone={taskTone(tk.status)}>{tk.status === "completed" ? "✓" : tk.status === "review" ? "!" : tk.level}</Badge> <span className="text-[var(--v-text)]">{tk.label} · دفعة {tk.chunk_index}</span></span>
              <span className="tabular-nums text-[var(--v-text-muted)]">{tk.migrated}/{tk.processed}{tk.retry_count > 0 && ` · إعادة ${tk.retry_count}`}</span>
            </div>
          ))}
        </div>
      </Section>

      {/* طابور المراجعة (Live Error Recovery) */}
      {reviewTasks.length > 0 && (
        <Section icon={<AlertTriangle size={15} />} title={`طابور المراجعة — ${reviewTasks.length}`}>
          {reviewTasks.map((tk, i) => (
            <ReviewRow key={i} task={tk} onNotify={onNotify} onReload={onReload} pending={pending} startTransition={startTransition} />
          ))}
        </Section>
      )}

      {/* سجلّ التدقيق */}
      <Section icon={<FileText size={15} />} title="سجلّ التدقيق (Audit Trail)">
        <div className="max-h-48 space-y-0.5 overflow-y-auto text-xs">
          {detail.events.map((ev, i) => (
            <div key={i} className="flex items-center justify-between gap-2 text-[var(--v-text-secondary)]">
              <span>{eventLabel(ev.event_type)}</span>
              <span className="text-[var(--v-text-muted)]">{new Date(ev.created_at).toLocaleTimeString("ar")}</span>
            </div>
          ))}
        </div>
      </Section>

      {/* التراجع + الترقية */}
      <div className="flex flex-wrap items-center gap-2">
        {detail.rollback && <Badge tone={detail.rollback.status === "executed" ? "warning" : "neutral"}>التراجع: {detail.rollback.status}{detail.rollback.data_loss ? " (فقدان!)" : " (بلا فقدان)"}</Badge>}
        {e.status === "completed" && !e.promoted_to_org_memory && (
          <Button variant="secondary" size="sm" disabled={pending} onClick={() => startTransition(async () => { const r = await promote(e.id); onNotify(r.ok ? "success" : "danger", r.message ?? ""); onReload(); })} icon={<Brain size={14} />}>ترقية الخبرات للذاكرة</Button>
        )}
      </div>
      {status && !RUNNING.has(status) && <ReportsButton executionId={e.id} pending={pending} startTransition={startTransition} />}

      {/* جسر الحمل — الضخّ داخل الـ ERP (بعد اكتمال الترحيل) */}
      {e.status === "completed" && <LoadBridgePanel executionId={e.id} onNotify={onNotify} />}
    </div>
  );
}

function ReviewRow({ task, onNotify, onReload, pending, startTransition }: { task: { id: string; label: string; last_error: string | null }; onNotify: (t: BadgeTone, s: string) => void; onReload: () => void; pending: boolean; startTransition: React.TransitionStartFunction }) {
  const [sug, setSug] = useState<{ action: string; suggestion: string; auto_safe?: boolean } | null>(null);

  function askAi() {
    startTransition(async () => {
      const r = await recover(task.id);
      if (r.ok && r.suggestion) setSug(r.suggestion as { action: string; suggestion: string; auto_safe?: boolean });
      else onNotify("danger", r.message ?? "تعذّر توليد الاقتراح.");
    });
  }
  function apply(action: "retry" | "skip") {
    startTransition(async () => {
      const r = await applyRecoveryAction(task.id, action);
      onNotify(r.ok ? "success" : "danger", r.message ?? "");
      if (r.ok) onReload();
    });
  }

  return (
    <div className="rounded-[var(--v-radius-sm)] bg-[var(--v-surface-2)] px-2.5 py-1.5 text-xs">
      <div className="text-[var(--v-text)]">{task.label}</div>
      {task.last_error && <p className="mt-0.5 text-[var(--v-text-muted)]">{task.last_error}</p>}
      {sug && <p className="mt-0.5 text-[var(--v-primary)]">اقتراح AI: {sug.action} — {sug.suggestion}</p>}
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        <Button variant="ghost" size="sm" disabled={pending} onClick={askAi} icon={<Brain size={13} />}>اقتراح AI</Button>
        <Button variant="secondary" size="sm" disabled={pending} onClick={() => apply("retry")} icon={<RotateCcw size={13} />}>إعادة</Button>
        <Button variant="ghost" size="sm" disabled={pending} onClick={() => apply("skip")}>تخطٍّ (بموافقة المدير)</Button>
      </div>
    </div>
  );
}

function ReportsButton({ executionId, pending, startTransition }: { executionId: string; pending: boolean; startTransition: React.TransitionStartFunction }) {
  const [reports, setReports] = useState<Record<string, unknown> | null>(null);
  return (
    <div className="mt-2">
      <Button variant="ghost" size="sm" disabled={pending} onClick={() => startTransition(async () => { const r = await getReports(executionId); if (r.ok) setReports((r.reports as unknown as Record<string, unknown>) ?? {}); })} icon={<FileText size={14} />}>توليد التقارير</Button>
      {reports && (
        <pre className="mt-2 max-h-64 overflow-auto rounded-[var(--v-radius-md)] bg-[var(--v-surface-2)] p-2 text-[0.65rem] text-[var(--v-text-secondary)]" dir="ltr">{JSON.stringify(reports, null, 2)}</pre>
      )}
    </div>
  );
}

function taskTone(s: string): BadgeTone {
  return s === "completed" ? "success" : s === "review" || s === "failed" ? "danger" : s === "running" ? "info" : s === "skipped" ? "warning" : "neutral";
}
function eventLabel(t: string): string {
  const m: Record<string, string> = {
    created: "أُنشِئت العملية", backup_ready: "جهُزت النسخة الاحتياطية", preflight_run: "فحص ما قبل التنفيذ", execution_started: "بدأ التنفيذ",
    chunk_completed: "اكتملت دفعة", chunk_failed: "فشلت دفعة", chunk_retried: "أُعيدت دفعة", paused: "إيقاف مؤقت", resumed: "استئناف",
    aborted: "إجهاض", completed: "اكتمل", failed: "فشل", rollback_started: "بدأ التراجع", rollback_completed: "اكتمل التراجع", recovery_applied: "طُبِّقت استعادة",
  };
  return m[t] ?? t;
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[var(--v-radius-md)] border border-[var(--v-border)] p-3">
      <div className="mb-2 flex items-center gap-1.5 text-xs font-bold text-[var(--v-text)]">{icon} {title}</div>
      {children}
    </div>
  );
}
