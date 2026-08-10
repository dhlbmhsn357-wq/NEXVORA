"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Sparkles,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Pencil,
  X,
  Save,
  History,
  ChevronDown,
  ChevronUp,
  Info,
  Printer,
} from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import Modal from "@/components/ui/Modal";
import Tooltip from "@/components/ui/Tooltip";
import EmptyState from "@/components/ui/EmptyState";
import { toast } from "@/components/ui/Toaster";
import {
  BRAIN_SECTIONS,
  BRAIN_SECTION_LABELS,
  SOURCE_LABELS,
  type BrainContent,
  type BrainDocumentRow,
  type BrainSectionKey,
  type Section,
  type BrainSectionSource,
} from "@/lib/brain-v2/types";
import { diffBrainContents, type SectionDiff } from "@/lib/brain-v2/diff";
import {
  approveBrainDraft,
  rejectBrainDraft,
  rebuildBrainDraftFromLatestAnalysis,
  editSection,
} from "./brain-v2-actions";

const SOURCE_TONE: Record<BrainSectionSource, "info" | "primary" | "success" | "warning" | "neutral"> = {
  discovery: "info",
  ai_analysis: "primary",
  pm_manual_edit: "success",
  meeting: "warning",
  future_update: "neutral",
};

function confidenceTone(score: number): "success" | "warning" | "danger" {
  if (score >= 75) return "success";
  if (score >= 50) return "warning";
  return "danger";
}

