"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { HeartPulse, Crown, Users2, Sparkles, Loader2 } from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Badge, { type BadgeTone } from "@/components/ui/Badge";
import Avatar from "@/components/ui/Avatar";
import { toast } from "@/components/ui/Toaster";
import MilestonesPanel from "./milestones-panel";
import { HEALTH_LABELS, type HealthColor } from "@/lib/portfolio/health";
import { OVERLOAD_THRESHOLD_PCT } from "@/lib/portfolio/capacity";
import { loadHealthAction, loadWorkloadAction, loadOwnershipAction, setOwnershipAction, analyzeDeliveryAction } from "./portfolio-actions";
import type { Milestone, OwnershipType, UserRole } from "@/lib/types/database";
import type { ProjectMemberWithName } from "@/lib/work/project-members-service";
import type { MemberWorkload } from "@/lib/portfolio/service";
import type { HealthResult } from "@/lib/portfolio/health";
import type { DeliveryIntelligenceResult } from "@/lib/portfolio/ai-service";

const HEALTH_TONE: Record<HealthColor, BadgeTone> = { green: "success", yellow: "warning", red: "danger" };
const OWNERSHIP_LABELS: Record<OwnershipType, string> = {
  project: "مالك المشروع", technical: "المالك التقني", business: "مالك الأعمال", delivery: "مالك التسليم", support: "مالك الدعم",
};
const OWNERSHIP_TYPES: OwnershipType[] = ["project", "technical", "business", "delivery", "support"];

