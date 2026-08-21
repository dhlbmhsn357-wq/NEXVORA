"use client";

/**
 * NEXVORA "تغييرات العميل" (Client Changes) — Standard Product Package،
 * المرحلة د (الأخيرة). يظهر فقط لمشاريع workflow_mode === 'standard_based'
 * (راجع page.tsx). يحوي:
 *  - القسم الأول: طلبات التغيير (baseline label + counters + جدول + نموذج
 *    إنشاء + Modal عرض أثر التغيير كامل — Piece #2 + #3).
 *  - القسم الثاني: الملاءمة والفجوات (Fit/Gap) + تحويل إلى Full Discovery
 *    (Piece #5) — مدمج هنا كـ subtab بدل تبويب علوي منفصل، عمدًا (المواصفة
 *    الأصلية بتطلب "قسم على لوحة مشروع العميل"، مش تبويبًا مستقلًا).
 */
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Plus, Sparkles, Eye, CheckCircle2, XCircle, Copy, Wand2, AlertTriangle, Info,
} from "lucide-react";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Badge, { type BadgeTone } from "@/components/ui/Badge";
import Modal from "@/components/ui/Modal";
import Input from "@/components/ui/Input";
import Textarea from "@/components/ui/Textarea";
import Select from "@/components/ui/Select";
import EmptyState from "@/components/ui/EmptyState";
import { toast } from "@/components/ui/Toaster";
import SubTabs from "../sub-tabs";
import type {
  ChangeRequestRow, ChangeImpactRow,
  ChangeRequestType, ChangeRequestStatus,
  ImpactStatus,
} from "@/lib/sector-standards/change-request-types";
import type { ProjectStandardLink } from "@/lib/sector-standards/types";
import type { FitGapNotesRow } from "@/lib/sector-standards/fit-gap-types";
import type { PrototypeChangePromptRow } from "@/lib/sector-standards/prototype-prompt-types";
import {
  createChangeRequestAction, runImpactAnalysisAction, listChangeImpactsAction,
  reviewChangeImpactAction, applyApprovedImpactsAction,
} from "../change-request-actions";
import { generatePrototypeChangePromptAction, listPrototypeChangePromptsAction } from "../prototype-prompt-actions";
import { saveFitGapNotesAction, convertToFullDiscoveryAction } from "../fit-gap-actions";

// ---------------------------------------------------------------------------
// Labels / tones
// ---------------------------------------------------------------------------
const CR_TYPE_LABELS: Record<ChangeRequestType, string> = { add: "إضافة", modify: "تعديل", remove: "حذف" };
const CR_STATUS_LABELS: Record<ChangeRequestStatus, string> = {
  draft: "مسودة", analyzing: "جارٍ التحليل", needs_review: "بانتظار المراجعة",
  approved: "مُعتمَد", applied: "مُطبَّق", rejected: "مرفوض",
};
const CR_STATUS_TONE: Record<ChangeRequestStatus, BadgeTone> = {
  draft: "neutral", analyzing: "info", needs_review: "warning",
  approved: "info", applied: "success", rejected: "danger",
};
const IMPACT_STATUS_LABELS: Record<ImpactStatus, string> = {
  proposed: "مقترح", approved: "مُعتمَد", rejected: "مرفوض", applied: "مُطبَّق",
};
const IMPACT_STATUS_TONE: Record<ImpactStatus, BadgeTone> = {
  proposed: "warning", approved: "info", rejected: "danger", applied: "success",
};
const IMPACT_TYPE_LABELS: Record<string, string> = { add: "إضافة", modify: "تعديل", remove: "حذف" };
const ARTIFACT_TYPE_LABELS: Record<string, string> = {
  requirement: "متطلب", user_story: "قصة مستخدم", acceptance_criteria: "معيار قبول",
  business_rule: "قاعدة عمل", system_message: "رسالة نظام", prd_section: "قسم PRD",
  decision: "قرار", state_machine: "آلة حالة", persona: "شخصية مستخدم", user_flow: "تدفق مستخدم",
};
function artifactTypeLabel(t: string): string {
  return ARTIFACT_TYPE_LABELS[t] ?? t;
}