export default function BrainV2Panel({
  projectId,
  document,
  approvedDocument,
  versions,
  isAdmin,
}: {
  projectId: string;
  document: BrainDocumentRow | null;
  approvedDocument: BrainDocumentRow | null;
  versions: BrainDocumentRow[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [editing, setEditing] = useState<BrainSectionKey | null>(null);
  const [diffFrom, setDiffFrom] = useState<number | null>(null);
  const [diffTo, setDiffTo] = useState<number | null>(null);

  // اللي نعرضه: draft لو موجود، وإلا approved، وإلا آخر شيء موجود
  const active = document ?? approvedDocument;

  async function handleRebuild() {
    setBusy(true);
    const r = await rebuildBrainDraftFromLatestAnalysis(projectId);
    setBusy(false);
    if (!r.ok) {
      toast.error(r.message);
      return;
    }
    toast.success("تم بناء Draft جديد");
    router.refresh();
  }

  async function handleApprove() {
    if (!active) return;
    setBusy(true);
    const r = await approveBrainDraft(active.id, projectId);
    setBusy(false);
    if (!r.ok) {
      toast.error(r.message);
      return;
    }
    toast.success("تم اعتماد النسخة");
    router.refresh();
  }

  async function handleReject() {
    if (!active) return;
    if (!rejectReason.trim()) {
      toast.error("اكتب سبب الرفض.");
      return;
    }
    setBusy(true);
    const r = await rejectBrainDraft(active.id, projectId, rejectReason);
    setBusy(false);
    if (!r.ok) {
      toast.error(r.message);
      return;
    }
    toast.success("تم رفض النسخة");
    setRejecting(false);
    setRejectReason("");
    router.refresh();
  }

  if (!active) {
    return (
      <Card padding="lg">
        <EmptyState
          icon={<Sparkles size={28} />}
          title="لسه ما اتبنيش Project Brain"
          description={
            isAdmin
              ? "Brain بيتبني تلقائيًا بعد أول تحليل ناجح لنموذج الاكتشاف. تقدر تشغّله يدويًا لو فيه تحليل جاهز."
              : "Brain بيتبني تلقائيًا بعد أول تحليل ناجح لنموذج الاكتشاف."
          }
          primaryAction={
            isAdmin
              ? { label: "بناء Brain من التحليل", onClick: handleRebuild, loading: busy }
              : undefined
          }
        />
      </Card>
    );
  }

  const isDraft = active.status === "draft";

  return (
    <div className="space-y-4">
      {/* الترويسة */}
      <Card padding="md">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Sparkles size={16} className="text-[var(--v-primary)]" />
              <p className="text-sm font-semibold text-[var(--v-text)]">Project Brain</p>
              <Badge tone={statusTone(active.status)}>{statusLabel(active.status)}</Badge>
              <span className="font-mono-plex text-[11px] text-[var(--v-text-subtle)]">
                v{active.version}
                {active.previous_version ? ` ← v${active.previous_version}` : ""}
              </span>
              <CompletenessBadge score={active.completeness_score} />
            </div>
            <p className="mt-1 text-[11px] text-[var(--v-text-subtle)]">
              {active.approved_at
                ? `اعتُمد: ${new Date(active.approved_at).toLocaleString("ar-EG")}`
                : `أُنشئ: ${new Date(active.created_at).toLocaleString("ar-EG")}`}
              {active.change_summary ? ` · ${active.change_summary}` : ""}
            </p>
            {active.status === "rejected" && active.rejection_reason && (
              <p className="mt-1 text-[11px] text-[var(--v-red)]">سبب الرفض: {active.rejection_reason}</p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              icon={<Printer size={13} />}
              onClick={() => window.open(`/brain-print/${projectId}`, "_blank")}
            >
              طباعة / تصدير PDF
            </Button>
            {isAdmin && (
              <Button
                variant="outline"
                size="sm"
                icon={<RefreshCw size={13} />}
                onClick={handleRebuild}
                disabled={busy}
              >
                إعادة البناء من التحليل
              </Button>
            )}
            {isAdmin && isDraft && (
              <>
                <Button
                  variant="success"
                  size="sm"
                  icon={<CheckCircle2 size={14} />}
                  onClick={handleApprove}
                  disabled={busy}
                >
                  اعتماد
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  icon={<XCircle size={14} />}
                  onClick={() => setRejecting(true)}
                  disabled={busy}
                >
                  رفض
                </Button>
              </>
            )}
          </div>
        </div>
      </Card>

      {/* Diff Viewer — لو عندنا نسختين على الأقل */}
      {versions.length >= 2 && (
        <Card padding="md">
          <div className="flex flex-wrap items-center gap-2">
            <History size={14} className="text-[var(--v-text-muted)]" />
            <p className="text-xs font-semibold text-[var(--v-text-muted)]">مقارنة نسختين</p>
            <select
              value={diffFrom ?? ""}
              onChange={(e) => setDiffFrom(e.target.value ? Number(e.target.value) : null)}
              className="h-8 rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-bg)] px-2 text-[11px] outline-none focus:border-[var(--v-primary)]"
            >
              <option value="">من</option>
              {versions.map((v) => (
                <option key={v.id} value={v.version}>
                  v{v.version} ({statusLabel(v.status)})
                </option>
              ))}
            </select>
            <select
              value={diffTo ?? ""}
              onChange={(e) => setDiffTo(e.target.value ? Number(e.target.value) : null)}
              className="h-8 rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-bg)] px-2 text-[11px] outline-none focus:border-[var(--v-primary)]"
            >
              <option value="">إلى</option>
              {versions.map((v) => (
                <option key={v.id} value={v.version}>
                  v{v.version} ({statusLabel(v.status)})
                </option>
              ))}
            </select>
          </div>

          {diffFrom !== null && diffTo !== null && diffFrom !== diffTo && (
            <DiffView
              from={(versions.find((v) => v.version === diffFrom)?.content ?? null) as BrainContent | null}
              to={(versions.find((v) => v.version === diffTo)?.content ?? null) as BrainContent | null}
            />
          )}
        </Card>
      )}

      {/* الأقسام الـ19 */}
      <div className="space-y-3">
        {BRAIN_SECTIONS.map((key) => (
          <BrainSectionCard
            key={key}
            sectionKey={key}
            section={active.content[key]}
            onEdit={isAdmin && isDraft ? () => setEditing(key) : undefined}
          />
        ))}
      </div>

      {/* Modal الرفض */}
      <Modal open={rejecting} onClose={() => setRejecting(false)}>
        <div className="space-y-3">
          <p className="text-sm font-semibold text-[var(--v-text)]">رفض النسخة</p>
          <p className="text-xs text-[var(--v-text-muted)]">
            الـ Draft هيتحفظ بحالة «مرفوض» بدون أن يُكتب فوق النسخة المعتمدة الحالية.
          </p>
          <textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            rows={3}
            placeholder="اكتب سبب الرفض (إجباري)…"
            className="w-full rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-bg)] px-3 py-2 text-sm text-[var(--v-text)] outline-none focus:border-[var(--v-primary)]"
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setRejecting(false)}>
              إلغاء
            </Button>
            <Button variant="danger" loading={busy} onClick={handleReject}>
              تأكيد الرفض
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal التعديل */}
      {editing && (
        <SectionEditor
          documentId={active.id}
          projectId={projectId}
          expectedUpdatedAt={active.updated_at}
          sectionKey={editing}
          section={active.content[editing]}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

// ============================================================
// بطاقة قسم واحد — قابلة للطي، تعرض المحتوى بصيغة قابلة للقراءة
// ============================================================

function BrainSectionCard({
  sectionKey,
  section,
  onEdit,
}: {
  sectionKey: BrainSectionKey;
  section: Section<unknown>;
  onEdit?: () => void;
}) {
  const [open, setOpen] = useState(true);
  const conf = section.meta.confidence;

  return (
    <Card padding="md" animate={false}>
      <div className="flex items-start justify-between gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex flex-1 items-center gap-2 text-start"
        >
          {open ? <ChevronUp size={15} className="text-[var(--v-text-muted)]" /> : <ChevronDown size={15} className="text-[var(--v-text-muted)]" />}
          <p className="text-sm font-semibold text-[var(--v-text)]">{BRAIN_SECTION_LABELS[sectionKey]}</p>
          <Badge tone={SOURCE_TONE[section.meta.source]}>{SOURCE_LABELS[section.meta.source]}</Badge>
          <Tooltip label={section.meta.confidence_reason ?? `ثقة ${conf}%`}>
            <span
              className={`inline-flex cursor-help items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                confidenceTone(conf) === "success"
                  ? "bg-[var(--v-green)]/10 text-[var(--v-green)]"
                  : confidenceTone(conf) === "warning"
                    ? "bg-[var(--v-amber)]/10 text-[var(--v-amber)]"
                    : "bg-[var(--v-red)]/10 text-[var(--v-red)]"
              }`}
            >
              ثقة {conf}%
            </span>
          </Tooltip>
        </button>
        {onEdit && (
          <button
            type="button"
            onClick={onEdit}
            className="rounded-[var(--v-radius-md)] p-1.5 text-[var(--v-text-muted)] hover:text-[var(--v-primary)]"
            aria-label="تعديل"
          >
            <Pencil size={13} />
          </button>
        )}
      </div>

      {open && (
        <div className="mt-3">
          <SectionRenderer sectionKey={sectionKey} content={section.content} />
        </div>
      )}
    </Card>
  );
}

/**
 * عارض عام — بيعتمد على شكل content بشكل ديناميكي (لأن الشكل يختلف بين أقسام).
 * يبقى بسيط للـ v1 (JSON pretty) للحقول الشاذّة، ومنظم للحقول القياسية.
 */
function SectionRenderer({ sectionKey, content }: { sectionKey: BrainSectionKey; content: unknown }) {
  if (sectionKey === "executive_summary") {
    return <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--v-text)]">{String(content || "—")}</p>;
  }

  if (sectionKey === "business_model") {
    const c = content as { overview: string; how_it_works: string; value_delivery: string; users_description: string };
    return (
      <div className="space-y-2">
        <Sub label="نظرة عامة" value={c.overview} />
        <Sub label="كيف يعمل" value={c.how_it_works} />
        <Sub label="كيف يحقق القيمة" value={c.value_delivery} />
        <Sub label="المستخدمون" value={c.users_description} />
      </div>
    );
  }

  if (sectionKey === "non_functional_requirements") {
    const c = content as Record<string, Array<{ statement: string }>>;
    const groups: [string, Array<{ statement: string }>][] = [
      ["الأداء", c.performance],
      ["الأمان", c.security],
      ["التوسّع", c.scalability],
      ["الإتاحة", c.availability],
      ["إمكانية الوصول", c.accessibility],
      ["الامتثال", c.compliance],
    ];
    return (
      <div className="space-y-2">
        {groups.map(([label, items]) => (
          <div key={label}>
            <p className="text-[11px] font-semibold text-[var(--v-text-subtle)]">{label}</p>
            {items.length === 0 ? (
              <p className="text-xs text-[var(--v-text-subtle)]">—</p>
            ) : (
              <ul className="ms-4 list-disc text-sm text-[var(--v-text)]">
                {items.map((it, i) => (
                  <li key={i}>{it.statement}</li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    );
  }

  if (sectionKey === "project_scope") {
    const c = content as { in_scope: Array<{ statement: string }>; out_of_scope: Array<{ statement: string }> };
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <p className="mb-1 text-[11px] font-semibold text-[var(--v-green)]">داخل النطاق</p>
          {c.in_scope.length === 0 ? <EmptyLine /> : c.in_scope.map((it, i) => <ItemRow key={i}>{it.statement}</ItemRow>)}
        </div>
        <div>
          <p className="mb-1 text-[11px] font-semibold text-[var(--v-red)]">خارج النطاق</p>
          {c.out_of_scope.length === 0 ? <EmptyLine /> : c.out_of_scope.map((it, i) => <ItemRow key={i}>{it.statement}</ItemRow>)}
        </div>
      </div>
    );
  }

  // القوائم الافتراضية (Arrays of objects)
  if (Array.isArray(content)) {
    if (content.length === 0) return <EmptyLine />;
    return (
      <ul className="space-y-1.5">
        {content.map((it, i) => (
          <li key={i} className="rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-bg-soft)] p-2 text-sm text-[var(--v-text)]">
            {renderItemLine(it as Record<string, unknown>)}
          </li>
        ))}
      </ul>
    );
  }

  return <pre className="overflow-x-auto text-xs text-[var(--v-text-muted)]">{JSON.stringify(content, null, 2)}</pre>;
}

function renderItemLine(rec: Record<string, unknown>): React.ReactNode {
  // نلقّط أول حقل نصي "رئيسي" ونعرضه، مع البقية كأسطر مساعدة
  const primary = rec.statement ?? rec.rule ?? rec.constraint ?? rec.fact ?? rec.risk ?? rec.title ?? rec.goal ?? rec.info ?? rec.question ?? rec.role ?? rec.name ?? rec.phase;
  const secondary: string[] = [];
  for (const [k, v] of Object.entries(rec)) {
    if (k === "evidence" || k === "meta") continue;
    if (v === primary) continue;
    if (typeof v === "string" && v.trim()) secondary.push(`${translateKey(k)}: ${v}`);
    else if (Array.isArray(v) && v.every((x) => typeof x === "string")) secondary.push(`${translateKey(k)}: ${(v as string[]).join("، ")}`);
  }
  return (
    <div>
      <p>{String(primary ?? "—")}</p>
      {secondary.length > 0 && (
        <p className="mt-0.5 text-[11px] text-[var(--v-text-muted)]">{secondary.join(" · ")}</p>
      )}
    </div>
  );
}

function translateKey(k: string): string {
  const map: Record<string, string> = {
    priority: "أولوية",
    reason: "السبب",
    cause: "السبب",
    likelihood: "الاحتمال",
    impact: "التأثير",
    rationale: "المبرّر",
    influence: "التأثير",
    type: "النوع",
    category: "الفئة",
    responsibilities: "المسؤوليات",
    target_or_direction: "المستهدف",
    goal_link: "مرتبط بهدف",
    description: "الوصف",
    deliverables: "المخرجات",
    role: "الدور",
    want: "أريد",
    benefit: "الفائدة",
  };
  return map[k] ?? k;
}

function Sub({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-semibold text-[var(--v-text-subtle)]">{label}</p>
      <p className="mt-0.5 text-sm text-[var(--v-text)]">{value || "—"}</p>
    </div>
  );
}
function ItemRow({ children }: { children: React.ReactNode }) {
  return <p className="rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-bg-soft)] p-2 text-sm text-[var(--v-text)]">{children}</p>;
}
function EmptyLine() {
  return <p className="text-xs text-[var(--v-text-subtle)]">لا توجد عناصر.</p>;
}

// ============================================================
// Section Editor — تعديل JSON للقسم (بسيط ومرن، بيقبل أي شكل)
// ============================================================

function SectionEditor({
  documentId,
  projectId,
  expectedUpdatedAt,
  sectionKey,
  section,
  onClose,
}: {
  documentId: string;
  projectId: string;
  expectedUpdatedAt: string;
  sectionKey: BrainSectionKey;
  section: Section<unknown>;
  onClose: () => void;
}) {
  const router = useRouter();
  const [text, setText] = useState(() => {
    if (typeof section.content === "string") return section.content;
    return JSON.stringify(section.content, null, 2);
  });
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    let parsed: unknown;
    if (typeof section.content === "string") {
      parsed = text;
    } else {
      try {
        parsed = JSON.parse(text);
      } catch {
        toast.error("النص ليس JSON صالحًا.");
        return;
      }
    }
    setSaving(true);
    const r = await editSection({
      documentId,
      projectId,
      sectionKey,
      newContent: parsed,
      expectedUpdatedAt,
      reason: reason.trim() || null,
    });
    setSaving(false);
    if (!r.ok) {
      toast.error(r.message);
      if (r.conflict) router.refresh();
      return;
    }
    toast.success("تم حفظ التعديل");
    onClose();
    router.refresh();
  }

  return (
    <Modal open onClose={onClose} maxWidth="max-w-2xl">
      <div className="max-h-[80vh] space-y-3 overflow-y-auto pl-1">
        <div className="flex items-center gap-2">
          <Info size={14} className="text-[var(--v-text-muted)]" />
          <p className="text-sm font-semibold text-[var(--v-text)]">تعديل: {BRAIN_SECTION_LABELS[sectionKey]}</p>
        </div>
        <p className="text-xs text-[var(--v-text-muted)]">
          {typeof section.content === "string"
            ? "عدّل النص مباشرة."
            : "المحتوى JSON — احرص على المطابقة للشكل الأصلي وإلا سيُرفض الحفظ."}
        </p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={typeof section.content === "string" ? 8 : 18}
          className="w-full rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-bg)] px-3 py-2 font-mono-plex text-[12px] leading-relaxed text-[var(--v-text)] outline-none focus:border-[var(--v-primary)]"
        />
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="سبب التعديل (اختياري)…"
          className="w-full rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-bg)] px-3 py-2 text-sm text-[var(--v-text)] outline-none focus:border-[var(--v-primary)]"
        />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" icon={<X size={14} />} onClick={onClose}>
            إلغاء
          </Button>
          <Button variant="primary" icon={<Save size={14} />} loading={saving} onClick={save}>
            حفظ
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ============================================================
// Diff View — عرض تلوين للفروقات
// ============================================================

function DiffView({ from, to }: { from: BrainContent | null; to: BrainContent | null }) {
  const diffs = useMemo(() => (from && to ? diffBrainContents(from, to) : []), [from, to]);
  if (!from || !to) return <p className="mt-2 text-xs text-[var(--v-text-subtle)]">اختر نسختين.</p>;

  return (
    <div className="mt-3 space-y-1.5">
      {diffs.filter((d) => d.kind !== "unchanged").length === 0 && (
        <p className="text-xs text-[var(--v-text-subtle)]">النسختان متطابقتان.</p>
      )}
      {diffs
        .filter((d) => d.kind !== "unchanged")
        .map((d) => (
          <DiffRow key={d.section} diff={d} />
        ))}
    </div>
  );
}

function DiffRow({ diff }: { diff: SectionDiff }) {
  const tone =
    diff.kind === "added"
      ? "bg-[var(--v-green)]/8 border-[var(--v-green)]/40"
      : diff.kind === "removed"
        ? "bg-[var(--v-red)]/8 border-[var(--v-red)]/40"
        : "bg-[var(--v-amber)]/8 border-[var(--v-amber)]/40";
  const label = diff.kind === "added" ? "قسم جديد" : diff.kind === "removed" ? "قسم محذوف" : "تعديل";
  return (
    <div className={`rounded-[var(--v-radius-md)] border p-2 text-xs ${tone}`}>
      <div className="mb-1 flex items-center gap-2">
        <span className="font-medium text-[var(--v-text)]">{BRAIN_SECTION_LABELS[diff.section]}</span>
        <span className="text-[10px] text-[var(--v-text-muted)]">{label}</span>
      </div>
      {diff.addedItems && diff.addedItems.length > 0 && (
        <p className="text-[var(--v-green)]">+ {diff.addedItems.join("، ")}</p>
      )}
      {diff.removedItems && diff.removedItems.length > 0 && (
        <p className="text-[var(--v-red)]">− {diff.removedItems.join("، ")}</p>
      )}
      {diff.modifiedItems && diff.modifiedItems.length > 0 && (
        <p className="text-[var(--v-amber)]">~ {diff.modifiedItems.join("، ")}</p>
      )}
    </div>
  );
}

// ============================================================
// Helpers
// ============================================================

function statusLabel(status: BrainDocumentRow["status"]): string {
  switch (status) {
    case "draft":
      return "مسودّة";
    case "in_review":
      return "قيد المراجعة";
    case "approved":
      return "معتمد";
    case "rejected":
      return "مرفوض";
    case "archived":
      return "مؤرشف";
  }
}
function statusTone(status: BrainDocumentRow["status"]): "warning" | "info" | "success" | "danger" | "neutral" {
  switch (status) {
    case "draft":
      return "warning";
    case "in_review":
      return "info";
    case "approved":
      return "success";
    case "rejected":
      return "danger";
    case "archived":
      return "neutral";
  }
}

function CompletenessBadge({ score }: { score: number }) {
  const tone = confidenceTone(score);
  return (
    <Tooltip label={`اكتمال Brain — ${score}%`}>
      <span
        className={`inline-flex cursor-help items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
          tone === "success"
            ? "bg-[var(--v-green)]/10 text-[var(--v-green)]"
            : tone === "warning"
              ? "bg-[var(--v-amber)]/10 text-[var(--v-amber)]"
              : "bg-[var(--v-red)]/10 text-[var(--v-red)]"
        }`}
      >
        اكتمال {score}%
      </span>
    </Tooltip>
  );
}

