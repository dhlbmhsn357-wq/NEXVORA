"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  generateFullPRD,
  regeneratePRDSection,
  editPRDSection,
  getPRDVersions,
  approvePRDAction,
} from "./prd-actions";
import { FileText, CheckCircle2 } from "lucide-react";
import { formatPRDAsMarkdown, downloadMarkdown } from "@/lib/prd/export";
import { toast } from "@/components/ui/Toaster";
import RegenerateConfirmDialog from "@/components/ui/RegenerateConfirmDialog";
import CompareModalShell from "@/components/ui/CompareModalShell";
import EditableSectionCard from "@/components/ui/EditableSectionCard";
import Badge, { type BadgeTone } from "@/components/ui/Badge";
import AiBadge from "@/components/ui/AiBadge";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import { PRD_SECTION_KEYS } from "@/lib/types/database";
import type {
  PRD,
  PRDSectionKey,
  PRDVersion,
  UserStory,
  AcceptanceCriterion,
  PRDBusinessRuleDetail,
  PRDSystemMessageDetail,
  PRDFlowSpecification,
} from "@/lib/types/database";
import { SYSTEM_MESSAGE_TYPE_LABELS, type SystemMessageType } from "@/lib/product-definition/business-rules-types";
import { groupFlowSpecificationsByFlow } from "@/lib/product-definition/flow-step-detail";
import { useBackgroundRefresh } from "@/lib/ui/use-background-refresh";

const sectionLabels: Record<PRDSectionKey, string> = {
  overview: "نظرة عامة",
  problem_statement: "بيان المشكلة",
  goals: "الأهداف",
  out_of_scope: "خارج النطاق",
  target_users: "المستخدمون المستهدفون",
  user_stories: "قصص المستخدم",
  acceptance_criteria: "معايير القبول",
  functional_requirements: "المتطلبات الوظيفية",
  non_functional_requirements: "المتطلبات غير الوظيفية",
  risks_assumptions: "المخاطر والافتراضات",
  success_metrics: "مؤشرات النجاح",
  // 0116 — أقسام مواصفة تنفيذية جديدة (زواعد العمل/رسائل النظام/تفاصيل
  // التدفقات). الليبل هنا للـ Compare View فقط حاليًا — واجهة تعديل/عرض
  // مخصّصة لها هتضاف في الجزء الثاني (UI)، مش List بسيط لأن شكل البيانات
  // مصفوفة كائنات مش نصوص.
  business_rules_detail: "قواعد العمل والحالات الخاصة",
  system_messages_detail: "رسائل النظام",
  flow_specifications: "مواصفات التدفقات التفصيلية",
};

type SectionType = "text" | "list" | "user_stories" | "acceptance_criteria" | "structured_detail";

const sectionTypes: Record<PRDSectionKey, SectionType> = {
  overview: "text",
  problem_statement: "text",
  goals: "list",
  out_of_scope: "list",
  target_users: "list",
  user_stories: "user_stories",
  acceptance_criteria: "acceptance_criteria",
  functional_requirements: "list",
  non_functional_requirements: "list",
  risks_assumptions: "list",
  success_metrics: "list",
  // "structured_detail": مصفوفة كائنات مُهيكلة (0116) — لها كارت عرض
  // مخصّص (StructuredSectionCard) بدل محرّر السطور النصية العام. القراءة
  // فقط دائمًا: التعديل الحقيقي بيحصل في تبويب "تعريف المنتج" (المصدر
  // الحي)، مش هنا — تعديلها هنا كنص كان هيكسر اتساقها مع الجداول المصدر.
  business_rules_detail: "structured_detail",
  system_messages_detail: "structured_detail",
  flow_specifications: "structured_detail",
};

/** الأقسام القابلة للعرض/التعديل بكارت SectionCard النصي العام. */
const EDITABLE_SECTION_KEYS = PRD_SECTION_KEYS.filter((k) => sectionTypes[k] !== "structured_detail");
/** الأقسام المُهيكلة (0116) — كارت عرض/تجميع مخصّص، للقراءة فقط + إعادة توليد. */
const STRUCTURED_SECTION_KEYS = PRD_SECTION_KEYS.filter((k) => sectionTypes[k] === "structured_detail");

