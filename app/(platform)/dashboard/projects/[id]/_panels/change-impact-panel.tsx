"use client";

/** NEXVORA Change Impact View (P13) */
import { useMemo, useState } from "react";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Select from "@/components/ui/Select";
import EmptyState from "@/components/ui/EmptyState";
import type { RequirementRow } from "@/lib/product-definition/types";
import type { UserStoryRow, AcceptanceCriterionRow } from "@/lib/user-stories/types";
import type { EvaluationScenarioRow } from "@/lib/evaluation/types";
import type { EvidenceLinkRow } from "@/lib/evidence/types";
import {
  computeImpact,
  type ImpactSourceType, type ImpactedItem,
} from "@/lib/change-impact/derive";

export interface ChangeImpactPanelProps {
  requirements: RequirementRow[];
  stories: UserStoryRow[];
  acs: AcceptanceCriterionRow[];
  scenarios: EvaluationScenarioRow[];
  evidence: EvidenceLinkRow[];
}

const SOURCE_LABELS: Record<ImpactSourceType, string> = {
  requirement: "متطلّب",
  user_story: "قصة مستخدم",
  acceptance_criterion: "معيار قبول",
};

export default function ChangeImpactPanel(props: ChangeImpactPanelProps) {
  const { requirements, stories, acs, scenarios, evidence } = props;
  const [sourceType, setSourceType] = useState<ImpactSourceType>("requirement");
  const [sourceId, setSourceId] = useState<string>("");

  const options = useMemo(() => {
    if (sourceType === "requirement") return requirements.map((r) => ({ id: r.id, label: r.title }));
    if (sourceType === "user_story") return stories.map((s) => ({ id: s.id, label: s.title }));
    return acs.map((a) => ({ id: a.id, label: a.title || `AC #${a.orderIndex}` }));
  }, [sourceType, requirements, stories, acs]);

  const report = useMemo(() => {
    if (!sourceId) return null;
    return computeImpact(sourceType, sourceId, { requirements, stories, acs, scenarios, evidence });
  }, [sourceType, sourceId, requirements, stories, acs, scenarios, evidence]);

  return (
    <div className="space-y-6">
      <Card>
        <div className="mb-4 flex items-center justify-between gap-3 border-b border-[var(--v-border)] pb-3">
          <h3 className="text-base font-semibold text-[var(--v-text)]">تحليل أثر التغيير</h3>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs text-[var(--v-text-secondary)]">نوع المصدر</label>
            <Select value={sourceType} onChange={(e) => { setSourceType(e.target.value as ImpactSourceType); setSourceId(""); }}>
              {(Object.keys(SOURCE_LABELS) as ImpactSourceType[]).map((t) => (
                <option key={t} value={t}>{SOURCE_LABELS[t]}</option>
              ))}
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-[var(--v-text-secondary)]">العنصر</label>
            <Select value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
              <option value="">— اختر —</option>
              {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </Select>
          </div>
        </div>
      </Card>

      {!report ? (
        <Card><EmptyState title="اختر عنصرًا" description="لتحليل أثر تغييره على القصص/AC/التقييم/الأدلة." /></Card>
      ) : report.totalImpacts === 0 ? (
        <Card><EmptyState title="لا تأثيرات" description="هذا العنصر غير مرتبط بأي شيء آخر — تغييره آمن." /></Card>
      ) : (
        <>
          <Card>
            <div className="mb-3 flex items-center gap-2">
              <h3 className="text-base font-semibold text-[var(--v-text)]">ملخّص الأثر</h3>
              <Badge tone="warning">{report.totalImpacts} عنصر متأثر</Badge>
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatTile label="قصص" value={report.directStories.length} />
              <StatTile label="AC" value={report.directAcs.length} />
              <StatTile label="سيناريوهات تقييم" value={report.directEvaluations.length} />
              <StatTile label="روابط أدلة" value={report.directEvidence.length} />
            </div>
          </Card>

          {report.directStories.length > 0 && <ImpactSection title="قصص مستخدم متأثّرة" items={report.directStories} />}
          {report.directAcs.length > 0 && <ImpactSection title="معايير قبول متأثّرة" items={report.directAcs} />}
          {report.directEvaluations.length > 0 && <ImpactSection title="سيناريوهات تقييم متأثّرة" items={report.directEvaluations} />}
          {report.directEvidence.length > 0 && <ImpactSection title="روابط أدلة متأثّرة" items={report.directEvidence} />}
        </>
      )}
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-surface)] p-3">
      <p className="text-[11px] text-[var(--v-text-muted)]">{label}</p>
      <p className="mt-1 font-mono-plex text-lg font-semibold text-[var(--v-text)]">{value}</p>
    </div>
  );
}

function ImpactSection({ title, items }: { title: string; items: ImpactedItem[] }) {
  return (
    <Card>
      <h4 className="mb-3 border-b border-[var(--v-border)] pb-2 text-sm font-semibold text-[var(--v-text)]">{title} ({items.length})</h4>
      <ul className="divide-y divide-[var(--v-border)]">
        {items.map((i) => (
          <li key={`${i.type}-${i.id}`} className="py-2">
            <p className="text-sm font-medium text-[var(--v-text)]">{i.title}</p>
            <p className="text-[11px] text-[var(--v-text-secondary)]">{i.detail}</p>
          </li>
        ))}
      </ul>
    </Card>
  );
}
