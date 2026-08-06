"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  RefreshCw,
  Sparkles,
  Pencil,
  User,
  Building2,
  MessageSquareText,
  ListChecks,
  CalendarClock,
  HelpCircle,
  FileWarning,
  ShieldCheck,
  ShieldAlert,
  Target,
  ClipboardList,
} from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import Modal from "@/components/ui/Modal";
import Tooltip from "@/components/ui/Tooltip";
import EmptyState from "@/components/ui/EmptyState";
import { toast } from "@/components/ui/Toaster";
import {
  regenerateMeetingPreparation,
  regenerateMeetingPrepSectionAction,
  saveMeetingPrepSectionEdit,
} from "./meeting-prep-actions";
import MeetingPrepEssentialsPanel from "./meeting-prep-essentials-panel";
import MeetingAttachmentsPanel from "./meeting-attachments-panel";
import type { MeetingAttachment, MeetingPrepParticipant, MeetingRequiredItem } from "@/lib/types/database";
import {
  MEETING_PREP_SECTIONS,
  MEETING_PREP_SECTION_LABELS,
  type AgendaItem,
  type ConversationSimulationContent,
  type CustomerProfileContent,
  type BusinessUnderstandingContent,
  type MeetingObjectivesContent,
  type SuggestedAgendaContent,
  type SmartQuestionsContent,
  type MissingInfoChecklistContent,
  type DecisionChecklistContent,
  type RiskDiscussionContent,
  type ScopeProtectionContent,
  type SuccessCriteriaContent,
  type FollowUpChecklistContent,
  type MeetingPrepSectionKey,
  type MeetingPreparationRow,
  type MeetingPrepSections,
  type PriorityLevel,
} from "@/lib/meeting-prep/types";

const PRIORITY_LABELS: Record<PriorityLevel, string> = { high: "عالية", medium: "متوسطة", low: "منخفضة" };
const PRIORITY_TONE: Record<PriorityLevel, "danger" | "warning" | "neutral"> = {
  high: "danger",
  medium: "warning",
  low: "neutral",
};

const SECTION_ICONS: Record<MeetingPrepSectionKey, React.ReactNode> = {
  executive_brief: <Sparkles size={15} />,
  customer_profile: <User size={15} />,
  business_understanding: <Building2 size={15} />,
  meeting_objectives: <Target size={15} />,
  suggested_agenda: <CalendarClock size={15} />,
  conversation_simulation: <MessageSquareText size={15} />,
  smart_questions: <HelpCircle size={15} />,
  missing_information_checklist: <FileWarning size={15} />,
  decision_checklist: <ListChecks size={15} />,
  risk_discussion: <ShieldAlert size={15} />,
  scope_protection: <ShieldCheck size={15} />,
  success_criteria: <ClipboardList size={15} />,
  follow_up_checklist: <ClipboardList size={15} />,
};

function confidenceTone(score: number): "success" | "warning" | "danger" {
  if (score >= 75) return "success";
  if (score >= 50) return "warning";
  return "danger";
}

function ConfidenceBadge({ score, reason }: { score: number; reason: string | null }) {
  const tone = confidenceTone(score);
  return (
    <Tooltip label={reason ?? `ثقة ${score}%`}>
      <span
        className={`inline-flex cursor-help items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
          tone === "success"
            ? "bg-[var(--v-green)]/10 text-[var(--v-green)]"
            : tone === "warning"
              ? "bg-[var(--v-amber)]/10 text-[var(--v-amber)]"
              : "bg-[var(--v-red)]/10 text-[var(--v-red)]"
        }`}
      >
        ثقة {score}%
      </span>
    </Tooltip>
  );
}

function EmptyRow() {
  return <p className="text-xs text-[var(--v-text-subtle)]">لا توجد عناصر مسجّلة.</p>;
}
function ItemRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-bg-soft)] p-2.5">
      {children}
    </div>
  );
}

// ============================================================
// عرض محتوى كل قسم من الـ13
// ============================================================

