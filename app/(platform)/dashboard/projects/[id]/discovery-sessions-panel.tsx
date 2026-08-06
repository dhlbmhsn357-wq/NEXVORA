"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Copy, ExternalLink, RefreshCw, Trash2, Ban, RotateCcw, Layers, Check, Eye, Loader2, Inbox, FileDown } from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import Input from "@/components/ui/Input";
import Badge, { type BadgeTone } from "@/components/ui/Badge";
import { toast } from "@/components/ui/Toaster";
import {
  createDiscoverySession,
  deleteDiscoverySession,
  regenerateSessionLink,
  cancelDiscoverySession,
  reopenSessionSubmission,
  renewDiscoverySession,
  getSessionResponses,
  type SessionResponses,
} from "./discovery-link-actions";
import type { DiscoveryFormTemplate } from "@/lib/types/database";
import type { DiscoverySessionSummary } from "@/lib/discovery-portal/session-service";

const STATUS_LABELS: Record<string, string> = {
  pending: "بانتظار الفتح",
  opened: "اتفتح",
  in_progress: "قيد التعبئة",
  submitted: "مُسلّم",
  expired: "منتهي",
  cancelled: "ملغي",
};
const STATUS_TONE: Record<string, BadgeTone> = {
  pending: "neutral",
  opened: "info",
  in_progress: "warning",
  submitted: "success",
  expired: "danger",
  cancelled: "neutral",
};

function publicUrl(token: string): string {
  if (typeof window === "undefined") return `/discovery/${token}`;
  return `${window.location.origin}/discovery/${token}`;
}

/** صياغة قيمة الإجابة للعرض: مصفوفات، Boolean، كائنات، وإلا نص. */
function formatAnswer(value: unknown): string {
  if (value === undefined || value === null || value === "") return "";
  if (Array.isArray(value)) return value.map((v) => formatAnswer(v)).filter(Boolean).join("، ");
  if (typeof value === "boolean") return value ? "نعم" : "لا";
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (typeof obj.name === "string") return obj.name; // مرفق/ملف
    if (typeof obj.url === "string") return obj.url;
    return JSON.stringify(value);
  }
  return String(value);
}

/**
 * Discovery Workspace — مكتبة جلسات الاكتشاف. كل مشروع ممكن يبقى عنده
 * جلسات متعددة دائمة (مثلًا جلسة لكل إدارة)، كل واحدة برابط عام خاص
 * واستجابات خاصة. توليد جلسة جديدة **لا يستبدل** أي جلسة سابقة، والحذف
 * يدوي فقط. كل الاستجابات بتتجمّع في معرفة واحدة يقرأها الـ AI كله.
 */
