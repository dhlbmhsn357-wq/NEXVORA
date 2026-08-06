"use client";

import { useState, useTransition } from "react";
import { Brain, TrendingUp, TrendingDown, BookOpen, Package, Clock, Check, X } from "lucide-react";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import { experienceTypeLabel } from "@/lib/organizational-memory/experience-model";
import { approveExperienceCandidate, rejectExperienceCandidate } from "./actions";
import type { OrgMemoryDashboard } from "@/lib/organizational-memory/dashboard";
import type { CandidateRow } from "@/lib/organizational-memory/promotion-service";
import type { Experience } from "@/lib/organizational-memory/library-service";

/**
 * لوحة الذاكرة المؤسسية: الملخّص + المراجعة البشرية للمرشّحين + المكتبة.
 */
export default function OrgMemoryClient({
  dashboard,
  candidates,
  experiences,
}: {
  dashboard: OrgMemoryDashboard;
  candidates: CandidateRow[];
  experiences: Experience[];
}) {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [resolved, setResolved] = useState<Set<string>>(new Set());

  function decide(id: string, action: "approve" | "reject") {
    startTransition(async () => {
      const r = action === "approve" ? await approveExperienceCandidate(id) : await rejectExperienceCandidate(id);
      if (r.ok) {
        setResolved((s) => new Set([...s, id]));
        setMsg(action === "approve" ? "اعتُمدت الخبرة وأُضيفت للمكتبة." : "رُفض المرشّح.");
      } else {
        setMsg(r.message ?? "فشلت العملية.");
      }
    });
  }

  const t = dashboard.totals;
  const visibleCandidates = candidates.filter((c) => !resolved.has(c.id));

  return (
    <div className="flex flex-col gap-4">
      {msg && (
        <div className="rounded-[var(--v-radius-sm)] border border-[var(--v-border)] bg-[var(--v-surface-2)] px-4 py-2 text-sm text-[var(--v-text)]">
          {msg}
        </div>
      )}

      {/* الملخّص */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <MiniStat icon={<Brain size={16} />} label="ذكاء مؤسسي" value={`${dashboard.intelligenceScore}٪`} accent />
        <MiniStat icon={<BookOpen size={16} />} label="الخبرات" value={t.experiences} />
        <MiniStat icon={<TrendingUp size={16} />} label="أنماط نجاح" value={t.successPatterns} />
        <MiniStat icon={<TrendingDown size={16} />} label="أنماط فشل" value={t.failurePatterns} />
        <MiniStat icon={<BookOpen size={16} />} label="دروس مستفادة" value={t.lessons} />
        <MiniStat icon={<Package size={16} />} label="أصول قابلة لإعادة الاستخدام" value={t.reusableAssets} />
        <MiniStat icon={<Clock size={16} />} label="قيد المراجعة" value={t.pendingReview} />
        <MiniStat icon={<BookOpen size={16} />} label="مشاريع مستفيدة" value={t.benefitingProjects} />
      </div>

      {/* المراجعة البشرية */}
      <Card padding="md">
        <h2 className="text-[0.9375rem] font-semibold text-[var(--v-text)]">مرشّحون قيد المراجعة</h2>
        <p className="mt-1 text-xs text-[var(--v-text-muted)]">
          لا خبرة تدخل المكتبة إلا بعد اعتماد المدير — القرار لك.
        </p>
        {visibleCandidates.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--v-text-muted)]">لا مرشّحين ينتظرون المراجعة.</p>
        ) : (
          <ul className="mt-3 divide-y divide-[var(--v-border)]">
            {visibleCandidates.map((c) => (
              <li key={c.id} className="py-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-[var(--v-text)]">{c.title}</span>
                      <Badge tone="neutral">{experienceTypeLabel(c.experience_type)}</Badge>
                      <Badge tone="info">{c.domain}</Badge>
                    </div>
                    {c.content && <p className="mt-1 line-clamp-2 text-xs text-[var(--v-text-muted)]">{c.content}</p>}
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      onClick={() => decide(c.id, "approve")}
                      disabled={pending}
                      className="inline-flex items-center gap-1 rounded-[var(--v-radius-sm)] bg-[var(--v-primary)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                    >
                      <Check size={13} /> اعتماد
                    </button>
                    <button
                      onClick={() => decide(c.id, "reject")}
                      disabled={pending}
                      className="inline-flex items-center gap-1 rounded-[var(--v-radius-sm)] border border-[var(--v-border)] px-3 py-1.5 text-xs text-[var(--v-text-muted)] disabled:opacity-50"
                    >
                      <X size={13} /> رفض
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* المكتبة */}
      <Card padding="md">
        <h2 className="text-[0.9375rem] font-semibold text-[var(--v-text)]">مكتبة الخبرات المؤسسية</h2>
        {experiences.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--v-text-muted)]">
            المكتبة فارغة. اعتمد مشروعًا كمصدر خبرة لتبدأ الخبرة التراكمية.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-[var(--v-border)]">
            {experiences.slice(0, 50).map((e) => (
              <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-[var(--v-text)]">{e.title}</span>
                    <Badge tone="neutral">{experienceTypeLabel(e.experience_type)}</Badge>
                  </div>
                  {/* Explainability: من كم مشروع + الثقة */}
                  <p className="mt-0.5 font-mono-plex text-xs text-[var(--v-text-muted)]">
                    {e.domain} · ثقة {e.confidence}٪ · من {e.source_project_ids?.length ?? 0} مشروع · استُخدمت {e.usage_count} مرة
                  </p>
                </div>
                <Badge tone={e.confidence >= 75 ? "success" : e.confidence >= 50 ? "info" : "warning"}>
                  {e.confidence}٪
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function MiniStat({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: number | string; accent?: boolean }) {
  return (
    <Card padding="sm">
      <div className="flex items-center gap-1.5 text-[var(--v-text-muted)]">
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <p className={`mt-1 font-display text-[1.25rem] font-bold ${accent ? "text-[var(--v-primary)]" : "text-[var(--v-text)]"}`}>
        {value}
      </p>
    </Card>
  );
}