function renderContent(key: MeetingPrepSectionKey, content: unknown): React.ReactNode {
  if (content === null || content === undefined) {
    return <p className="text-xs text-[var(--v-text-subtle)]">لا يوجد محتوى بعد — جرّب إعادة التوليد.</p>;
  }

  switch (key) {
    case "executive_brief": {
      const c = content as string;
      return <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--v-text)]">{c}</p>;
    }
    case "customer_profile": {
      const c = content as CustomerProfileContent;
      return (
        <div className="space-y-2">
          <Field label="مين العميل" value={c.who} />
          <Field label="طبيعة الشركة" value={c.company_nature} />
          <Field label="حجم الشركة" value={c.company_size} />
          <Field label="إيه اللي عايز يحققه" value={c.what_they_want_to_achieve} />
        </div>
      );
    }
    case "business_understanding": {
      const c = content as BusinessUnderstandingContent;
      return (
        <div className="space-y-2">
          <Field label="إزاي البيزنس شغال" value={c.how_it_works} />
          <Field label="الـ Workflow الحالي" value={c.current_workflow} />
          {c.pain_points.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold text-[var(--v-text-subtle)]">نقاط الألم</p>
              <ul className="ms-4 mt-0.5 list-disc text-sm text-[var(--v-text)]">
                {c.pain_points.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      );
    }
    case "meeting_objectives": {
      const c = content as MeetingObjectivesContent;
      return c.objectives.length === 0 ? (
        <EmptyRow />
      ) : (
        <ul className="ms-4 list-disc space-y-1 text-sm text-[var(--v-text)]">
          {c.objectives.map((o, i) => (
            <li key={i}>{o}</li>
          ))}
        </ul>
      );
    }
    case "suggested_agenda": {
      const c = content as SuggestedAgendaContent;
      return (
        <div className="space-y-2">
          {c.items.map((item: AgendaItem, i) => (
            <ItemRow key={i}>
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium text-[var(--v-text)]">{item.title}</p>
                <span className="shrink-0 font-mono-plex text-[11px] text-[var(--v-text-muted)]">
                  {item.duration_minutes} د
                </span>
              </div>
              <p className="mt-0.5 text-xs text-[var(--v-text-muted)]">{item.description}</p>
            </ItemRow>
          ))}
          <p className="text-end text-[11px] text-[var(--v-text-subtle)]">
            الإجمالي: {c.total_minutes} دقيقة
          </p>
        </div>
      );
    }
    case "conversation_simulation": {
      const c = content as ConversationSimulationContent;
      return (
        <div className="space-y-4">
          <div className="space-y-1.5">
            {c.dialogue.map((turn, i) => (
              <div
                key={i}
                className={`max-w-[85%] rounded-[var(--v-radius-md)] px-3 py-1.5 text-sm ${
                  turn.speaker === "pm"
                    ? "me-auto bg-[var(--v-primary)]/10 text-[var(--v-text)]"
                    : "ms-auto bg-[var(--v-surface)] text-[var(--v-text)]"
                }`}
              >
                <p className="mb-0.5 text-[10px] font-semibold text-[var(--v-text-subtle)]">
                  {turn.speaker === "pm" ? "PM" : "العميل"}
                </p>
                {turn.line}
              </div>
            ))}
          </div>
          {c.branches.length > 0 && (
            <div>
              <p className="mb-1 text-[11px] font-semibold text-[var(--v-text-subtle)]">
                إرشادات المواقف المحتملة
              </p>
              <div className="space-y-1.5">
                {c.branches.map((b, i) => (
                  <ItemRow key={i}>
                    <p className="text-xs font-semibold text-[var(--v-primary)]">{b.trigger}</p>
                    <p className="mt-0.5 text-sm text-[var(--v-text)]">{b.guidance}</p>
                  </ItemRow>
                ))}
              </div>
            </div>
          )}
        </div>
      );
    }
    case "smart_questions": {
      const c = content as SmartQuestionsContent;
      return c.items.length === 0 ? (
        <EmptyRow />
      ) : (
        <div className="space-y-1.5">
          {c.items.map((it, i) => (
            <ItemRow key={i}>
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm text-[var(--v-text)]">{it.question}</p>
                <Badge tone={PRIORITY_TONE[it.priority]}>{PRIORITY_LABELS[it.priority]}</Badge>
              </div>
              <p className="mt-0.5 text-xs text-[var(--v-text-muted)]">{it.reason}</p>
            </ItemRow>
          ))}
        </div>
      );
    }
    case "missing_information_checklist": {
      const c = content as MissingInfoChecklistContent;
      return c.items.length === 0 ? (
        <EmptyRow />
      ) : (
        <div className="space-y-1.5">
          {c.items.map((it, i) => (
            <ItemRow key={i}>
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm text-[var(--v-text)]">{it.info}</p>
                <Badge tone={PRIORITY_TONE[it.priority]}>{PRIORITY_LABELS[it.priority]}</Badge>
              </div>
              <p className="mt-0.5 text-xs text-[var(--v-text-muted)]">{it.why_needed}</p>
            </ItemRow>
          ))}
        </div>
      );
    }
    case "decision_checklist": {
      const c = content as DecisionChecklistContent;
      return c.items.length === 0 ? (
        <EmptyRow />
      ) : (
        <div className="space-y-1.5">
          {c.items.map((it, i) => (
            <ItemRow key={i}>
              <p className="text-sm font-medium text-[var(--v-text)]">{it.decision}</p>
              <p className="mt-0.5 text-xs text-[var(--v-text-muted)]">{it.why_critical}</p>
            </ItemRow>
          ))}
        </div>
      );
    }
    case "risk_discussion": {
      const c = content as RiskDiscussionContent;
      return c.items.length === 0 ? (
        <EmptyRow />
      ) : (
        <div className="space-y-1.5">
          {c.items.map((it, i) => (
            <ItemRow key={i}>
              <p className="text-sm font-medium text-[var(--v-text)]">{it.risk}</p>
              <p className="mt-0.5 text-xs text-[var(--v-text-muted)]">{it.why_discuss_now}</p>
            </ItemRow>
          ))}
        </div>
      );
    }
    case "scope_protection": {
      const c = content as ScopeProtectionContent;
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <p className="mb-1 text-[11px] font-semibold text-[var(--v-text-subtle)]">تكتيكات</p>
            <ul className="ms-4 list-disc text-sm text-[var(--v-text)]">
              {c.tactics.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
          </div>
          <div>
            <p className="mb-1 text-[11px] font-semibold text-[var(--v-text-subtle)]">عبارات مقترحة</p>
            <ul className="ms-4 list-disc text-sm text-[var(--v-text)]">
              {c.suggested_phrases.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ul>
          </div>
        </div>
      );
    }
    case "success_criteria": {
      const c = content as SuccessCriteriaContent;
      return c.criteria.length === 0 ? (
        <EmptyRow />
      ) : (
        <ul className="ms-4 list-disc space-y-1 text-sm text-[var(--v-text)]">
          {c.criteria.map((cr, i) => (
            <li key={i}>{cr}</li>
          ))}
        </ul>
      );
    }
    case "follow_up_checklist": {
      const c = content as FollowUpChecklistContent;
      const ownerLabel: Record<string, string> = { pm: "PM", client: "العميل", team: "الفريق" };
      return c.items.length === 0 ? (
        <EmptyRow />
      ) : (
        <div className="space-y-1.5">
          {c.items.map((it, i) => (
            <ItemRow key={i}>
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm text-[var(--v-text)]">{it.action}</p>
                <Badge tone="neutral">{ownerLabel[it.owner]}</Badge>
              </div>
            </ItemRow>
          ))}
        </div>
      );
    }
    default:
      return null;
  }
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-semibold text-[var(--v-text-subtle)]">{label}</p>
      <p className="mt-0.5 text-sm text-[var(--v-text)]">{value}</p>
    </div>
  );
}