const PROPOSED_FIELD_LABELS: Record<string, Record<string, string>> = {
  requirement: {
    title: "العنوان", description: "الوصف", requirementType: "النوع", priority: "الأولوية",
    status: "الحالة", rationale: "المبرر", acceptanceHint: "تلميح القبول", effortEstimate: "تقدير الجهد",
  },
  user_story: { title: "العنوان", asA: "بصفتي", iWant: "أريد", soThat: "لكي", status: "الحالة" },
  acceptance_criteria: {
    userStoryId: "معرّف القصة", title: "العنوان", givenClause: "بفرض", whenClause: "عندما", thenClause: "فإن",
  },
  business_rule: {
    title: "العنوان", triggerCondition: "شرط التفعيل", thresholdValue: "القيمة الحدية",
    onViolation: "عند المخالفة", enforcementPoint: "نقطة التطبيق",
  },
  system_message: { eventName: "اسم الحدث", messageType: "نوع الرسالة", messageText: "نص الرسالة" },
};

function renderProposedChange(artifactType: string, pc: Record<string, unknown>): { label: string; value: string }[] {
  const fieldLabels = PROPOSED_FIELD_LABELS[artifactType] ?? {};
  return Object.entries(pc)
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([k, v]) => ({
      label: fieldLabels[k] ?? k,
      value: typeof v === "string" ? v : JSON.stringify(v),
    }));
}

// ---------------------------------------------------------------------------
// Root panel
// ---------------------------------------------------------------------------
export interface ClientChangesPanelProps {
  projectId: string;
  standardLink: ProjectStandardLink | null;
  standardLabel: string | null;
  changeRequests: ChangeRequestRow[];
  fitGapNotes: FitGapNotesRow | null;
  canWrite: boolean;
}

export default function ClientChangesPanel({
  projectId, standardLink, standardLabel, changeRequests, fitGapNotes, canWrite,
}: ClientChangesPanelProps) {
  return (
    <SubTabs
      ariaLabel="أقسام تغييرات العميل"
      sections={[
        {
          key: "",
          label: `طلبات التغيير (${changeRequests.length})`,
          content: (
            <ChangeRequestsSection
              projectId={projectId}
              standardLink={standardLink}
              standardLabel={standardLabel}
              changeRequests={changeRequests}
              canWrite={canWrite}
            />
          ),
        },
        {
          key: "fit-gap",
          label: "الملاءمة والفجوات",
          content: <FitGapSection projectId={projectId} notes={fitGapNotes} canWrite={canWrite} />,
        },
      ]}
    />
  );
}

