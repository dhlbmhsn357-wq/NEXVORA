"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Activity, AlertTriangle, CheckCircle2, Cpu, RotateCcw, XCircle } from "lucide-react";
import Card from "@/components/ui/Card";
import Badge, { type BadgeTone } from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import { cancelJobAction, requeueDeadLetterAction, type QueueDashboardData } from "./actions";
import { PRIORITY_LABELS } from "@/lib/queue/priority";
import type { JobStatus } from "@/lib/queue/types";

/**
 * لوحة الطوابير — للمسؤولين فقط.
 *
 * التحديث هنا **بالبث اللحظي عبر الصفحة الأب**، لا باستقصاء من
 * المتصفح. ده الفرق العملي اللي المرحلة دي موجودة عشانه.
 */

const STATUS_LABELS: Record<JobStatus, string> = {
  pending: "قيد الإنشاء",
  queued: "في الطابور",
  waiting: "منتظرة شرط",
  running: "قيد التنفيذ",
  retrying: "إعادة محاولة",
  paused: "موقوفة",
  canceled: "ملغاة",
  completed: "مكتملة",
  failed: "فاشلة",
  dead_letter: "رسائل ميتة",
  timeout: "انتهت مهلتها",
};

const STATUS_TONES: Record<JobStatus, BadgeTone> = {
  pending: "neutral",
  queued: "info",
  waiting: "neutral",
  running: "primary",
  retrying: "warning",
  paused: "neutral",
  canceled: "neutral",
  completed: "success",
  failed: "danger",
  dead_letter: "danger",
  timeout: "danger",
};

const HEALTH_TONES = { healthy: "success", degraded: "warning", critical: "danger" } as const;
const HEALTH_LABELS = { healthy: "سليم", degraded: "متدهور", critical: "حرج" } as const;