// ============================================================
// كارت قسم واحد — قابل لإعادة التوليد وللتعديل اليدوي
// ============================================================

function SectionEditModal({
  open,
  onClose,
  projectId,
  sectionKey,
  content,
  expectedUpdatedAt,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
  sectionKey: MeetingPrepSectionKey;
  content: unknown;
  expectedUpdatedAt: string;
  onSaved: () => void;
}) {
  const [text, setText] = useState(() => JSON.stringify(content, null, 2));
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      setError("الصيغة غير صحيحة — لازم JSON صالح.");
      return;
    }
    setError(null);
    setSaving(true);
    const result = await saveMeetingPrepSectionEdit({
      projectId,
      sectionKey,
      newContent: parsed,
      expectedUpdatedAt,
      reason: reason.trim() || null,
    });
    setSaving(false);
    if (!result.ok) {
      toast.error(result.message ?? "فشل الحفظ.");
      return;
    }
    toast.success("تم حفظ التعديل.");
    onSaved();
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} maxWidth="max-w-2xl">
      <p className="text-sm font-semibold text-[var(--v-text)]">
        تعديل: {MEETING_PREP_SECTION_LABELS[sectionKey]}
      </p>
      <p className="mt-1 text-xs text-[var(--v-text-muted)]">
        عدّل المحتوى بصيغة JSON مباشرة. أي خطأ في الصيغة هيمنع الحفظ.
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        dir="ltr"
        className="mt-3 h-64 w-full resize-y rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-bg-soft)] p-2.5 font-mono-plex text-xs text-[var(--v-text)] focus:border-[var(--v-primary)] focus:outline-none"
      />
      {error && <p className="mt-1 text-xs text-[var(--v-red)]">{error}</p>}
      <input
        type="text"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="سبب التعديل (اختياري)"
        className="mt-2 w-full rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-bg-soft)] px-3 py-2 text-sm text-[var(--v-text)] focus:border-[var(--v-primary)] focus:outline-none"
      />
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onClose}>
          إلغاء
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={handleSave}
          disabled={saving}
          icon={saving ? <Loader2 size={13} className="animate-spin" /> : undefined}
        >
          حفظ
        </Button>
      </div>
    </Modal>
  );
}