// ---------------------------------------------------------------------------
// طلبات التغيير — Piece #2
// ---------------------------------------------------------------------------
function ChangeRequestsSection({
  projectId, standardLink, standardLabel, changeRequests, canWrite,
}: {
  projectId: string;
  standardLink: ProjectStandardLink | null;
  standardLabel: string | null;
  changeRequests: ChangeRequestRow[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [viewing, setViewing] = useState<ChangeRequestRow | null>(null);

  function run(fn: () => Promise<{ ok: true } | { ok: false; message: string }>, okMsg: string) {
    startTransition(async () => {
      const res = await fn();
      if (res.ok) { toast.success(okMsg); router.refresh(); }
      else toast.error(res.message);
    });
  }

  async function handleAnalyze(cr: ChangeRequestRow) {
    setAnalyzingId(cr.id);
    const res = await runImpactAnalysisAction(projectId, cr.id);
    setAnalyzingId(null);
    if (!res.ok) { toast.error(res.message); return; }
    toast.success(`تم التحليل — ${res.data?.length ?? 0} عنصر أثر مقترَح`);
    router.refresh();
  }

  const counters = {
    add: changeRequests.filter((c) => c.type === "add").length,
    modify: changeRequests.filter((c) => c.type === "modify").length,
    remove: changeRequests.filter((c) => c.type === "remove").length,
    pendingReview: changeRequests.filter((c) => ["draft", "analyzing", "needs_review"].includes(c.status)).length,
  };

  return (
    <div className="space-y-6">
      {standardLabel && (
        <div className="flex items-center gap-2 rounded-[var(--v-radius-md)] border border-[var(--v-primary)]/30 bg-[var(--v-primary-tint)] px-3 py-2 text-sm text-[var(--v-primary)]">
          <Info size={14} />
          <span>مبني على: {standardLabel}</span>
          {standardLink && (
            <span className="text-[11px] text-[var(--v-text-muted)]">
              (اسُتنسخ في {new Date(standardLink.clonedAt).toLocaleDateString("ar-EG")})
            </span>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="إضافة" value={`${counters.add}`} tone="info" />
        <Tile label="تعديل" value={`${counters.modify}`} tone="warning" />
        <Tile label="حذف" value={`${counters.remove}`} tone="danger" />
        <Tile label="بانتظار المراجعة" value={`${counters.pendingReview}`} tone="neutral" />
      </div>

      <Card>
        <Header
          title="طلبات التغيير"
          action={canWrite ? (
            <Button size="sm" variant="primary" icon={<Plus size={14} />} onClick={() => setCreating(true)}>
              طلب تغيير جديد
            </Button>
          ) : null}
        />
        {changeRequests.length === 0 ? (
          <EmptyState title="لا طلبات تغيير بعد" description="ابدأ بتسجيل أول فرق صريح عن الـ Sector Standard." />
        ) : (
          <ul className="divide-y divide-[var(--v-border)]">
            {changeRequests.map((cr) => (
              <li key={cr.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="neutral">{CR_TYPE_LABELS[cr.type]}</Badge>
                    <p className="font-medium text-[var(--v-text)]">{cr.title}</p>
                    <Badge tone={CR_STATUS_TONE[cr.status]}>{CR_STATUS_LABELS[cr.status]}</Badge>
                  </div>
                  {cr.description && (
                    <p className="mt-1 line-clamp-2 text-[12px] text-[var(--v-text-secondary)]">{cr.description}</p>
                  )}
                </div>
                <div className="flex shrink-0 flex-wrap gap-1">
                  {cr.status === "draft" && (
                    <Button
                      size="sm" variant="ghost" icon={<Sparkles size={14} />}
                      disabled={analyzingId === cr.id || pending}
                      onClick={() => handleAnalyze(cr)}
                    >
                      {analyzingId === cr.id ? "جارٍ التحليل..." : "تحليل الأثر"}
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" icon={<Eye size={14} />} onClick={() => setViewing(cr)}>
                    عرض
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <NewChangeRequestDialog
        open={creating}
        onClose={() => setCreating(false)}
        onSave={(input) => {
          run(() => createChangeRequestAction(projectId, input).then((r) => (r.ok ? { ok: true } : r)), "تم إنشاء طلب التغيير");
          setCreating(false);
        }}
      />

      {viewing && (
        <ChangeImpactViewModal
          projectId={projectId}
          changeRequest={viewing}
          canWrite={canWrite}
          onClose={() => setViewing(null)}
        />
      )}
    </div>
  );
}

function NewChangeRequestDialog({ open, onClose, onSave }: {
  open: boolean;
  onClose: () => void;
  onSave: (input: { type: ChangeRequestType; title: string; description?: string; sourceType?: string | null }) => void;
}) {
  const [type, setType] = useState<ChangeRequestType>("add");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [sourceType, setSourceType] = useState("");

  return (
    <Modal open={open} onClose={onClose} maxWidth="max-w-lg">
      <div className="space-y-4 p-6" dir="rtl">
        <h2 className="text-lg font-semibold text-[var(--v-text)]">طلب تغيير جديد</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="النوع">
            <Select value={type} onChange={(e) => setType(e.target.value as ChangeRequestType)}>
              <option value="add">إضافة</option>
              <option value="modify">تعديل</option>
              <option value="remove">حذف</option>
            </Select>
          </Field>
          <Field label="مصدر (اختياري)">
            <Input value={sourceType} onChange={(e) => setSourceType(e.target.value)} placeholder="مثال: اجتماع عميل" />
          </Field>
          <Field label="العنوان *" span={2}>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Field label="الوصف" span={2}>
            <Textarea rows={4} value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>إلغاء</Button>
          <Button
            variant="primary"
            disabled={!title.trim()}
            onClick={() => onSave({ type, title, description, sourceType: sourceType.trim() || null })}
          >
            حفظ
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Change Impact View — Piece #3
// ---------------------------------------------------------------------------
function ChangeImpactViewModal({ projectId, changeRequest, canWrite, onClose }: {
  projectId: string;
  changeRequest: ChangeRequestRow;
  canWrite: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [impacts, setImpacts] = useState<ChangeImpactRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState(false);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [prompts, setPrompts] = useState<PrototypeChangePromptRow[]>([]);
  const [generatingPrompt, setGeneratingPrompt] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [changeRequest.id]);

  async function loadAll() {
    setLoading(true);
    const [impactsRes, promptsRes] = await Promise.all([
      listChangeImpactsAction(changeRequest.id),
      listPrototypeChangePromptsAction(changeRequest.id),
    ]);
    if (impactsRes.ok) setImpacts(impactsRes.data ?? []);
    else toast.error(impactsRes.message);
    if (promptsRes.ok) setPrompts(promptsRes.data ?? []);
    setLoading(false);
  }

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleReview(impactId: string, status: "approved" | "rejected") {
    setReviewingId(impactId);
    const res = await reviewChangeImpactAction(impactId, status, projectId);
    setReviewingId(null);
    if (!res.ok) { toast.error(res.message); return; }
    toast.success(status === "approved" ? "تم الاعتماد" : "تم الرفض");
    await loadAll();
    router.refresh();
  }

  async function handleApply() {
    const ids = [...selected].filter((id) => impacts.find((i) => i.id === id)?.status === "approved" || impacts.find((i) => i.id === id)?.status === "proposed");
    if (ids.length === 0) { toast.error("اختر عنصرًا واحدًا على الأقل للاعتماد والتطبيق."); return; }
    setApplying(true);
    // اعتماد ما لسه "proposed" منها أولًا، ثم تطبيق الكل.
    for (const id of ids) {
      const impact = impacts.find((i) => i.id === id);
      if (impact?.status === "proposed") {
        await reviewChangeImpactAction(id, "approved", projectId);
      }
    }
    const res = await applyApprovedImpactsAction(changeRequest.id, ids, projectId);
    setApplying(false);
    if (!res.ok) { toast.error(res.message); return; }
    const { applied, failed } = res.data ?? { applied: 0, failed: [] };
    if (failed.length > 0) {
      toast.error(`تم تطبيق ${applied} · فشل ${failed.length}: ${failed[0]?.error ?? ""}`);
    } else {
      toast.success(`تم تطبيق ${applied} عنصر بنجاح`);
    }
    setSelected(new Set());
    await loadAll();
    router.refresh();
  }

  async function handleGeneratePrompt() {
    setGeneratingPrompt(true);
    const res = await generatePrototypeChangePromptAction(changeRequest.id, projectId);
    setGeneratingPrompt(false);
    if (!res.ok) { toast.error(res.message); return; }
    toast.success("تم توليد Prompt الـ Prototype");
    await loadAll();
  }

  async function handleCopyPrompt(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success("تم نسخ Prompt");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("تعذّر النسخ — انسخه يدويًا.");
    }
  }

  const hasApplied = impacts.some((i) => i.status === "applied");
  const latestPrompt = prompts[0] ?? null;

  return (
    <Modal open onClose={onClose} maxWidth="max-w-3xl">
      <div className="max-h-[85vh] space-y-5 overflow-y-auto p-6" dir="rtl">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="neutral">{CR_TYPE_LABELS[changeRequest.type]}</Badge>
            <h2 className="text-lg font-semibold text-[var(--v-text)]">{changeRequest.title}</h2>
            <Badge tone={CR_STATUS_TONE[changeRequest.status]}>{CR_STATUS_LABELS[changeRequest.status]}</Badge>
          </div>
          {changeRequest.description && (
            <p className="mt-2 text-sm text-[var(--v-text-secondary)]">{changeRequest.description}</p>
          )}
        </div>

        {loading ? (
          <p className="text-sm text-[var(--v-text-muted)]">جارٍ التحميل...</p>
        ) : impacts.length === 0 ? (
          <EmptyState title="لا يوجد تحليل أثر بعد" description="شغّل «تحليل الأثر» من الجدول الرئيسي أولًا." />
        ) : (
          <ul className="space-y-3">
            {impacts.map((impact) => {
              const proposed = renderProposedChange(impact.artifactType, impact.proposedChange);
              return (
                <li key={impact.id} className="rounded-[var(--v-radius-md)] border border-[var(--v-border)] p-3">
                  <div className="flex items-start gap-2">
                    {(impact.status === "proposed" || impact.status === "approved") && (
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4 accent-[var(--v-primary)]"
                        checked={selected.has(impact.id)}
                        onChange={() => toggleSelected(impact.id)}
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone="neutral">{artifactTypeLabel(impact.artifactType)}</Badge>
                        <Badge tone="info">{IMPACT_TYPE_LABELS[impact.impactType] ?? impact.impactType}</Badge>
                        <p className="font-medium text-[var(--v-text)]">{impact.artifactLabel}</p>
                        <Badge tone={IMPACT_STATUS_TONE[impact.status]}>{IMPACT_STATUS_LABELS[impact.status]}</Badge>
                      </div>
                      <p className="mt-1 text-[12px] text-[var(--v-text-secondary)]">{impact.reason}</p>

                      {proposed.length > 0 && (
                        <div className="mt-2 rounded-[var(--v-radius-sm)] bg-[var(--v-bg)] p-2">
                          <p className="mb-1 text-[11px] font-semibold text-[var(--v-text-secondary)]">التغيير المقترح:</p>
                          <dl className="grid grid-cols-1 gap-x-3 gap-y-1 sm:grid-cols-2">
                            {proposed.map((f) => (
                              <div key={f.label} className="text-[12px]">
                                <dt className="inline font-medium text-[var(--v-text)]">{f.label}: </dt>
                                <dd className="inline text-[var(--v-text-secondary)]">{f.value}</dd>
                              </div>
                            ))}
                          </dl>
                        </div>
                      )}

                      {impact.dependencies.length > 0 && (
                        <p className="mt-2 text-[11px] text-[var(--v-text-subtle)]">
                          تبعيات/تعارضات: {impact.dependencies.join(" · ")}
                        </p>
                      )}
                      {impact.missingInformation && (
                        <p className="mt-2 flex items-center gap-1 rounded-[var(--v-radius-sm)] border border-[var(--v-amber)] bg-[var(--v-amber)]/10 p-2 text-[11px] text-[var(--v-amber)]">
                          <AlertTriangle size={12} /> معلومات ناقصة: {impact.missingInformation}
                        </p>
                      )}

                      {canWrite && impact.status === "proposed" && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          <Button
                            size="sm" variant="ghost" icon={<CheckCircle2 size={13} />}
                            disabled={reviewingId === impact.id}
                            onClick={() => handleReview(impact.id, "approved")}
                          >
                            اعتماد
                          </Button>
                          <Button
                            size="sm" variant="ghost" icon={<XCircle size={13} />}
                            disabled={reviewingId === impact.id}
                            onClick={() => handleReview(impact.id, "rejected")}
                          >
                            رفض
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {canWrite && impacts.length > 0 && (
          <div className="flex justify-end">
            <Button
              variant="primary" icon={<CheckCircle2 size={14} />}
              disabled={applying || selected.size === 0}
              onClick={handleApply}
            >
              {applying ? "جارٍ التطبيق..." : "اعتماد المحدد وتطبيق"}
            </Button>
          </div>
        )}

        {hasApplied && (
          <div className="rounded-[var(--v-radius-md)] border border-[var(--v-border)] p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-[var(--v-text)]">Prompt تعديل البروتوتايب</p>
              {canWrite && (
                <Button
                  size="sm" variant="primary" icon={<Wand2 size={13} />}
                  disabled={generatingPrompt}
                  onClick={handleGeneratePrompt}
                >
                  {generatingPrompt ? "جارٍ التوليد..." : "توليد Prompt تعديل البروتوتايب"}
                </Button>
              )}
            </div>
            {latestPrompt ? (
              <div className="space-y-2">
                <pre dir="ltr" className="max-h-64 overflow-auto whitespace-pre-wrap rounded-[var(--v-radius-sm)] bg-[var(--v-bg)] p-3 text-[12px] text-[var(--v-text)]">
                  {latestPrompt.promptText}
                </pre>
                <Button size="sm" variant="ghost" icon={<Copy size={13} />} onClick={() => handleCopyPrompt(latestPrompt.promptText)}>
                  {copied ? "تم النسخ" : "نسخ البرومت"}
                </Button>
              </div>
            ) : (
              <p className="text-[12px] text-[var(--v-text-secondary)]">لم يُولَّد أي Prompt بعد لهذا الطلب.</p>
            )}
          </div>
        )}

        <div className="flex justify-end">
          <Button variant="ghost" onClick={onClose}>إغلاق</Button>
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Fit/Gap + Convert to Full Discovery — Piece #5
// ---------------------------------------------------------------------------
function FitGapSection({ projectId, notes, canWrite }: {
  projectId: string;
  notes: FitGapNotesRow | null;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [staysAsIs, setStaysAsIs] = useState(notes?.staysAsIs ?? "");
  const [needsAdding, setNeedsAdding] = useState(notes?.needsAdding ?? "");
  const [needsModifying, setNeedsModifying] = useState(notes?.needsModifying ?? "");
  const [needsRemoving, setNeedsRemoving] = useState(notes?.needsRemoving ?? "");
  const [operationalDifferences, setOperationalDifferences] = useState(notes?.operationalDifferences ?? "");
  const [saving, setSaving] = useState(false);
  const [confirmingConvert, setConfirmingConvert] = useState(false);
  const [converting, setConverting] = useState(false);

  async function handleSave() {
    setSaving(true);
    const res = await saveFitGapNotesAction(projectId, {
      staysAsIs, needsAdding, needsModifying, needsRemoving, operationalDifferences,
    });
    setSaving(false);
    if (!res.ok) { toast.error(res.message); return; }
    toast.success("تم حفظ ملاحظات الملاءمة والفجوات");
    router.refresh();
  }

  async function handleConvert() {
    setConverting(true);
    const res = await convertToFullDiscoveryAction(projectId);
    setConverting(false);
    setConfirmingConvert(false);
    if (!res.ok) { toast.error(res.message); return; }
    toast.success("تم التحويل إلى Full Discovery");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <Card>
        <Header title="ملاحظات الملاءمة والفجوات (Fit/Gap)" />
        <p className="mb-3 text-[12px] text-[var(--v-text-secondary)]">
          ملاحظات مُهيكلة بسيطة — مش إعادة Discovery كاملة. حدّث الخانات دي وقت ما تلاحظ فروقات عن الـ Sector Standard.
        </p>
        <div className="grid grid-cols-1 gap-4">
          <FitGapField label="إيه ثابت زي الـ Standard (Stays as-is)" value={staysAsIs} onChange={setStaysAsIs} disabled={!canWrite} />
          <FitGapField label="إيه محتاج إضافة (Needs adding)" value={needsAdding} onChange={setNeedsAdding} disabled={!canWrite} />
          <FitGapField label="إيه محتاج تعديل (Needs modifying)" value={needsModifying} onChange={setNeedsModifying} disabled={!canWrite} />
          <FitGapField label="إيه محتاج حذف (Needs removing)" value={needsRemoving} onChange={setNeedsRemoving} disabled={!canWrite} />
          <FitGapField label="فروقات تشغيلية (Operational differences)" value={operationalDifferences} onChange={setOperationalDifferences} disabled={!canWrite} />
        </div>
        {canWrite && (
          <div className="mt-4 flex justify-end">
            <Button variant="primary" disabled={saving} onClick={handleSave}>
              {saving ? "جارٍ الحفظ..." : "حفظ الملاحظات"}
            </Button>
          </div>
        )}
        {notes && (
          <p className="mt-2 text-[11px] text-[var(--v-text-muted)]">
            آخر تحديث: {new Date(notes.updatedAt).toLocaleString("ar-EG")}
          </p>
        )}
      </Card>

      {canWrite && (
        <Card>
          <Header title="تحويل إلى Full Discovery" />
          <p className="mb-3 text-[12px] text-[var(--v-text-secondary)]">
            يحوّل هذا المشروع من Client Variant مبني على Standard إلى مسار Full Discovery كامل — كل تبويبات الاكتشاف
            العادية هتظهر. السجل التاريخي لأصل الاستنساخ (project_standard_links) بيفضل محفوظًا، ولا حاجة من بيانات
            المنتج بتتحذف.
          </p>
          <Button variant="ghost" onClick={() => setConfirmingConvert(true)}>تحويل إلى Full Discovery</Button>
        </Card>
      )}

      <Modal open={confirmingConvert} onClose={() => setConfirmingConvert(false)} maxWidth="max-w-md">
        <div className="space-y-4 p-6" dir="rtl">
          <h2 className="text-lg font-semibold text-[var(--v-text)]">تأكيد التحويل إلى Full Discovery</h2>
          <p className="text-sm text-[var(--v-text-secondary)]">
            سيتحوّل هذا المشروع لمسار Discovery الكامل. لن تُحذف أي بيانات، ولن يُحذف سجل الاستنساخ من الـ Sector
            Standard الأصلي — العملية إضافية بالكامل وقابلة للمراجعة لاحقًا.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirmingConvert(false)} disabled={converting}>إلغاء</Button>
            <Button variant="primary" disabled={converting} onClick={handleConvert}>
              {converting ? "جارٍ التحويل..." : "تأكيد التحويل"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function FitGapField({ label, value, onChange, disabled }: {
  label: string; value: string; onChange: (v: string) => void; disabled?: boolean;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs text-[var(--v-text-secondary)]">{label}</label>
      <Textarea rows={3} value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small shared helpers
// ---------------------------------------------------------------------------
function Header({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3 border-b border-[var(--v-border)] pb-3">
      <h3 className="text-base font-semibold text-[var(--v-text)]">{title}</h3>{action}
    </div>
  );
}
function Tile({ label, value, tone }: { label: string; value: string; tone?: BadgeTone }) {
  return (
    <div className="rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-surface)] p-3">
      <p className="text-[11px] text-[var(--v-text-muted)]">{label}</p>
      <p className="mt-1 font-mono-plex text-lg font-semibold text-[var(--v-text)]">
        {tone ? <Badge tone={tone}>{value}</Badge> : value}
      </p>
    </div>
  );
}
function Field({ label, span = 1, children }: { label: string; span?: 1 | 2; children: React.ReactNode }) {
  return (
    <div className={span === 2 ? "sm:col-span-2" : ""}>
      <label className="mb-1 block text-xs text-[var(--v-text-secondary)]">{label}</label>{children}
    </div>
  );
}
