"use client";

/**
 * NEXVORA Evidence Button (P8)
 * ============================
 * زر "الأدلة (N)" يظهر على كل عنصر Requirement / Story / AC — يفتح
 * Modal بيسرد كل الأدلة المرتبطة، ويسمح بربط دليل جديد أو حذف ربط.
 *
 * الأدلة المتاحة تُمرّر من الأب (page.tsx) عشان ما نعملش استعلام لكل زر.
 * تحميل الروابط المرتبطة يحصل عند فتح الـ Modal فقط (lazy).
 */
import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Link2, Trash2, ExternalLink, Plus, X } from "lucide-react";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import Modal from "@/components/ui/Modal";
import Textarea from "@/components/ui/Textarea";
import Select from "@/components/ui/Select";
import { toast } from "@/components/ui/Toaster";
import type {
  EvidenceSourceType, EvidenceKind, EvidenceLinkView,
} from "@/lib/evidence/types";
import { EVIDENCE_KIND_LABELS } from "@/lib/evidence/types";
import type { MarketResearchItem, ProblemValidationItem } from "@/lib/market-research/types";
import {
  loadEvidenceForSourceAction, linkEvidenceAction, unlinkEvidenceAction,
} from "./evidence-actions";

export interface EvidenceButtonProps {
  projectId: string;
  sourceType: EvidenceSourceType;
  sourceId: string;
  /** عدد الروابط الحالي — يُحسب من الأب لعرضه على الزر بلا استعلام. */
  linkCount: number;
  marketResearch: readonly MarketResearchItem[];
  problemValidation: readonly ProblemValidationItem[];
  canWrite: boolean;
}