function SectionCard({
  projectId,
  sectionKey,
  section,
  documentUpdatedAt,
  isAdmin,
  onChanged,
}: {
  projectId: string;
  sectionKey: MeetingPrepSectionKey;
  section: { meta: { status: string; confidence: number; confidence_reason: string | null; error_message?: string | null }; content: unknown } | undefined;
  documentUpdatedAt: string;
  isAdmin: boolean;
  onChanged: () => void;
}) {
  const router = useRouter();
  const [regenerating, setRegenerating] = useState(false);
  const [editing, setEditing] = useState(false);

  async function handleRegenerate() {
    setRegenerating(true);
    const result = await regenerateMeetingPrepSectionAction(projectId, sectionKey);
    setRegenerating(false);
    if (!result.ok) {
      toast.error(result.message ?? "فشلت إعادة التوليد.");
      return;
    }
    toast.success("تم توليد القسم من جديد.");
    onChanged();
  }

  const failed = section?.meta.status === "failed";
  const manuallyEdited = section?.meta.status === "manual_edit";

  return (
    <Card padding="md" animate={false}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-[var(--v-primary)]">{SECTION_ICONS[sectionKey]}</span>
          <p className="text-sm font-semibold text-[var(--v-text)]">
            {MEETING_PREP_SECTION_LABELS[sectionKey]}
          </p>
          {section && !failed && (
            <ConfidenceBadge score={section.meta.confidence} reason={section.meta.confidence_reason} />
          )}
          {manuallyEdited && <Badge tone="info">معدَّل يدويًا</Badge>}
          {failed && <Badge tone="danger">فشل التوليد</Badge>}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {section?.content !== undefined && section?.content !== null && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded-[var(--v-radius-sm)] p-1.5 text-[var(--v-text-muted)] hover:bg-[var(--v-surface)] hover:text-[var(--v-text)]"
              title="تعديل يدوي"
            >
              <Pencil size={14} />
            </button>
          )}
          {isAdmin && (
            <button
              type="button"
              onClick={handleRegenerate}
              disabled={regenerating}
              className="rounded-[var(--v-radius-sm)] p-1.5 text-[var(--v-text-muted)] hover:bg-[var(--v-surface)] hover:text-[var(--v-text)] disabled:opacity-50"
              title="إعادة توليد هذا القسم"
            >
              {regenerating ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <RefreshCw size={14} />
              )}
            </button>
          )}
        </div>
      </div>

      <div className="mt-3">
        {failed ? (
          <p className="text-xs text-[var(--v-red)]">{section?.meta.error_message ?? "خطأ غير معروف."}</p>
        ) : (
          renderContent(sectionKey, section?.content)
        )}
      </div>

      {editing && section && (
        <SectionEditModal
          open={editing}
          onClose={() => setEditing(false)}
          projectId={projectId}
          sectionKey={sectionKey}
          content={section.content}
          expectedUpdatedAt={documentUpdatedAt}
          onSaved={() => {
            router.refresh();
            onChanged();
          }}
        />
      )}
    </Card>
  );
}

