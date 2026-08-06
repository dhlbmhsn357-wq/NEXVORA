"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, GitBranch, Loader2, RefreshCw, TriangleAlert } from "lucide-react";
import { generatePrdIncrementSection } from "./increments-actions";
import Badge, { type BadgeTone } from "@/components/ui/Badge";
import AiBadge from "@/components/ui/AiBadge";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import type { ProjectIncrement } from "@/lib/increments/service";
import type { PrdIncrementSection } from "@/lib/prd/increment-service";
import type { PrdIncrementSectionData } from "@/lib/ai/validation/prd-increment";
import { BRAIN_SECTION_LABELS, type BrainSectionKey } from "@/lib/brain-v2/types";
import { useBackgroundRefresh } from "@/lib/ui/use-background-refresh";

const SOURCE_LABELS: Record<string, string> = {
  discovery_session: "جلسة اكتشاف",
  meeting: "اجتماع",
  decision: "قرار",
  file: "ملف",
  recommendation: "توصية معتمدة",
  manual: "إدخال يدوي",
};

const STATUS_LABELS: Record<string, string> = {
  open: "بانتظار قسم PRD",
  prd_drafted: "له قسم PRD",
  prompted: "له برومت",
  qa_done: "تمت مراجعته",
  closed: "مغلق",
};

const STATUS_TONES: Record<string, BadgeTone> = {
  open: "warning",
  prd_drafted: "info",
  prompted: "info",
  qa_done: "success",
  closed: "neutral",
};

/**
 * لوحة الزيادات: كل معلومة جديدة وصلت بعد الدورة الأولى بتظهر هنا
 * كوحدة مستقلة، ومنها بتولّد **قسم PRD خاص بيها بس** من غير ما تلمس
 * المستند الأساسي ولا تعيد توليد باقي المراحل.
 *
 * البيانات بتوصل جاهزة من page.tsx زي باقي اللوحات، والـ Polling
 * بيستخدم router.refresh() بدل State محلي منفصل عن مصدر الحقيقة.
 */
