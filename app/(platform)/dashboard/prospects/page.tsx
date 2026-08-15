import { Target } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/rbac";
import PageHeader from "@/components/ui/PageHeader";
import { listProspects, getProspectingSummary } from "@/lib/prospecting/service";
import ProspectsClient from "./prospects-client";

export default async function ProspectsPage() {
  const supabase = await createClient();

  const [summary, initial, auth, profilesRes] = await Promise.all([
    getProspectingSummary(),
    listProspects({}, 0),
    requireRole(["owner", "admin", "supervisor", "member"]),
    supabase.from("profiles").select("id, full_name, email").neq("status", "deleted").order("full_name"),
  ]);

  const canManage = auth.ok && ["owner", "admin", "supervisor"].includes(auth.role ?? "member");
  const isOwnerOrAdmin = auth.ok && ["owner", "admin"].includes(auth.role ?? "member");
  const currentUserId = auth.userId ?? null;

  const profiles = (profilesRes.data ?? []).map((p) => ({
    id: p.id as string,
    name: (p.full_name as string | null) || (p.email as string | null) || "بدون اسم",
  }));

  const conversionRateLabel =
    summary.conversionRate === null ? "—" : `${Math.round(summary.conversionRate * 100)}%`;

  return (
    <div>
      <div className="hud-frame rounded-[var(--v-radius-lg)] p-4">
        <PageHeader title="قاعدة الاستهداف" icon={Target} className="mb-2" />
        <p className="text-sm text-[var(--v-text-secondary)]">
          مرحلة ما قبل العملاء المحتملين — بحث واستهداف وتأهيل الجهات قبل تحويلها إلى Lead.
        </p>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-9">
        <SummaryTile label="إجمالي الجهات" value={summary.total} />
        <SummaryTile label="يحتاج تحقق" value={summary.needsVerification} tone="warning" />
        <SummaryTile label="جاهز للتواصل" value={summary.readyToContact} tone="info" />
        <SummaryTile label="تم التواصل" value={summary.contacted} tone="info" />
        <SummaryTile label="ردّ" value={summary.replied} tone="primary" />
        <SummaryTile label="مهتم" value={summary.interested} tone="success" />
        <SummaryTile label="متابعات اليوم" value={summary.followUpToday} tone="warning" />
        <SummaryTile label="تم تحويله إلى Lead" value={summary.converted} tone="success" />
        <SummaryTile label="معدل التحويل" value={conversionRateLabel} tone="primary" />
      </div>

      <div className="mt-6">
        <ProspectsClient
          initialItems={initial.items}
          initialHasMore={initial.hasMore}
          canManage={canManage}
          isOwnerOrAdmin={isOwnerOrAdmin}
          currentUserId={currentUserId}
          profiles={profiles}
        />
      </div>
    </div>
  );
}

function SummaryTile({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number | string;
  tone?: "neutral" | "warning" | "info" | "primary" | "success";
}) {
  const toneClass: Record<string, string> = {
    neutral: "text-[var(--v-text)]",
    warning: "text-[var(--v-amber)]",
    info: "text-[var(--v-info)]",
    primary: "text-[var(--v-primary)]",
    success: "text-[var(--v-green)]",
  };
  return (
    <div className="rounded-[var(--v-radius-lg)] border border-[var(--v-border)] bg-[var(--v-bg)] p-3 text-center shadow-[var(--v-shadow-sm)]">
      <p className={`text-xl font-bold tabular-nums ${toneClass[tone]}`}>{value}</p>
      <p className="mt-0.5 text-[11px] text-[var(--v-text-muted)]">{label}</p>
    </div>
  );
}