export default function EvidenceButton(props: EvidenceButtonProps) {
  const { projectId, sourceType, sourceId, linkCount, marketResearch, problemValidation, canWrite } = props;
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 rounded-full border border-[var(--v-border)] px-2 py-0.5 text-[11px] text-[var(--v-text-secondary)] transition hover:border-[var(--v-primary)] hover:text-[var(--v-primary)]"
        title="عرض/إدارة الأدلة"
      >
        <Link2 size={11} />
        <span>الأدلة ({linkCount})</span>
      </button>
      {open && (
        <EvidenceModal
          projectId={projectId}
          sourceType={sourceType}
          sourceId={sourceId}
          marketResearch={marketResearch}
          problemValidation={problemValidation}
          canWrite={canWrite}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Modal (يفتح على open=true فقط عشان lazy fetching)
// ---------------------------------------------------------------------------
function EvidenceModal({
  projectId, sourceType, sourceId,
  marketResearch, problemValidation, canWrite, onClose,
}: {
  projectId: string; sourceType: EvidenceSourceType; sourceId: string;
  marketResearch: readonly MarketResearchItem[];
  problemValidation: readonly ProblemValidationItem[];
  canWrite: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [loading, setLoading] = useState(true);
  const [views, setViews] = useState<EvidenceLinkView[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [addKind, setAddKind] = useState<EvidenceKind>("problem_validation");
  const [addId, setAddId] = useState<string>("");
  const [addNote, setAddNote] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await loadEvidenceForSourceAction(projectId, sourceType, sourceId);
      if (cancelled) return;
      if (res.ok) setViews(res.data ?? []);
      else toast.error(res.message);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [projectId, sourceType, sourceId]);

  function refetch() {
    startTransition(async () => {
      const res = await loadEvidenceForSourceAction(projectId, sourceType, sourceId);
      if (res.ok) setViews(res.data ?? []);
      else toast.error(res.message);
      router.refresh();  // نحدّث الأب عشان linkCount يتحدّث كمان
    });
  }

  function handleAdd() {
    if (!addId) { toast.error("اختر دليلاً."); return; }
    startTransition(async () => {
      const res = await linkEvidenceAction(projectId, sourceType, sourceId, addKind, addId, addNote);
      if (res.ok) {
        toast.success("تم الربط");
        setShowAdd(false); setAddId(""); setAddNote("");
        refetch();
      } else toast.error(res.message);
    });
  }

  function handleUnlink(id: string) {
    if (!confirm("حذف هذا الربط؟")) return;
    startTransition(async () => {
      const res = await unlinkEvidenceAction(projectId, id);
      if (res.ok) { toast.success("تم الحذف"); refetch(); }
      else toast.error(res.message);
    });
  }

  const availableOptions = addKind === "market_research"
    ? marketResearch.map((m) => ({ id: m.id, label: m.title, sub: m.summary }))
    : problemValidation.map((p) => ({ id: p.id, label: p.title, sub: p.painPoint }));

  return (
    <Modal open onClose={onClose} maxWidth="max-w-lg">
      <div className="space-y-4 p-6">
        <div className="flex items-start justify-between">
          <h2 className="text-lg font-semibold text-[var(--v-text)]">الأدلة المرتبطة</h2>
          <button onClick={onClose} className="text-[var(--v-text-muted)] hover:text-[var(--v-text)]"><X size={18} /></button>
        </div>

        {loading ? (
          <p className="text-sm text-[var(--v-text-muted)]">جارٍ التحميل…</p>
        ) : views.length === 0 ? (
          <p className="rounded-[var(--v-radius-md)] border border-dashed border-[var(--v-border)] p-4 text-center text-sm text-[var(--v-text-muted)]">
            لا أدلة مرتبطة بعد. {canWrite && "أضف دليل من قاعدة البحث والتحقق."}
          </p>
        ) : (
          <ul className="max-h-[40vh] space-y-2 overflow-y-auto">
            {views.map((v) => (
              <li key={v.link.id} className="rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-surface)] p-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge tone={v.link.evidenceType === "market_research" ? "info" : "primary"}>
                        {EVIDENCE_KIND_LABELS[v.link.evidenceType]}
                      </Badge>
                      <p className="text-sm font-medium text-[var(--v-text)]">{v.evidenceTitle}</p>
                      <span className="text-[11px] text-[var(--v-text-subtle)]">قوّة {v.evidenceStrength}%</span>
                    </div>
                    {v.evidenceSummary && (
                      <p className="mt-1 text-xs text-[var(--v-text-secondary)]">{v.evidenceSummary}</p>
                    )}
                    {v.link.note && (
                      <p className="mt-1 rounded-[var(--v-radius-sm)] bg-[var(--v-primary-tint)] p-1.5 text-[11px] text-[var(--v-primary)]">
                        <b>تعليق:</b> {v.link.note}
                      </p>
                    )}
                    {v.evidenceUrl && (
                      <a href={v.evidenceUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-[11px] text-[var(--v-primary)] hover:underline">
                        <ExternalLink size={11} /> المصدر الأصلي
                      </a>
                    )}
                  </div>
                  {canWrite && (
                    <Button size="sm" variant="ghost" icon={<Trash2 size={12} />} onClick={() => handleUnlink(v.link.id)}>حذف</Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        {canWrite && !showAdd && (
          <Button variant="secondary" size="sm" icon={<Plus size={14} />} onClick={() => setShowAdd(true)} disabled={pending}>
            ربط دليل جديد
          </Button>
        )}

        {canWrite && showAdd && (
          <div className="space-y-2 rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-surface)] p-3">
            <p className="text-sm font-semibold text-[var(--v-text)]">ربط دليل جديد</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs text-[var(--v-text-secondary)]">نوع الدليل</label>
                <Select value={addKind} onChange={(e) => { setAddKind(e.target.value as EvidenceKind); setAddId(""); }}>
                  <option value="problem_validation">تحقق مشكلة</option>
                  <option value="market_research">بحث سوقي</option>
                </Select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-[var(--v-text-secondary)]">الدليل</label>
                <Select value={addId} onChange={(e) => setAddId(e.target.value)}>
                  <option value="">— اختر —</option>
                  {availableOptions.map((o) => (
                    <option key={o.id} value={o.id}>{o.label}{o.sub ? ` — ${o.sub.slice(0, 40)}` : ""}</option>
                  ))}
                </Select>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs text-[var(--v-text-secondary)]">تعليق (كيف يخدم الدليل هذا العنصر؟)</label>
              <Textarea value={addNote} onChange={(e) => setAddNote(e.target.value)} rows={2} placeholder="مثلاً: المقابلة مع مدير المشتريات أكّدت أن هذه العملية بطيئة ويدوية." />
            </div>
            {availableOptions.length === 0 && (
              <p className="rounded-[var(--v-radius-md)] bg-[var(--v-amber)]/10 p-2 text-[11px] text-[var(--v-amber)]">
                لا أدلة من هذا النوع في المشروع. أضفها من تبويب &quot;البحث والتحقق&quot;.
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setShowAdd(false)} disabled={pending}>إلغاء</Button>
              <Button variant="primary" size="sm" onClick={handleAdd} disabled={pending || !addId}>ربط</Button>
            </div>
          </div>
        )}

      </div>
    </Modal>
  );
}