export default function PRDPanel({
  projectId,
  projectName,
  prd,
  currentBrainVersion,
}: {
  projectId: string;
  projectName: string;
  prd: PRD | null;
  currentBrainVersion: number | null;
}) {
  const router = useRouter();
  const [generating, setGenerating] = useState(false);
  const [message, setMessage] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);
  const [showCompare, setShowCompare] = useState(false);
  const [versions, setVersions] = useState<PRDVersion[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [compareA, setCompareA] = useState<number | null>(null);
  const [compareB, setCompareB] = useState<number | null>(null);
  const [approving, setApproving] = useState(false);

  const isGenerating =
    prd?.sync_status === "generating" ||
    (generating && prd?.sync_status !== "failed" && prd?.sync_status !== "idle");
  const hasContent = !!(prd && (prd.overview || prd.version > 0));
  const isOutdated =
    hasContent &&
    prd &&
    currentBrainVersion !== null &&
    prd.generated_from_brain_version !== currentBrainVersion;

  const displayMessage = message || (prd?.sync_status === "failed" ? prd.last_error ?? "" : "");

  // تحديث دوري مُجمَّع: منسّق واحد لكل الصفحة بدل مؤقّت لكل لوحة، بيقف
  // لما التبويب يكون مخفي وبيبطّل خالص لو المهمة اتعلّقت.
  useBackgroundRefresh(prd?.sync_status === "generating");

  // Toast "تم الاستبدال" عند إعادة توليد ناجحة في الخلفية — بنراقب رقم
  // النسخة يزيد بعد ما كنا في حالة "جاري إعادة التوليد" (Ref، مش State
  // بيتزامن كل Render، عشان يفضل يشتغل مرة واحدة بس لحظة الانتقال).
  const pendingRegenRef = useRef(false);
  const lastVersionRef = useRef(prd?.version ?? 0);
  useEffect(() => {
    const currentVersion = prd?.version ?? 0;
    if (pendingRegenRef.current && prd?.sync_status === "idle" && currentVersion > lastVersionRef.current) {
      pendingRegenRef.current = false;
      toast.success("تم استبدال المحتوى — النسخة القديمة محفوظة.", {
        actionLabel: "مقارنة النسخ",
        onAction: handleOpenCompare,
      });
    }
    lastVersionRef.current = currentVersion;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prd?.version, prd?.sync_status]);

  async function runGenerate(isRegeneration: boolean) {
    setShowConfirm(false);
    setGenerating(true);
    setMessage("");
    if (isRegeneration) pendingRegenRef.current = true;
    const result = await generateFullPRD(projectId, isRegeneration);
    if (result.status === "insufficient_brain") {
      setMessage(result.message);
      setGenerating(false);
    } else if (result.status === "missing_requirements") {
      setMessage(result.message);
      setGenerating(false);
    } else if (result.status === "already_generating") {
      setMessage("فيه توليد شغال بالفعل، استنى يخلص.");
    }
    // "started" → التوليد بدأ في الخلفية؛ الـ Polling هيلتقط النتيجة.
    router.refresh();
  }

  function handleGenerateClick() {
    if (hasContent) {
      setShowConfirm(true);
    } else {
      runGenerate(false);
    }
  }

  async function handleOpenCompare() {
    setShowCompare(true);
    setLoadingVersions(true);
    const v = await getPRDVersions(projectId);
    setVersions(v);
    if (v.length >= 2) {
      setCompareA(v[1].version);
      setCompareB(v[0].version);
    }
    setLoadingVersions(false);
  }

  function handleExportMarkdown() {
    if (!prd) return;
    downloadMarkdown(`PRD-${projectName}.md`, formatPRDAsMarkdown(projectName, prd));
  }

  if (!prd || !hasContent) {
    return (
      <div>
        <EmptyState
          icon={<FileText size={28} />}
          title="لسه مفيش PRD لهذا المشروع"
          description="محتاج Project Brain يكون فيه ملخص أولاً (تبويب Project Brain)، وبعدين اضغط توليد."
          primaryAction={{ label: isGenerating ? "جاري التوليد…" : "Generate PRD", onClick: handleGenerateClick, loading: isGenerating }}
        />
        {displayMessage && <p className="mt-3 text-center text-xs text-[var(--v-amber)]">{displayMessage}</p>}
        {isGenerating && (
          <p className="mt-2 text-center text-xs text-[var(--v-text-muted)]">
            التوليد شغّال في الخلفية — تقدر تسيب الصفحة وترجع، مش هيضيع. ممكن ياخد لحد كام دقيقة لو الكوتة مزدحمة.
          </p>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--v-text-muted)]">
          <AiBadge />
          <Badge>نسخة {prd.version}</Badge>
          <Badge>{prd.status}</Badge>
          {prd.generated_from_brain_version !== null && <Badge>Brain v{prd.generated_from_brain_version}</Badge>}
          <span>آخر تحديث: {new Date(prd.updated_at).toLocaleString("ar-EG")}</span>
          {isOutdated && <Badge tone="warning">PRD Outdated</Badge>}
          {prd.sync_status === "failed" && <Badge tone="danger">فشلت آخر عملية</Badge>}
          {isGenerating && (
            <Badge tone="warning">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
              جاري التوليد…
            </Badge>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {prd.status === "draft" && (
            <Button
              variant="primary"
              size="md"
              icon={<CheckCircle2 size={16} />}
              loading={approving}
              disabled={isGenerating || approving}
              onClick={async () => {
                if (!confirm("بعد الاعتماد لن تستطيع تعديل هذه النسخة. سيُنشأ نسخة جديدة تلقائيًا لأي تعديل لاحق. متأكد؟")) return;
                setApproving(true);
                const res = await approvePRDAction(projectId);
                setApproving(false);
                if (res.ok) { toast.success("تم اعتماد PRD."); router.refresh(); }
                else toast.error(res.message);
              }}
            >
              اعتمد PRD
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={handleGenerateClick} loading={isGenerating}>
            Re-Generate
          </Button>
          <Button variant="outline" size="sm" onClick={handleOpenCompare}>
            Compare Versions
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportMarkdown}>
            Export Markdown
          </Button>
          <Link
            href={`/prd-print/${projectId}`}
            target="_blank"
            className="rounded-[var(--v-radius-md)] border border-[var(--v-border)] px-4 py-2 text-sm font-medium text-[var(--v-text)] transition hover:border-[var(--v-primary)]"
          >
            طباعة / تصدير PDF
          </Link>
        </div>
      </div>

      {message && (
        <div className="mb-4 rounded-[var(--v-radius-md)] border border-[var(--v-amber)]/30 bg-[var(--v-amber)]/10 p-3 text-xs text-[var(--v-amber)]">
          {message}
        </div>
      )}
      {prd.last_error && prd.sync_status === "failed" && (
        <div className="mb-4 rounded-[var(--v-radius-md)] border border-[var(--v-red)]/30 bg-[var(--v-red)]/10 p-3 text-xs text-[var(--v-red)]">
          {prd.last_error}
        </div>
      )}

      <div className="space-y-3">
        {EDITABLE_SECTION_KEYS.map((key) => (
          <SectionCard
            key={key}
            projectId={projectId}
            sectionKey={key}
            prd={prd}
            disabled={isGenerating}
            onChanged={() => router.refresh()}
          />
        ))}
        {STRUCTURED_SECTION_KEYS.map((key) => (
          <StructuredSectionCard
            key={key}
            projectId={projectId}
            sectionKey={key}
            prd={prd}
            disabled={isGenerating}
            onChanged={() => router.refresh()}
          />
        ))}
      </div>

      {showConfirm && (
        <RegenerateConfirmDialog
          title="يوجد PRD حالي (ربما فيه تعديلات يدوية)"
          message="التوليد الكامل الجديد هيستبدل المحتوى الحالي. النسخة الحالية هتفضل محفوظة بالكامل في سجل النسخ (Compare Versions) ومش هتضيع."
          outdatedWarning={
            isOutdated
              ? "تنبيه: Project Brain اتغيّر من آخر مرة اتولّد فيها PRD — النسخة الجديدة هتعتمد على البيانات الحالية للـ Brain، وممكن تختلف بشكل ملحوظ عن النسخة الحالية."
              : null
          }
          onCancel={() => setShowConfirm(false)}
          onConfirm={() => runGenerate(true)}
        />
      )}

      {showCompare && (
        <CompareModal
          versions={versions}
          loading={loadingVersions}
          compareA={compareA}
          compareB={compareB}
          setCompareA={setCompareA}
          setCompareB={setCompareB}
          onClose={() => setShowCompare(false)}
        />
      )}
    </div>
  );
}

function SectionCard({
  projectId,
  sectionKey,
  prd,
  disabled,
  onChanged,
}: {
  projectId: string;
  sectionKey: PRDSectionKey;
  prd: PRD;
  disabled: boolean;
  onChanged: () => void;
}) {
  const type = sectionTypes[sectionKey];

  return (
    <EditableSectionCard
      headerLabel={<span className="text-sm font-semibold text-[var(--v-text)]">{sectionLabels[sectionKey]}</span>}
      disabled={disabled}
      viewContent={<SectionView sectionKey={sectionKey} prd={prd} />}
      getInitialDraft={() => draftFromSection(sectionKey, prd)}
      onSave={async (draft) => {
        const value = parseDraft(type, draft);
        await editPRDSection(projectId, sectionKey, value);
        return { ok: true };
      }}
      onChanged={onChanged}
      regenerate={{
        label: "Re-Generate Section",
        regeneratingLabel: "جاري إعادة التوليد…",
        onRegenerate: async () => {
          await regeneratePRDSection(projectId, sectionKey);
        },
      }}
      hint={
        type !== "text" ? (
          <p className="text-[10px] text-[var(--v-text-muted)]">
            {type === "list" && "سطر واحد لكل عنصر."}
            {type === "user_stories" && "سطر واحد لكل قصة، بالصيغة: الدور | أريد | حتى"}
            {type === "acceptance_criteria" && "سطر واحد لكل معيار، بالصيغة: Given ... | When ... | Then ..."}
          </p>
        ) : undefined
      }
    />
  );
}

function SectionView({ sectionKey, prd }: { sectionKey: PRDSectionKey; prd: PRD }) {
  const type = sectionTypes[sectionKey];

  if (type === "text") {
    const value = prd[sectionKey] as string;
    return <p className="text-sm text-[var(--v-text)]">{value || "—"}</p>;
  }

  if (type === "list") {
    const items = prd[sectionKey] as string[];
    if (items.length === 0) return <p className="text-sm text-[var(--v-text-muted)]">لا يوجد محتوى في هذا القسم بعد.</p>;
    return (
      <ul className="list-disc space-y-1 pr-5 text-sm text-[var(--v-text)]">
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    );
  }

  if (type === "user_stories") {
    const items = prd.user_stories;
    if (items.length === 0) return <p className="text-sm text-[var(--v-text-muted)]">لا يوجد محتوى في هذا القسم بعد.</p>;
    return (
      <ul className="list-disc space-y-1 pr-5 text-sm text-[var(--v-text)]">
        {items.map((s, i) => (
          <li key={i}>
            {s.role}، {s.want}، {s.benefit}
          </li>
        ))}
      </ul>
    );
  }

  const items = prd.acceptance_criteria;
  if (items.length === 0) return <p className="text-sm text-[var(--v-text-muted)]">—</p>;
  return (
    <ul className="list-disc space-y-1 pr-5 text-sm text-[var(--v-text)]">
      {items.map((c, i) => (
        <li key={i}>
          <strong>Given</strong> {c.given} <strong>When</strong> {c.when} <strong>Then</strong> {c.then}
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Structured sections (0116) — business_rules_detail / system_messages_detail
// / flow_specifications. لقطات مُولَّدة بالذكاء الاصطناعي من الجداول الحية
// في "تعريف المنتج" وقت التوليد فقط (zero-invention) — للقراءة هنا، مفيش
// تعديل نصّي مباشر لأنه ما كانش هيرجع يحدّث الجداول المصدر. إعادة التوليد
// لسّه متاحة لأنها بتقرأ نفس الجداول من جديد وتبني القسم من واقعها الحالي.
// ---------------------------------------------------------------------------
const MESSAGE_TYPE_TONE: Record<SystemMessageType, BadgeTone> = {
  success: "success", error: "danger", info: "info", warning: "warning",
};

function StructuredSectionCard({
  projectId,
  sectionKey,
  prd,
  disabled,
  onChanged,
}: {
  projectId: string;
  sectionKey: PRDSectionKey;
  prd: PRD;
  disabled: boolean;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  async function handleRegenerate() {
    setRegenerating(true);
    await regeneratePRDSection(projectId, sectionKey);
    setRegenerating(false);
    onChanged();
  }

  const sourceLabel =
    sectionKey === "business_rules_detail" ? "قواعد العمل"
    : sectionKey === "system_messages_detail" ? "رسائل النظام"
    : "تدفّقات المستخدم";

  return (
    <div className="rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-bg)]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between p-3 text-right focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--v-primary)]"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-[var(--v-text)]">
          {sectionLabels[sectionKey]}
          <Badge tone="neutral">للقراءة فقط</Badge>
        </span>
        <span className="text-xs text-[var(--v-text-muted)]">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="border-t border-[var(--v-border)] p-3">
          <StructuredSectionView sectionKey={sectionKey} prd={prd} />

          <p className="mt-3 text-[11px] text-[var(--v-text-muted)]">
            المصدر: <b>{sourceLabel}</b> في تعريف المنتج — عدّل هناك ثم أعد توليد القسم.{" "}
            <a href={`?tab=definition`} className="text-[var(--v-primary)] hover:underline">فتح تعريف المنتج</a>
          </p>

          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={handleRegenerate}
              disabled={disabled || regenerating}
              className="rounded-[var(--v-radius-sm)] border border-[var(--v-border)] px-2 py-1 text-[11px] font-medium text-[var(--v-text)] hover:border-[var(--v-primary)] disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--v-primary)]"
            >
              {regenerating ? "جاري إعادة التوليد…" : "Re-Generate Section"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function StructuredSectionView({ sectionKey, prd }: { sectionKey: PRDSectionKey; prd: PRD }) {
  if (sectionKey === "business_rules_detail") {
    const items = prd.business_rules_detail;
    if (items.length === 0) {
      return (
        <p className="text-sm text-[var(--v-text-muted)]">
          لا توجد قواعد عمل مُوثّقة في وقت التوليد — أضفها في «تعريف المنتج» ثم أعد توليد هذا القسم.
        </p>
      );
    }
    return <BusinessRulesTable items={items} />;
  }

  if (sectionKey === "system_messages_detail") {
    const items = prd.system_messages_detail;
    if (items.length === 0) {
      return (
        <p className="text-sm text-[var(--v-text-muted)]">
          لا توجد رسائل نظام مُوثّقة في وقت التوليد — أضفها في «تعريف المنتج» ثم أعد توليد هذا القسم.
        </p>
      );
    }
    return <SystemMessagesTable items={items} />;
  }

  const items = prd.flow_specifications;
  if (items.length === 0) {
    return (
      <p className="text-sm text-[var(--v-text-muted)]">
        لا توجد تفاصيل تنفيذية موثّقة لأي خطوة تدفّق وقت التوليد — أضفها في «تعريف المنتج» (تفاصيل تنفيذية لكل
        خطوة) ثم أعد توليد هذا القسم.
      </p>
    );
  }
  return <FlowSpecificationsList items={items} />;
}

function BusinessRulesTable({ items }: { items: PRDBusinessRuleDetail[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-[var(--v-border)] text-right text-xs text-[var(--v-text-muted)]">
            <th className="p-2 font-medium">العنوان</th>
            <th className="p-2 font-medium">الشرط المُفعِّل</th>
            <th className="p-2 font-medium">القيمة الحدّية</th>
            <th className="p-2 font-medium">عند التجاوز</th>
            <th className="p-2 font-medium">من يطبّقها</th>
          </tr>
        </thead>
        <tbody>
          {items.map((b, i) => (
            <tr key={i} className="border-b border-[var(--v-border)] align-top last:border-0">
              <td className="p-2 font-medium text-[var(--v-text)]">{b.title || "—"}</td>
              <td className="p-2 text-[var(--v-text-secondary)]">{b.trigger_condition || "—"}</td>
              <td className="p-2 text-[var(--v-text-secondary)]">{b.threshold_value || "—"}</td>
              <td className="p-2 text-[var(--v-text-secondary)]">{b.on_violation || "—"}</td>
              <td className="p-2">
                <Badge tone={b.enforcement_point === "client" ? "info" : b.enforcement_point === "both" ? "warning" : "primary"}>
                  {b.enforcement_point}
                </Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SystemMessagesTable({ items }: { items: PRDSystemMessageDetail[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[480px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-[var(--v-border)] text-right text-xs text-[var(--v-text-muted)]">
            <th className="p-2 font-medium">الحدث</th>
            <th className="p-2 font-medium">النوع</th>
            <th className="p-2 font-medium">النص</th>
          </tr>
        </thead>
        <tbody>
          {items.map((m, i) => (
            <tr key={i} className="border-b border-[var(--v-border)] align-top last:border-0">
              <td className="p-2 font-medium text-[var(--v-text)]">{m.event_name || "—"}</td>
              <td className="p-2">
                <Badge tone={MESSAGE_TYPE_TONE[m.message_type]}>{SYSTEM_MESSAGE_TYPE_LABELS[m.message_type]}</Badge>
              </td>
              <td className="p-2 text-[var(--v-text-secondary)]">{m.message_text || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FlowSpecificationsList({ items }: { items: PRDFlowSpecification[] }) {
  const groups = groupFlowSpecificationsByFlow(items);
  return (
    <div className="space-y-4">
      {groups.map((g, gi) => (
        <div key={gi} className="rounded-[var(--v-radius-md)] border border-[var(--v-border)] p-2">
          <p className="mb-2 text-sm font-semibold text-[var(--v-text)]">{g.flowName}</p>
          <ul className="space-y-3">
            {g.items.map((f, i) => (
              <li key={i} className="border-t border-[var(--v-border)] pt-2 first:border-0 first:pt-0">
                <p className="text-xs text-[var(--v-text)]"><b>الخطوة:</b> {f.step_action || "—"}</p>
                {f.ui_elements.length > 0 && (
                  <div className="mt-1 overflow-x-auto">
                    <table className="w-full min-w-[420px] border-collapse text-[11px]">
                      <thead>
                        <tr className="border-b border-[var(--v-border)] text-right text-[var(--v-text-muted)]">
                          <th className="p-1 font-medium">الحقل</th>
                          <th className="p-1 font-medium">النوع</th>
                          <th className="p-1 font-medium">التحقق</th>
                        </tr>
                      </thead>
                      <tbody>
                        {f.ui_elements.map((el, ei) => (
                          <tr key={ei} className="border-b border-[var(--v-border)] last:border-0">
                            <td className="p-1 text-[var(--v-text-secondary)]">{el.field_name || "—"}</td>
                            <td className="p-1 text-[var(--v-text-secondary)]">{el.field_type || "—"}</td>
                            <td className="p-1 text-[var(--v-text-secondary)]">{el.validation_rule || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {f.success_message && (
                  <p className="mt-1 text-[11px] text-[var(--v-green)]"><b>رسالة نجاح:</b> {f.success_message}</p>
                )}
                {f.error_messages.length > 0 && (
                  <ul className="mt-1 space-y-0.5">
                    {f.error_messages.map((err, ei) => (
                      <li key={ei} className="text-[11px] text-[var(--v-red)]"><b>رسالة خطأ:</b> {err}</li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function draftFromSection(sectionKey: PRDSectionKey, prd: PRD): string {
  const type = sectionTypes[sectionKey];
  if (type === "text") return prd[sectionKey] as string;
  if (type === "list") return (prd[sectionKey] as string[]).join("\n");
  if (type === "user_stories")
    return prd.user_stories.map((s) => `${s.role} | ${s.want} | ${s.benefit}`).join("\n");
  return prd.acceptance_criteria.map((c) => `Given ${c.given} | When ${c.when} | Then ${c.then}`).join("\n");
}

function parseDraft(type: SectionType, draft: string): unknown {
  const lines = draft.split("\n").map((l) => l.trim()).filter(Boolean);

  if (type === "text") return draft.trim();
  if (type === "list") return lines;

  if (type === "user_stories") {
    return lines.map((line): UserStory => {
      const [role, want, benefit] = line.split("|").map((p) => p.trim());
      return { role: role ?? "", want: want ?? "", benefit: benefit ?? "" };
    });
  }

  return lines.map((line): AcceptanceCriterion => {
    const given = line.match(/Given\s+(.*?)\s*\|/)?.[1] ?? "";
    const when = line.match(/When\s+(.*?)\s*\|/)?.[1] ?? "";
    const then = line.match(/Then\s+(.*)$/)?.[1] ?? "";
    return { given, when, then };
  });
}

function CompareModal({
  versions,
  loading,
  compareA,
  compareB,
  setCompareA,
  setCompareB,
  onClose,
}: {
  versions: PRDVersion[];
  loading: boolean;
  compareA: number | null;
  compareB: number | null;
  setCompareA: (v: number) => void;
  setCompareB: (v: number) => void;
  onClose: () => void;
}) {
  return (
    <CompareModalShell
      versions={versions}
      loading={loading}
      compareA={compareA}
      compareB={compareB}
      setCompareA={setCompareA}
      setCompareB={setCompareB}
      onClose={onClose}
    >
      {(versionA, versionB) => (
        <div className="space-y-3">
          {PRD_SECTION_KEYS.map((key) => {
            const oldVal = JSON.stringify(versionA[key]);
            const newVal = JSON.stringify(versionB[key]);
            if (oldVal === newVal) return null;
            return (
              <div key={key} className="rounded-[var(--v-radius-md)] border border-[var(--v-border)] p-2">
                <p className="text-xs font-semibold text-[var(--v-text)]">
                  {sectionLabels[key]} — تغيّر
                </p>
                <div className="mt-1 grid grid-cols-1 gap-2 md:grid-cols-2">
                  <div className="rounded bg-[var(--v-red)]/5 p-2 text-[11px] text-[var(--v-text-secondary)]">
                    نسخة {versionA.version}: {formatDiffValue(versionA[key])}
                  </div>
                  <div className="rounded bg-[var(--v-green)]/5 p-2 text-[11px] text-[var(--v-text-secondary)]">
                    نسخة {versionB.version}: {formatDiffValue(versionB[key])}
                  </div>
                </div>
              </div>
            );
          })}
          {PRD_SECTION_KEYS.every((key) => JSON.stringify(versionA[key]) === JSON.stringify(versionB[key])) && (
            <p className="text-xs text-[var(--v-text-muted)]">لا يوجد فرق بين النسختين.</p>
          )}
        </div>
      )}
    </CompareModalShell>
  );
}

function formatDiffValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (Array.isArray(value)) {
    if (value.length === 0) return "—";
    return value
      .map((v) => (typeof v === "string" ? v : JSON.stringify(v)))
      .join(" · ");
  }
  return String(value);
}