export default function QueueClient({ data }: { data: QueueDashboardData }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");

  const { overview, workers, health, recentJobs, deadLetters } = data;
  const counts = overview.countsByStatus;

  function runAction(action: () => Promise<{ ok: boolean; message?: string }>) {
    startTransition(async () => {
      const result = await action();
      setMessage(result.ok ? "تمّ." : (result.message ?? "فشل الإجراء."));
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      {/* الصحة العامة */}
      <Card padding="md">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Activity size={18} className="text-[var(--v-primary)]" />
            <h2 className="text-[0.9375rem] font-semibold text-[var(--v-text)]">صحة النظام</h2>
            <Badge tone={HEALTH_TONES[health.level]}>{HEALTH_LABELS[health.level]}</Badge>
          </div>
          <p className="font-mono-plex text-xs text-[var(--v-text-muted)]">
            عمق الطابور {health.queueDepth}
            {health.failureRate !== null && ` · نسبة الفشل ${Math.round(health.failureRate * 100)}٪`}
          </p>
        </div>

        {health.issues.length > 0 ? (
          <ul className="mt-3 space-y-1.5">
            {health.issues.map((issue) => (
              <li key={issue.code + issue.message} className="flex items-start gap-2 text-sm">
                <AlertTriangle
                  size={14}
                  className={`mt-0.5 shrink-0 ${
                    issue.level === "critical" ? "text-[var(--v-red)]" : "text-[var(--v-amber)]"
                  }`}
                />
                <span className="text-[var(--v-text-secondary)]">{issue.message}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 flex items-center gap-2 text-sm text-[var(--v-text-secondary)]">
            <CheckCircle2 size={14} className="text-[var(--v-green)]" />
            مفيش أي ملاحظات — الطابور والعمال في وضع سليم.
          </p>
        )}
      </Card>

      {/* عدّادات الحالات */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {(
          ["running", "queued", "completed", "failed", "canceled", "dead_letter"] as JobStatus[]
        ).map((status) => (
          <Card key={status} padding="sm">
            <p className="text-[11px] text-[var(--v-text-muted)]">{STATUS_LABELS[status]}</p>
            <p className="mt-1 font-mono-plex text-xl font-semibold text-[var(--v-text)]">
              {counts[status] ?? 0}
            </p>
          </Card>
        ))}
      </div>

      {/* الأزمنة */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Metric label="متوسط التنفيذ" value={formatMs(overview.avgExecutionMs)} />
        <Metric label="متوسط الانتظار" value={formatMs(overview.avgQueueMs)} />
        <Metric label="أقدم مهمة منتظرة" value={formatMs(overview.oldestWaitingMs)} />
        <Metric label="رسائل ميتة" value={String(overview.deadLetterCount)} />
      </div>

      {/* العمال */}
      <Card padding="md">
        <div className="mb-3 flex items-center gap-2">
          <Cpu size={16} className="text-[var(--v-primary)]" />
          <h2 className="text-[0.9375rem] font-semibold text-[var(--v-text)]">العمال</h2>
        </div>

        {workers.length === 0 ? (
          <EmptyState
            title="مفيش أي عامل مسجّل"
            description="شغّل عاملًا واحدًا على الأقل عشان المهام تتنفّذ. من غير عامل، المهام هتفضل في الطابور بلا نهاية."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--v-border)] text-start text-[11px] text-[var(--v-text-muted)]">
                  <th className="px-2 py-2 text-start">العامل</th>
                  <th className="px-2 py-2 text-start">النوع</th>
                  <th className="px-2 py-2 text-start">الحالة</th>
                  <th className="px-2 py-2 text-start">نشط</th>
                  <th className="px-2 py-2 text-start">آخر نبضة</th>
                </tr>
              </thead>
              <tbody>
                {workers.map((worker) => (
                  <tr key={worker.workerKey} className="border-b border-[var(--v-border)]/50">
                    <td className="px-2 py-2 font-mono-plex text-xs">{worker.workerKey}</td>
                    <td className="px-2 py-2 text-[var(--v-text-secondary)]">{worker.workerType}</td>
                    <td className="px-2 py-2">
                      <Badge tone={worker.status === "stopped" ? "neutral" : "success"}>
                        {worker.status}
                      </Badge>
                    </td>
                    <td className="px-2 py-2 font-mono-plex text-xs">
                      {worker.activeJobs}/{worker.concurrency}
                    </td>
                    <td className="px-2 py-2 font-mono-plex text-xs text-[var(--v-text-muted)]">
                      {formatMs(worker.heartbeatAgeMs)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* الرسائل الميتة */}
      {deadLetters.length > 0 && (
        <Card padding="md">
          <div className="mb-3 flex items-center gap-2">
            <XCircle size={16} className="text-[var(--v-red)]" />
            <h2 className="text-[0.9375rem] font-semibold text-[var(--v-text)]">
              رسائل ميتة محتاجة مراجعة
            </h2>
          </div>
          <ul className="space-y-2">
            {deadLetters.map((dl) => (
              <li
                key={dl.job_id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--v-radius-md)] border border-[var(--v-border)] p-3"
              >
                <div className="min-w-0">
                  <p className="font-mono-plex text-xs text-[var(--v-text)]">{dl.job_type}</p>
                  <p className="mt-0.5 text-xs text-[var(--v-text-muted)]">
                    {dl.attempts} محاولة · {dl.final_error ?? "بدون رسالة"}
                  </p>
                </div>
                <Button
                  variant="secondary"
                  onClick={() => runAction(() => requeueDeadLetterAction(dl.job_id))}
                  loading={pending}
                >
                  <RotateCcw size={14} /> إعادة إدراج
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* آخر المهام */}
      <Card padding="md">
        <h2 className="mb-3 text-[0.9375rem] font-semibold text-[var(--v-text)]">آخر المهام</h2>
        {recentJobs.length === 0 ? (
          <EmptyState
            title="مفيش مهام لسه"
            description="أول ما تتدرج مهمة هتظهر هنا مع تقدّمها لحظة بلحظة."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--v-border)] text-[11px] text-[var(--v-text-muted)]">
                  <th className="px-2 py-2 text-start">النوع</th>
                  <th className="px-2 py-2 text-start">الحالة</th>
                  <th className="px-2 py-2 text-start">الأولوية</th>
                  <th className="px-2 py-2 text-start">التقدّم</th>
                  <th className="px-2 py-2 text-start">المحاولات</th>
                  <th className="px-2 py-2 text-start"></th>
                </tr>
              </thead>
              <tbody>
                {recentJobs.map((job) => (
                  <tr key={job.id} className="border-b border-[var(--v-border)]/50">
                    <td className="px-2 py-2 font-mono-plex text-xs">{job.type}</td>
                    <td className="px-2 py-2">
                      <Badge tone={STATUS_TONES[job.status]}>{STATUS_LABELS[job.status]}</Badge>
                    </td>
                    <td className="px-2 py-2 text-xs text-[var(--v-text-secondary)]">
                      {PRIORITY_LABELS[job.priority]}
                    </td>
                    <td className="px-2 py-2 font-mono-plex text-xs">{job.progress}٪</td>
                    <td className="px-2 py-2 font-mono-plex text-xs">
                      {job.attempts}/{job.max_attempts}
                    </td>
                    <td className="px-2 py-2 text-end">
                      {["queued", "running", "waiting", "retrying", "paused"].includes(
                        job.status
                      ) && (
                        <button
                          onClick={() => runAction(() => cancelJobAction(job.id))}
                          disabled={pending}
                          className="text-xs text-[var(--v-red)] underline-offset-2 hover:underline disabled:opacity-50"
                        >
                          إلغاء
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {message && (
        <p className="text-sm text-[var(--v-text-secondary)]" role="status">
          {message}
        </p>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <Card padding="sm">
      <p className="text-[11px] text-[var(--v-text-muted)]">{label}</p>
      <p className="mt-1 font-mono-plex text-base font-semibold text-[var(--v-text)]">{value}</p>
    </Card>
  );
}

function formatMs(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1000) return `${Math.round(ms)} م.ث`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} ث`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)} د`;
  return `${(ms / 3_600_000).toFixed(1)} س`;
}