export default function DeliveryLifecyclePanel({ projectId, projectName, role, milestones, members, allUsers }: {
  projectId: string; projectName: string; role: UserRole; milestones: Milestone[];
  members: ProjectMemberWithName[]; allUsers: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [health, setHealth] = useState<HealthResult | null>(null);
  const [workload, setWorkload] = useState<MemberWorkload[]>([]);
  const [ownership, setOwnership] = useState<{ ownership_type: OwnershipType; user_id: string | null; name: string | null }[]>([]);
  const [ai, setAi] = useState<DeliveryIntelligenceResult | null>(null);
  const [aiBusy, setAiBusy] = useState(false);

  const load = useCallback(async () => {
    const [h, w, o] = await Promise.all([loadHealthAction(projectId), loadWorkloadAction(projectId), loadOwnershipAction(projectId)]);
    if (h.ok && h.health) setHealth(h.health);
    if (w.ok) setWorkload(w.workload);
    if (o.ok) setOwnership(o.ownership);
  }, [projectId]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  const canManage = role === "owner" || role === "admin" || role === "supervisor";
  const ownerByType = new Map(ownership.map((o) => [o.ownership_type, o]));

  async function assignOwner(type: OwnershipType, userId: string) {
    const r = await setOwnershipAction(projectId, type, userId || null);
    if (!r.ok) return toast.error(r.message ?? "فشل.");
    load(); router.refresh();
  }
  async function runAi() {
    setAiBusy(true);
    const r = await analyzeDeliveryAction(projectId, projectName);
    setAiBusy(false);
    if (!r.ok || !r.result) return toast.error(r.message ?? "فشل التحليل.");
    setAi(r.result);
  }

  return (
    <div className="space-y-4">
      {/* صحة المشروع */}
      <Card padding="md">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-2 text-sm font-semibold text-[var(--v-text)]"><HeartPulse size={16} className="text-[var(--v-primary)]" /> صحة المشروع</p>
          {health && (
            <div className="flex items-center gap-2">
              <span className="font-display text-2xl text-[var(--v-text)]">{health.score}</span>
              <Badge tone={HEALTH_TONE[health.color]}>{HEALTH_LABELS[health.color]}</Badge>
            </div>
          )}
        </div>
        {health && health.reasons.length > 0 && (
          <ul className="mt-2 list-inside list-disc text-[11px] text-[var(--v-text-secondary)]">
            {health.reasons.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        )}
      </Card>

      {/* الملكية */}
      <Card padding="md">
        <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-[var(--v-text)]"><Crown size={16} className="text-[var(--v-amber)]" /> ملكية المشروع</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {OWNERSHIP_TYPES.map((t) => {
            const o = ownerByType.get(t);
            return (
              <div key={t} className="flex items-center justify-between gap-2 rounded-[var(--v-radius-sm)] border border-[var(--v-border)] px-2 py-1.5">
                <span className="text-xs text-[var(--v-text-secondary)]">{OWNERSHIP_LABELS[t]}</span>
                {canManage ? (
                  <select value={o?.user_id ?? ""} onChange={(e) => assignOwner(t, e.target.value)} className="rounded-[var(--v-radius-sm)] border border-[var(--v-border)] bg-[var(--v-bg)] px-1.5 py-1 text-[11px]">
                    <option value="">— بدون —</option>
                    {allUsers.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                ) : (
                  <span className="text-[11px] text-[var(--v-text)]">{o?.name ?? "—"}</span>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {/* أحمال الفريق */}
      <Card padding="md">
        <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-[var(--v-text)]"><Users2 size={16} className="text-[var(--v-primary)]" /> أحمال الفريق (السعة)</p>
        {workload.length === 0 ? (
          <p className="text-xs text-[var(--v-text-muted)]">مفيش أعضاء أو مهام بعد.</p>
        ) : (
          <div className="space-y-1.5">
            {workload.map((w) => (
              <div key={w.userId} className="flex items-center gap-2">
                <Avatar name={w.name} size={22} />
                <span className="w-28 truncate text-xs text-[var(--v-text)]">{w.name}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--v-surface)]">
                  <div className="h-full" style={{ width: `${Math.min(100, w.workloadPct)}%`, backgroundColor: w.overloaded ? "var(--v-red)" : "var(--v-primary)" }} />
                </div>
                <span className={`w-24 text-left text-[11px] ${w.overloaded ? "text-[var(--v-red)]" : "text-[var(--v-text-muted)]"}`}>
                  {w.workloadPct}% · {w.openTasks} مهمة
                </span>
              </div>
            ))}
            {workload.some((w) => w.overloaded) && (
              <p className="mt-1 text-[11px] text-[var(--v-red)]">⚠️ فيه أعضاء محمّلين فوق {OVERLOAD_THRESHOLD_PCT}% — فكّر في إعادة التوزيع.</p>
            )}
          </div>
        )}
      </Card>

      {/* ذكاء التسليم (AI) */}
      <Card padding="md">
        <div className="flex items-center justify-between">
          <p className="flex items-center gap-2 text-sm font-semibold text-[var(--v-text)]"><Sparkles size={16} className="text-[var(--v-primary)]" /> ذكاء التسليم</p>
          <Button variant="outline" size="sm" icon={aiBusy ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />} onClick={runAi} disabled={aiBusy}>
            {aiBusy ? "جاري التحليل…" : "تحليل المخاطر والتنبؤ"}
          </Button>
        </div>
        {ai && (
          <div className="mt-2 space-y-2 text-[11px]">
            <div className="flex items-center gap-2">
              <Badge tone={ai.delivery_risk === "high" ? "danger" : ai.delivery_risk === "medium" ? "warning" : "success"}>مخاطر: {ai.delivery_risk}</Badge>
              <span className="text-[var(--v-text-secondary)]">احتمال الإنجاز في الموعد: {ai.completion_probability}%</span>
            </div>
            {ai.executive_summary && <p className="rounded-[var(--v-radius-sm)] bg-[var(--v-surface)] p-2 text-[var(--v-text-secondary)]">{ai.executive_summary}</p>}
            <AiList title="تنبؤات التأخير" items={ai.predicted_delays} />
            <AiList title="أدوار ناقصة" items={ai.missing_roles} />
            <AiList title="توصيات" items={ai.recommendations} />
          </div>
        )}
      </Card>

      {/* مراحل التسليم + الفريق (المكوّن الموجود من المرحلة 3، متكامل) */}
      <MilestonesPanel projectId={projectId} role={role} milestones={milestones} members={members} allUsers={allUsers} />
    </div>
  );
}

function AiList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="font-semibold text-[var(--v-text)]">{title}</p>
      <ul className="list-inside list-disc text-[var(--v-text-secondary)]">{items.map((it, i) => <li key={i}>{it}</li>)}</ul>
    </div>
  );
}