export default function DiscoverySessionsPanel({
  projectId,
  sessions,
  templates,
  isAdmin,
}: {
  projectId: string;
  sessions: DiscoverySessionSummary[];
  templates: DiscoveryFormTemplate[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [viewing, setViewing] = useState<SessionResponses | null>(null);
  const [viewingLinkId, setViewingLinkId] = useState<string | null>(null);
  const [loadingViewId, setLoadingViewId] = useState<string | null>(null);

  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const [sessionName, setSessionName] = useState("");
  const [department, setDepartment] = useState("");
  const [expiration, setExpiration] = useState("7");
  const [saving, setSaving] = useState(false);

  const respondedSessions = sessions.filter((s) => s.responsesCount > 0).length;

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!templateId) {
      toast.error("اختر قالبًا للجلسة.");
      return;
    }
    setSaving(true);
    const result = await createDiscoverySession(projectId, {
      templateId,
      sessionName: sessionName.trim() || "جلسة اكتشاف",
      department: department.trim() || undefined,
      expirationValue: expiration,
    });
    setSaving(false);
    if (!result.ok) {
      toast.error(result.message ?? "فشل إنشاء الجلسة.");
      return;
    }
    toast.success("تم إنشاء الجلسة — رابطها جاهز.");
    setCreating(false);
    setSessionName("");
    setDepartment("");
    router.refresh();
  }

  async function handleCopy(session: DiscoverySessionSummary) {
    await navigator.clipboard.writeText(publicUrl(session.link.token));
    setCopiedId(session.link.id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  async function handleRegenerate(id: string) {
    setBusyId(id);
    const result = await regenerateSessionLink(id, "7");
    setBusyId(null);
    if (!result.ok) return toast.error(result.message ?? "فشل التوليد.");
    toast.success("تم توليد رابط جديد للجلسة.");
    router.refresh();
  }

  async function handleCancelReopen(session: DiscoverySessionSummary) {
    setBusyId(session.link.id);
    const isCancelled = session.link.status === "cancelled";
    const result = isCancelled
      ? await reopenSessionSubmission(session.link.id)
      : await cancelDiscoverySession(session.link.id);
    setBusyId(null);
    if (!result.ok) return toast.error(result.message ?? "فشلت العملية.");
    router.refresh();
  }

  async function handleRenew(id: string, value: string) {
    setBusyId(id);
    const result = await renewDiscoverySession(id, value);
    setBusyId(null);
    if (!result.ok) return toast.error(result.message ?? "فشل التجديد.");
    toast.success("تم تجديد صلاحية الرابط (نفس الرابط).");
    router.refresh();
  }

  async function handleView(session: DiscoverySessionSummary) {
    setLoadingViewId(session.link.id);
    const result = await getSessionResponses(session.link.id);
    setLoadingViewId(null);
    if (!result.ok) return toast.error(result.message ?? "تعذّر جلب الإجابات.");
    setViewingLinkId(session.link.id);
    setViewing(result);
  }

  async function handleDelete(session: DiscoverySessionSummary) {
    if (!window.confirm(`حذف جلسة «${session.link.session_name ?? "اكتشاف"}» نهائيًا؟ ده مش هيأثر على أي جلسة تانية، ولا يمكن التراجع.`)) return;
    setBusyId(session.link.id);
    const result = await deleteDiscoverySession(session.link.id);
    setBusyId(null);
    if (!result.ok) return toast.error(result.message ?? "فشل الحذف.");
    toast.success("تم حذف الجلسة.");
    router.refresh();
  }

  return (
    <Card padding="md">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold text-[var(--v-text)]">
            <Layers size={16} className="text-[var(--v-primary)]" /> جلسات الاكتشاف (Workspace)
          </p>
          <p className="mt-0.5 text-[11px] text-[var(--v-text-muted)]">
            {sessions.length} جلسة · {respondedSessions} فيها استجابات — كل الاستجابات بتتجمّع في معرفة واحدة يقرأها الـ AI.
          </p>
        </div>
        {isAdmin && (
          <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={() => setCreating(true)} disabled={templates.length === 0}>
            جلسة جديدة
          </Button>
        )}
      </div>

      {sessions.length === 0 && (
        <p className="rounded-[var(--v-radius-md)] border border-dashed border-[var(--v-border)] p-5 text-center text-xs text-[var(--v-text-muted)]">
          مفيش جلسات لسه. أنشئ جلسة (مثلًا «المحاسبة» أو «المبيعات») أو ولّد نموذجًا بالذكاء الاصطناعي ثم أنشئ جلسة منه.
        </p>
      )}

      <div className="space-y-2.5">
        {sessions.map((session) => {
          const s = session.link;
          const busy = busyId === s.id;
          return (
            <div key={s.id} className="rounded-[var(--v-radius-md)] border border-[var(--v-border)] p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-medium text-[var(--v-text)]">
                    {s.session_name ?? "جلسة اكتشاف"}
                    {s.department && (
                      <span className="rounded-full bg-[var(--v-surface)] px-2 py-0.5 text-[10px] text-[var(--v-text-muted)]">{s.department}</span>
                    )}
                  </p>
                  <p className="mt-0.5 text-[11px] text-[var(--v-text-subtle)]">
                    {session.templateName ?? "بلا قالب"} · {session.questionCount} سؤال · {new Date(s.created_at).toLocaleDateString("ar-EG")}
                  </p>
                </div>
                <Badge tone={STATUS_TONE[s.status] ?? "neutral"}>{STATUS_LABELS[s.status] ?? s.status}</Badge>
              </div>

              <div className="mt-2 flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--v-surface-2)]">
                  <div className="h-full rounded-full bg-[var(--v-primary)]" style={{ width: `${session.completionPct}%` }} />
                </div>
                <span className="font-mono-plex text-[10px] text-[var(--v-text-muted)]">{session.completionPct}% · {session.answeredCount}/{session.questionCount}</span>
              </div>

              <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-[var(--v-border)] pt-2.5">
                {session.responsesCount > 0 && (
                  <button
                    type="button"
                    onClick={() => handleView(session)}
                    disabled={loadingViewId === s.id}
                    className="inline-flex items-center gap-1 rounded-[var(--v-radius-md)] border border-[var(--v-primary)]/40 bg-[var(--v-primary)]/5 px-2 py-1 text-[11px] font-medium text-[var(--v-primary)] hover:bg-[var(--v-primary)]/10 disabled:opacity-50"
                  >
                    {loadingViewId === s.id ? <Loader2 size={12} className="animate-spin" /> : <Eye size={12} />} عرض الإجابات
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleCopy(session)}
                  className="inline-flex items-center gap-1 rounded-[var(--v-radius-md)] border border-[var(--v-border)] px-2 py-1 text-[11px] text-[var(--v-text)] hover:border-[var(--v-primary)]"
                >
                  {copiedId === s.id ? <Check size={12} className="text-[var(--v-green)]" /> : <Copy size={12} />} نسخ الرابط
                </button>
                <a
                  href={publicUrl(s.token)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-[var(--v-radius-md)] border border-[var(--v-border)] px-2 py-1 text-[11px] text-[var(--v-text)] hover:border-[var(--v-primary)]"
                >
                  <ExternalLink size={12} /> فتح
                </a>
                {isAdmin && (
                  <>
                    <select
                      value=""
                      disabled={busy}
                      onChange={(e) => { if (e.target.value) handleRenew(s.id, e.target.value); }}
                      title="تجديد صلاحية الرابط (نفس الرابط)"
                      className="rounded-[var(--v-radius-md)] border border-[var(--v-border)] px-2 py-1 text-[11px] text-[var(--v-text)] outline-none hover:border-[var(--v-primary)] disabled:opacity-50"
                    >
                      <option value="">تجديد…</option>
                      <option value="24h">يوم</option>
                      <option value="7">أسبوع</option>
                      <option value="30">شهر</option>
                      <option value="never">دائم</option>
                    </select>
                    <button type="button" onClick={() => handleRegenerate(s.id)} disabled={busy} title="توليد رابط جديد" className="rounded-[var(--v-radius-md)] border border-[var(--v-border)] p-1.5 text-[var(--v-text-muted)] hover:border-[var(--v-primary)] disabled:opacity-50">
                      <RefreshCw size={12} />
                    </button>
                    <button type="button" onClick={() => handleCancelReopen(session)} disabled={busy} title={s.status === "cancelled" ? "إعادة فتح" : "إيقاف"} className="rounded-[var(--v-radius-md)] border border-[var(--v-border)] p-1.5 text-[var(--v-text-muted)] hover:border-[var(--v-primary)] disabled:opacity-50">
                      {s.status === "cancelled" ? <RotateCcw size={12} /> : <Ban size={12} />}
                    </button>
                    <button type="button" onClick={() => handleDelete(session)} disabled={busy} title="حذف نهائي" className="rounded-[var(--v-radius-md)] border border-[var(--v-border)] p-1.5 text-[var(--v-text-muted)] hover:border-[var(--v-red)] hover:text-[var(--v-red)] disabled:opacity-50">
                      <Trash2 size={12} />
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <Modal open={creating} onClose={() => setCreating(false)}>
        <form onSubmit={handleCreate} className="space-y-3">
          <p className="text-sm font-semibold text-[var(--v-text)]">جلسة اكتشاف جديدة</p>
          <div>
            <label className="mb-1 block text-xs text-[var(--v-text-muted)]">القالب (الأسئلة)</label>
            <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} className="w-full rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-bg)] px-3 py-2 text-sm text-[var(--v-text)] outline-none focus:border-[var(--v-primary)]">
              {templates.map((t) => (
                <option key={t.id} value={t.id}>{t.name}{t.source === "ai_generated" ? " · AI" : ""}</option>
              ))}
            </select>
          </div>
          <Input label="اسم الجلسة" value={sessionName} onChange={(e) => setSessionName(e.target.value)} placeholder="مثلًا: اكتشاف المحاسبة" required />
          <Input label="الإدارة (اختياري)" value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="مثلًا: المحاسبة" />
          <div>
            <label className="mb-1 block text-xs text-[var(--v-text-muted)]">مدة الرابط</label>
            <select value={expiration} onChange={(e) => setExpiration(e.target.value)} className="w-full rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-bg)] px-3 py-2 text-sm text-[var(--v-text)] outline-none focus:border-[var(--v-primary)]">
              <option value="24h">يوم</option>
              <option value="7">أسبوع</option>
              <option value="30">شهر</option>
              <option value="never">بلا انتهاء</option>
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={() => setCreating(false)}>إلغاء</Button>
            <Button type="submit" variant="primary" loading={saving}>إنشاء الجلسة</Button>
          </div>
        </form>
      </Modal>

      {/* عارض إجابات الجلسة — كل سؤال وإجابة العميل، مجمّعة حسب القسم */}
      <Modal open={!!viewing} onClose={() => setViewing(null)} maxWidth="max-w-2xl">
        {viewing && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--v-border)] pb-3">
              <div>
                <p className="text-sm font-semibold text-[var(--v-text)]">
                  إجابات: {viewing.sessionName ?? "جلسة اكتشاف"}
                </p>
                <p className="mt-0.5 text-[11px] text-[var(--v-text-muted)]">
                  {viewing.answeredCount}/{viewing.totalCount} سؤال مُجاب
                  {viewing.submittedAt
                    ? ` · تم التسليم ${new Date(viewing.submittedAt).toLocaleString("ar-EG")}`
                    : " · لسه قيد التعبئة (مسودة)"}
                </p>
              </div>
              <Badge tone={STATUS_TONE[viewing.status ?? ""] ?? "neutral"}>
                {STATUS_LABELS[viewing.status ?? ""] ?? viewing.status ?? "—"}
              </Badge>
            </div>

            {viewing.items.length === 0 ? (
              <p className="flex items-center justify-center gap-2 rounded-[var(--v-radius-md)] border border-dashed border-[var(--v-border)] p-6 text-center text-xs text-[var(--v-text-muted)]">
                <Inbox size={14} /> مفيش أسئلة في هذه الجلسة.
              </p>
            ) : (
              <div className="max-h-[60vh] space-y-4 overflow-y-auto pe-1">
                {groupByCategory(viewing.items).map((group) => (
                  <div key={group.category ?? "__none"}>
                    {group.category && (
                      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--v-text-subtle)]">
                        {group.category}
                      </p>
                    )}
                    <div className="space-y-2">
                      {group.items.map((item) => (
                        <div key={item.key} className="rounded-[var(--v-radius-md)] border border-[var(--v-border)] p-3">
                          <p className="text-xs font-medium text-[var(--v-text-secondary)]">{item.label}</p>
                          {item.answered ? (
                            <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--v-text)]">{formatAnswer(item.answer)}</p>
                          ) : (
                            <p className="mt-1 text-xs italic text-[var(--v-text-muted)]">— لم يُجب عليه —</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
              {viewingLinkId && (
                <a
                  href={`/discovery-responses-print/${viewingLinkId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-[var(--v-radius-md)] bg-[var(--v-primary)] px-3 py-2 text-sm font-medium text-white transition hover:opacity-90"
                >
                  <FileDown size={15} /> تنزيل PDF احترافي
                </a>
              )}
              <Button type="button" variant="ghost" onClick={() => setViewing(null)}>إغلاق</Button>
            </div>
          </div>
        )}
      </Modal>
    </Card>
  );
}

/** يجمّع بنود الإجابات حسب القسم مع الحفاظ على ترتيب أول ظهور. */
function groupByCategory(
  items: SessionResponses["items"]
): Array<{ category: string | null; items: SessionResponses["items"] }> {
  const groups: Array<{ category: string | null; items: SessionResponses["items"] }> = [];
  const index = new Map<string, number>();
  for (const item of items) {
    const cat = item.category ?? null;
    const mapKey = cat ?? "__none";
    if (!index.has(mapKey)) {
      index.set(mapKey, groups.length);
      groups.push({ category: cat, items: [] });
    }
    groups[index.get(mapKey)!].items.push(item);
  }
  return groups;
}
