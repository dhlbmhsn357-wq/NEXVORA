import { History } from "lucide-react";
import type { TimelineEntry, TimelineSource } from "@/lib/audit-trail/timeline-service";
import Card from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import Timeline from "@/components/ui/Timeline";

const sourceColors: Record<TimelineSource, string> = {
  project_brain: "text-[var(--v-primary)] bg-[var(--v-primary-tint)]",
  prd: "text-[var(--v-green)] bg-[var(--v-green)]/10",
  prototype_prompt: "text-[var(--v-amber)] bg-[var(--v-amber)]/10",
  prototype_review: "text-[var(--v-red)] bg-[var(--v-red)]/10",
  client_presentation: "text-[var(--v-primary)] bg-[var(--v-primary-tint)]",
  developer_handoff: "text-[var(--v-text)] bg-[var(--v-surface)]",
  whatsapp_message: "text-[var(--v-green)] bg-[var(--v-green)]/10",
  discovery_link: "text-[var(--v-info)] bg-[var(--v-info)]/10",
  brain_v2: "text-[var(--v-primary)] bg-[var(--v-primary-tint)]",
  engineering_qa: "text-[var(--v-amber)] bg-[var(--v-amber)]/10",
  meeting_presentation: "text-[var(--v-info)] bg-[var(--v-info)]/10",
};

/**
 * تبويب Activity — Read-Only بالكامل، بيعرض خط زمني موحّد مبني من
 * جداول الـ *_versions الموجودة بالفعل. مفيش تعديل من هنا خالص —
 * أي تعديل فعلي بيحصل من تبويب المرحلة نفسها.
 */
export default function ActivityPanel({ entries }: { entries: TimelineEntry[] }) {
  if (entries.length === 0) {
    return <EmptyState icon={<History size={28} />} title="لسه مفيش أي نشاط مسجّل لهذا المشروع" />;
  }

  return (
    <div>
      <p className="mb-3 text-xs text-[var(--v-text-muted)]">
        خط زمني موحّد لكل الإصدارات عبر كل المراحل — للاطّلاع فقط، أي تعديل يتم من تبويب المرحلة نفسها.
      </p>
      <Timeline
        items={entries.map((e, i) => ({
          key: String(i),
          node: <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[var(--v-primary)]" />,
          content: (
            <Card padding="sm">
              <span className={`inline-block rounded-full px-2 py-1 text-[11px] font-medium ${sourceColors[e.source]}`}>
                {e.sourceLabel}
              </span>
              <p className="mt-1.5 text-sm text-[var(--v-text)]">
                نسخة {e.version} — {e.reason}
                {e.detail && <span className="text-[var(--v-text-muted)]"> ({e.detail})</span>}
              </p>
              <p className="mt-0.5 text-[11px] text-[var(--v-text-muted)]">
                {e.createdByName ?? "النظام"} · {new Date(e.createdAt).toLocaleString("ar-EG")}
              </p>
            </Card>
          ),
        }))}
      />
    </div>
  );
}