export default function IncrementsPanel({
  projectId,
  increments,
  sections,
}: {
  projectId: string;
  increments: ProjectIncrement[];
  sections: PrdIncrementSection[];
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const sectionByIncrement = new Map(sections.map((s) => [s.increment_id, s]));
  const hasGenerating = sections.some((s) => s.status === "generating");

  // تحديث دوري مُجمَّع: منسّق واحد لكل الصفحة بدل مؤقّت لكل لوحة، بيقف
  // لما التبويب يكون مخفي وبيبطّل خالص لو المهمة اتعلّقت.
  useBackgroundRefresh(hasGenerating);

  async function handleGenerate(incrementId: string) {
    setBusyId(incrementId);
    setMessage(null);
    try {
      const result = await generatePrdIncrementSection(projectId, incrementId);
      if (result.status === "already_generating") {
        setMessage("فيه توليد شغّال بالفعل لهذه الزيادة.");
      } else if (result.status === "unavailable") {
        setMessage(result.message);
      }
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  if (increments.length === 0) {
    return (
      <EmptyState
        icon={<GitBranch className="size-6" />}
        title="لا توجد زيادات بعد"
        description="أي اجتماع جديد أو جلسة اكتشاف أو قرار يضيف معلومة جديدة للـ Project Brain هيظهر هنا كزيادة مستقلة، وتقدر تولّد له قسم PRD خاص به من غير ما تعيد بناء المستند."
      />
    );
  }

  return (
    <div className="flex flex-col gap-[var(--v-space-4)]">
      <div className="flex flex-wrap items-center justify-between gap-[var(--v-space-2)]">
        <div>
          <h3 className="text-[1.0625rem] font-semibold text-[var(--v-text)]">
            الزيادات ({increments.length})
          </h3>
          <p className="text-[0.875rem] text-[var(--v-text-secondary)]">
            كل زيادة بتضيف جزءها الخاص للمستند — المحتوى القائم ما بيتغيّرش.
          </p>
        </div>
      </div>

      {message ? (
        <div className="flex items-center gap-[var(--v-space-2)] rounded-[var(--v-radius-md)] border border-[var(--v-amber)]/30 bg-[var(--v-amber)]/10 px-[var(--v-space-3)] py-[var(--v-space-2)] text-[0.875rem] text-[var(--v-amber)]">
          <TriangleAlert className="size-4 shrink-0" />
          <span>{message}</span>
        </div>
      ) : null}

      <ul className="flex flex-col gap-[var(--v-space-3)]">
        {increments.map((inc) => (
          <IncrementCard
            key={inc.id}
            increment={inc}
            section={sectionByIncrement.get(inc.id) ?? null}
            busy={busyId === inc.id}
            onGenerate={() => handleGenerate(inc.id)}
          />
        ))}
      </ul>
    </div>
  );
}

function IncrementCard({
  increment,
  section,
  busy,
  onGenerate,
}: {
  increment: ProjectIncrement;
  section: PrdIncrementSection | null;
  busy: boolean;
  onGenerate: () => void;
}) {
  const [open, setOpen] = useState(false);
  const generating = section?.status === "generating";
  const ready = section?.status === "ready";

  const deltaEntries = Object.entries(increment.delta ?? {}).filter(
    ([, items]) => Array.isArray(items) && items.length > 0
  ) as [BrainSectionKey, unknown[]][];

  return (
    <li className="rounded-[var(--v-radius-lg)] border border-[var(--v-border)] bg-[var(--v-surface)] p-[var(--v-space-4)]">
      <div className="flex flex-wrap items-start justify-between gap-[var(--v-space-3)]">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-[var(--v-space-2)]">
            <span className="text-[0.875rem] font-mono text-[var(--v-text-secondary)]">
              #{increment.sequence_number}
            </span>
            <h4 className="text-[0.9375rem] font-semibold text-[var(--v-text)]">
              {increment.title}
            </h4>
            <Badge tone="neutral">
              {SOURCE_LABELS[increment.source_type] ?? increment.source_type}
            </Badge>
            <Badge tone={STATUS_TONES[increment.status] ?? "neutral"}>
              {STATUS_LABELS[increment.status] ?? increment.status}
            </Badge>
            <Badge tone="info">{increment.added_count} عنصر جديد</Badge>
          </div>
          <p className="mt-[var(--v-space-2)] text-[0.875rem] leading-relaxed text-[var(--v-text-secondary)]">
            {increment.summary}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-[var(--v-space-2)]">
          {ready ? (
            <Button variant="ghost" onClick={() => setOpen((v) => !v)}>
              <FileText className="size-4" />
              {open ? "إخفاء القسم" : "عرض قسم الـ PRD"}
            </Button>
          ) : null}
          <Button variant={ready ? "ghost" : "primary"} onClick={onGenerate} disabled={busy || generating}>
            {generating ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                جاري التوليد…
              </>
            ) : (
              <>
                <RefreshCw className="size-4" />
                {ready ? "إعادة توليد القسم" : "ولّد قسم PRD لهذه الزيادة"}
              </>
            )}
          </Button>
        </div>
      </div>

      {deltaEntries.length > 0 ? (
        <div className="mt-[var(--v-space-3)] flex flex-wrap gap-[var(--v-space-2)]">
          {deltaEntries.map(([key, items]) => (
            <span
              key={key}
              className="rounded-[var(--v-radius-sm)] bg-[var(--v-surface-2)] px-[var(--v-space-2)] py-[2px] text-[0.75rem] text-[var(--v-text-secondary)]"
            >
              {BRAIN_SECTION_LABELS[key] ?? key} +{items.length}
            </span>
          ))}
        </div>
      ) : null}

      {section?.status === "failed" && section.last_error ? (
        <div className="mt-[var(--v-space-3)] flex items-start gap-[var(--v-space-2)] rounded-[var(--v-radius-md)] border border-[var(--v-red)]/30 bg-[var(--v-red)]/10 px-[var(--v-space-3)] py-[var(--v-space-2)] text-[0.875rem] text-[var(--v-red)]">
          <TriangleAlert className="mt-[2px] size-4 shrink-0" />
          <span>{section.last_error}</span>
        </div>
      ) : null}

      {open && ready ? (
        <PrdSectionView data={section.content as PrdIncrementSectionData} />
      ) : null}
    </li>
  );
}

function PrdSectionView({ data }: { data: PrdIncrementSectionData }) {
  return (
    <div className="mt-[var(--v-space-4)] flex flex-col gap-[var(--v-space-4)] border-t border-[var(--v-border)] pt-[var(--v-space-4)]">
      <div>
        <div className="mb-[var(--v-space-2)] flex items-center gap-[var(--v-space-2)]">
          <h5 className="text-[0.875rem] font-semibold text-[var(--v-text)]">ملخّص الزيادة</h5>
          <AiBadge />
        </div>
        <p className="text-[0.875rem] leading-relaxed text-[var(--v-text-secondary)]">
          {data.summary}
        </p>
      </div>

      <ListBlock title="ما دخل النطاق" items={data.scope_added} />
      <ListBlock title="متطلبات وظيفية جديدة" items={data.functional_requirements} />
      <ListBlock title="متطلبات غير وظيفية جديدة" items={data.non_functional_requirements} />

      {data.user_stories.length > 0 ? (
        <div>
          <h5 className="mb-[var(--v-space-2)] text-[0.875rem] font-semibold text-[var(--v-text)]">
            قصص المستخدم
          </h5>
          <ul className="flex flex-col gap-[var(--v-space-2)]">
            {data.user_stories.map((story, i) => (
              <li
                key={i}
                className="rounded-[var(--v-radius-md)] bg-[var(--v-surface-2)] px-[var(--v-space-3)] py-[var(--v-space-2)] text-[0.875rem] text-[var(--v-text-secondary)]"
              >
                {story.role} — {story.want} — {story.benefit}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {data.acceptance_criteria.length > 0 ? (
        <div>
          <h5 className="mb-[var(--v-space-2)] text-[0.875rem] font-semibold text-[var(--v-text)]">
            معايير القبول
          </h5>
          <ul className="flex flex-col gap-[var(--v-space-2)]">
            {data.acceptance_criteria.map((ac, i) => (
              <li
                key={i}
                className="rounded-[var(--v-radius-md)] bg-[var(--v-surface-2)] px-[var(--v-space-3)] py-[var(--v-space-2)] text-[0.875rem] text-[var(--v-text-secondary)]"
              >
                {ac.given} / {ac.when} / {ac.then}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <ListBlock title="الأثر على الأجزاء القائمة" items={data.impact_on_existing} tone="warning" />
      <ListBlock title="مخاطر وافتراضات" items={data.risks_assumptions} />
      <ListBlock title="ما يجب اختباره لهذه الزيادة" items={data.test_focus} tone="info" />
    </div>
  );
}

function ListBlock({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone?: "warning" | "info";
}) {
  if (items.length === 0) return null;
  const bg =
    tone === "warning"
      ? "bg-[var(--v-warning-bg)] text-[var(--v-amber)]"
      : tone === "info"
        ? "bg-[var(--v-info)]/10 text-[var(--v-info)]"
        : "bg-[var(--v-surface-2)] text-[var(--v-text-secondary)]";
  return (
    <div>
      <h5 className="mb-[var(--v-space-2)] text-[0.875rem] font-semibold text-[var(--v-text)]">
        {title}
      </h5>
      <ul className="flex flex-col gap-[var(--v-space-1)]">
        {items.map((item, i) => (
          <li
            key={i}
            className={`rounded-[var(--v-radius-md)] px-[var(--v-space-3)] py-[var(--v-space-2)] text-[0.875rem] leading-relaxed ${bg}`}
          >
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