// ============================================================
// المكوّن الرئيسي
// ============================================================

export default function MeetingPrepPanel({
  projectId,
  prep,
  participants,
  requiredItems,
  attachments,
  isAdmin,
}: {
  projectId: string;
  prep: MeetingPreparationRow | null;
  participants: MeetingPrepParticipant[];
  requiredItems: MeetingRequiredItem[];
  attachments: MeetingAttachment[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [regeneratingAll, setRegeneratingAll] = useState(false);

  async function handleRegenerateAll() {
    setRegeneratingAll(true);
    const result = await regenerateMeetingPreparation(projectId);
    setRegeneratingAll(false);
    if (!result.ok) {
      toast.error(result.message ?? "فشل بدء التوليد.");
      return;
    }
    toast.success("جاري إعادة توليد كل الأقسام…");
    router.refresh();
  }

  if (!prep) {
    return (
      <Card padding="lg">
        <EmptyState
          icon={<Sparkles size={28} />}
          title="لسه ما اتعملش تجهيز اجتماع"
          description="تجهيز الاجتماع بيتولّد تلقائيًا بعد اكتمال تحليل الاكتشاف بنجاح."
          primaryAction={
            isAdmin
              ? {
                  label: regeneratingAll ? "جاري…" : "شغّل التجهيز الآن",
                  onClick: handleRegenerateAll,
                  loading: regeneratingAll,
                }
              : undefined
          }
        />
      </Card>
    );
  }

  const sections = (prep.sections ?? {}) as Partial<
    Record<MeetingPrepSectionKey, { meta: { status: string; confidence: number; confidence_reason: string | null; error_message?: string | null }; content: unknown }>
  >;

  return (
    <div className="space-y-4">
      <Card padding="md">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles size={16} className="text-[var(--v-primary)]" />
              <p className="text-sm font-semibold text-[var(--v-text)]">تجهيز اجتماع الاكتشاف</p>
              <Badge
                tone={
                  prep.status === "ready"
                    ? "success"
                    : prep.status === "generating" || prep.status === "pending"
                      ? "info"
                      : "danger"
                }
              >
                {prep.status === "ready"
                  ? "جاهز"
                  : prep.status === "generating"
                    ? "جاري التوليد…"
                    : prep.status === "pending"
                      ? "بانتظار البدء"
                      : "فشل"}
              </Badge>
              {prep.status === "ready" && (
                <ConfidenceBadge score={prep.overall_confidence} reason={null} />
              )}
              {prep.version > 1 && (
                <span className="font-mono-plex text-[11px] text-[var(--v-text-subtle)]">
                  v{prep.version}
                </span>
              )}
            </div>
            <p className="mt-1 text-[11px] text-[var(--v-text-subtle)]">
              آخر تحديث: {new Date(prep.updated_at).toLocaleString("ar-EG")}
            </p>
          </div>

          {isAdmin && prep.status !== "generating" && (
            <Button
              variant="outline"
              size="sm"
              icon={regeneratingAll ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
              onClick={handleRegenerateAll}
              disabled={regeneratingAll}
            >
              إعادة توليد الكل
            </Button>
          )}
        </div>
      </Card>

      <MeetingPrepEssentialsPanel
        projectId={projectId}
        prep={prep}
        participants={participants}
        requiredItems={requiredItems}
        isAdmin={isAdmin}
      />
      <MeetingAttachmentsPanel projectId={projectId} meetingPreparationId={prep.id} attachments={attachments} />

      {prep.status === "generating" && (
        <Card padding="md">
          <div className="flex items-center gap-2 text-sm text-[var(--v-text-secondary)]">
            <Loader2 size={16} className="animate-spin text-[var(--v-primary)]" />
            <span>جاري توليد أقسام التجهيز الـ13 عبر AI — كل قسم بمولّده المستقل. اعمل تحديث للصفحة بعد شوية.</span>
          </div>
        </Card>
      )}

      {(prep.status === "ready" || prep.status === "failed") && (
        <div className="space-y-3">
          {MEETING_PREP_SECTIONS.map((key) => (
            <SectionCard
              key={key}
              projectId={projectId}
              sectionKey={key}
              section={sections[key]}
              documentUpdatedAt={prep.updated_at}
              isAdmin={isAdmin}
              onChanged={() => router.refresh()}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export type { MeetingPrepSections };
