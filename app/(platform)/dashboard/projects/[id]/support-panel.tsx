"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { generateWidgetKey, revokeWidgetKey, changeSupportRequestStatus, assignSupportRequest } from "./support-actions";
import { promoteSupportTicketToIncidentAction } from "./production-monitoring-actions";
import SupportAttachmentImage from "./support-attachment-image";
import { Headset, Check, ThumbsUp, ThumbsDown, AlertTriangle } from "lucide-react";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import BottomSheet from "@/components/ui/BottomSheet";
import FilterChip from "@/components/ui/FilterChip";
import EmptyState from "@/components/ui/EmptyState";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import { useHighlightTarget } from "@/lib/navigation/use-highlight-target";
import type {
  SupportRequest,
  SupportRequestType,
  SupportResolutionStatus,
} from "@/lib/types/database";

interface TeamMember {
  id: string;
  full_name: string | null;
  email: string | null;
}

const typeLabels: Record<SupportRequestType, string> = {
  usage_question: "سؤال استخدام",
  usage_problem: "مشكلة استخدام",
  bug: "Bug",
  feature_request: "Feature Request",
  change_request: "Change Request",
  unclear: "غير واضح",
};

const statusLabels: Record<SupportResolutionStatus, string> = {
  open: "مفتوح",
  auto_resolved: "اتحل تلقائيًا",
  escalated: "مُصعّد",
  in_progress: "قيد المعالجة",
  resolved: "تم الحل",
};

const statusTones: Record<SupportResolutionStatus, "neutral" | "success" | "danger" | "warning"> = {
  open: "neutral",
  auto_resolved: "success",
  escalated: "danger",
  in_progress: "warning",
  resolved: "success",
};

export default function SupportPanel({
  projectId,
  widgetKey,
  requests,
  teamMembers,
}: {
  projectId: string;
  widgetKey: string | null;
  requests: SupportRequest[];
  teamMembers: TeamMember[];
}) {
  const router = useRouter();
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [statusFilter, setStatusFilter] = useState<SupportResolutionStatus | "all">("all");
  const [typeFilter, setTypeFilter] = useState<SupportRequestType | "all">("all");
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filtersSheetOpen, setFiltersSheetOpen] = useState(false);

  const widgetUrl = widgetKey
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/widget/${widgetKey}`
    : null;
  const embedSnippet = widgetUrl
    ? `<iframe src="${widgetUrl}" style="width:100%;max-width:420px;height:600px;border:0;" title="Support"></iframe>`
    : "";

  async function handleGenerateWidget() {
    setGenerating(true);
    await generateWidgetKey(projectId);
    setGenerating(false);
    router.refresh();
  }

  async function handleRevokeWidget() {
    if (
      !window.confirm(
        "الرابط الحالي هيتوقف عن الشغل فورًا — لو متضمّن في موقع العميل مباشرة، هيتكسر على طول. متأكد؟"
      )
    ) {
      return;
    }
    await revokeWidgetKey(projectId);
    router.refresh();
  }

  async function handleCopySnippet() {
    if (!embedSnippet) return;
    await navigator.clipboard.writeText(embedSnippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleStatusChange(requestId: string, status: SupportResolutionStatus) {
    await changeSupportRequestStatus(projectId, requestId, status);
    router.refresh();
  }

  async function handleAssign(requestId: string, assigneeId: string | null) {
    await assignSupportRequest(projectId, requestId, assigneeId);
    router.refresh();
  }

  // كشف الطلبات المتكررة — حتمي بالكامل (بدون AI): نفس customer_identifier
  // في نفس المشروع، وأكتر من طلب غير محلول. المقارنة بعد توحيد الصيغة
  // (trim + lowercase) عشان فراغ زيادة أو حروف كبيرة/صغيرة ما يمنعش الكشف.
  function normalizeIdentifier(value: string): string {
    return value.trim().toLowerCase();
  }

  const repeatedIds = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of requests) {
      if (!r.customer_identifier) continue;
      if (r.resolution_status === "resolved" || r.resolution_status === "auto_resolved") continue;
      const key = normalizeIdentifier(r.customer_identifier);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const ids = new Set<string>();
    for (const r of requests) {
      if (r.customer_identifier && (counts.get(normalizeIdentifier(r.customer_identifier)) ?? 0) > 1) {
        ids.add(r.id);
      }
    }
    return ids;
  }, [requests]);

  const pendingCount = requests.filter(
    (r) => r.resolution_status === "escalated" || r.resolution_status === "in_progress"
  ).length;

  const filtered = useMemo(() => {
    return requests
      .filter((r) => statusFilter === "all" || r.resolution_status === statusFilter)
      .filter((r) => typeFilter === "all" || r.request_type === typeFilter)
      .filter((r) => {
        if (!search.trim()) return true;
        const q = search.trim().toLowerCase();
        const summary = "problem_description" in r.structured_summary ? r.structured_summary.problem_description : "";
        return (
          (r.customer_identifier ?? "").toLowerCase().includes(q) ||
          summary.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [requests, statusFilter, typeFilter, search]);

  const activeFilterCount = (statusFilter !== "all" ? 1 : 0) + (typeFilter !== "all" ? 1 : 0);

  function renderFilterSelects() {
    return (
      <>
        <div className="w-full sm:w-40">
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as SupportResolutionStatus | "all")}>
            <option value="all">كل الحالات</option>
            {(Object.keys(statusLabels) as SupportResolutionStatus[]).map((s) => (
              <option key={s} value={s}>
                {statusLabels[s]}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-full sm:w-40">
          <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as SupportRequestType | "all")}>
            <option value="all">كل الأنواع</option>
            {(Object.keys(typeLabels) as SupportRequestType[]).map((t) => (
              <option key={t} value={t}>
                {typeLabels[t]}
              </option>
            ))}
          </Select>
        </div>
      </>
    );
  }

  return (
    <div>
      <Card padding="md" className="mb-4">
        <p className="mb-2 text-sm font-semibold text-[var(--v-text)]">Support Widget</p>
        {widgetUrl ? (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <code dir="ltr" className="flex-1 truncate rounded-[var(--v-radius-md)] bg-[var(--v-surface)] px-3 py-2 text-xs text-[var(--v-text)]">
                {widgetUrl}
              </code>
              <Button variant="outline" size="sm" onClick={handleCopySnippet}>
                {copied ? (
                  <>
                    <Check size={13} /> تم النسخ
                  </>
                ) : (
                  "Copy Embed Snippet"
                )}
              </Button>
              <Button variant="danger" size="sm" onClick={handleRevokeWidget}>
                Revoke
              </Button>
            </div>
            <pre dir="ltr" className="overflow-x-auto rounded-[var(--v-radius-md)] bg-[var(--v-surface)] p-2 text-left text-[11px] text-[var(--v-text-muted)]">
              {embedSnippet}
            </pre>
          </div>
        ) : (
          <Button variant="primary" onClick={handleGenerateWidget} loading={generating}>
            تفعيل Widget لهذا المشروع
          </Button>
        )}
      </Card>

      <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
        <Badge>إجمالي: {requests.length}</Badge>
        {pendingCount > 0 && (
          <Badge tone="warning">
            بانتظار المتابعة: {pendingCount}
          </Badge>
        )}
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <div className="flex-1">
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث بالعميل أو وصف المشكلة…" />
        </div>
        <div className="hidden items-center gap-2 sm:flex">{renderFilterSelects()}</div>
        <Button variant="outline" size="sm" className="sm:hidden" onClick={() => setFiltersSheetOpen(true)}>
          فلاتر{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
        </Button>
      </div>

      <BottomSheet open={filtersSheetOpen} onClose={() => setFiltersSheetOpen(false)} title="فلاتر طلبات الدعم">
        <div className="flex flex-col gap-2">{renderFilterSelects()}</div>
      </BottomSheet>

      {(statusFilter !== "all" || typeFilter !== "all") && (
        <div className="mb-4 flex flex-wrap gap-2">
          {statusFilter !== "all" && (
            <FilterChip label={`الحالة: ${statusLabels[statusFilter]}`} onRemove={() => setStatusFilter("all")} />
          )}
          {typeFilter !== "all" && (
            <FilterChip label={`النوع: ${typeLabels[typeFilter]}`} onRemove={() => setTypeFilter("all")} />
          )}
        </div>
      )}

      {filtered.length === 0 && <EmptyState icon={<Headset size={28} />} title="مفيش طلبات دعم مطابقة" />}

      <div className="space-y-2">
        {filtered.map((r) => (
          <RequestCard
            key={r.id}
            projectId={projectId}
            request={r}
            repeated={repeatedIds.has(r.id)}
            expanded={expandedId === r.id}
            onToggle={() => setExpandedId(expandedId === r.id ? null : r.id)}
            onStatusChange={(status) => handleStatusChange(r.id, status)}
            onAssign={(assigneeId) => handleAssign(r.id, assigneeId)}
            teamMembers={teamMembers}
          />
        ))}
      </div>
    </div>
  );
}

function RequestCard({
  projectId,
  request,
  repeated,
  expanded,
  onToggle,
  onStatusChange,
  onAssign,
  teamMembers,
}: {
  projectId: string;
  request: SupportRequest;
  repeated: boolean;
  teamMembers: TeamMember[];
  onAssign: (assigneeId: string | null) => void;
  expanded: boolean;
  onToggle: () => void;
  onStatusChange: (status: SupportResolutionStatus) => void;
}) {
  const router = useRouter();
  const [promoting, setPromoting] = useState(false);
  const summary = "problem_description" in request.structured_summary ? request.structured_summary : null;
  const diagnosis = "probable_cause" in request.ai_diagnosis ? request.ai_diagnosis : null;
  const highlightRef = useHighlightTarget<HTMLDivElement>(request.id);

  async function handlePromote() {
    setPromoting(true);
    const result = await promoteSupportTicketToIncidentAction(projectId, request.id);
    setPromoting(false);
    if (result.ok) router.refresh();
  }

  return (
    <div ref={highlightRef}>
    <Card padding="none">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between gap-3 p-3 text-right focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--v-primary)]"
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-[var(--v-text)]">
            {summary?.problem_description || "(بدون وصف)"}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-[var(--v-text-muted)]">
            <span>{typeLabels[request.request_type]}</span>
            <span>{request.customer_identifier ?? "عميل غير محدد"}</span>
            <span>{new Date(request.created_at).toLocaleString("ar-EG")}</span>
            {repeated && <Badge tone="warning">متكرر</Badge>}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {request.satisfaction_rating === 1 && (
            <span title="العميل راضٍ" className="text-[var(--v-green)]">
              <ThumbsUp size={13} />
            </span>
          )}
          {request.satisfaction_rating === -1 && (
            <span title="العميل غير راضٍ" className="text-[var(--v-red)]">
              <ThumbsDown size={13} />
            </span>
          )}
          <Badge tone={statusTones[request.resolution_status]}>{statusLabels[request.resolution_status]}</Badge>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-[var(--v-border)] p-3">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <label className="text-[11px] text-[var(--v-text-muted)]">تغيير الحالة:</label>
            <select
              value={request.resolution_status}
              onChange={(e) => onStatusChange(e.target.value as SupportResolutionStatus)}
              className="rounded-[var(--v-radius-sm)] border border-[var(--v-border)] bg-[var(--v-bg)] px-2 py-1 text-[11px] text-[var(--v-text)]"
            >
              {(Object.keys(statusLabels) as SupportResolutionStatus[]).map((s) => (
                <option key={s} value={s}>
                  {statusLabels[s]}
                </option>
              ))}
            </select>
            <label className="text-[11px] text-[var(--v-text-muted)]">المسؤول:</label>
            <select
              value={request.assigned_to ?? ""}
              onChange={(e) => onAssign(e.target.value || null)}
              className="rounded-[var(--v-radius-sm)] border border-[var(--v-border)] bg-[var(--v-bg)] px-2 py-1 text-[11px] text-[var(--v-text)]"
            >
              <option value="">بدون تعيين</option>
              {teamMembers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.full_name || m.email || m.id}
                </option>
              ))}
            </select>
            {request.escalated_at && (
              <span className="text-[11px] text-[var(--v-text-muted)]">
                اتصعّد: {new Date(request.escalated_at).toLocaleString("ar-EG")}
              </span>
            )}
            {request.resolved_at && (
              <span className="text-[11px] text-[var(--v-text-muted)]">
                اتحل: {new Date(request.resolved_at).toLocaleString("ar-EG")}
              </span>
            )}
          </div>

          {summary && (
            <div className="mb-3 rounded-[var(--v-radius-md)] bg-[var(--v-surface)] p-3 text-xs text-[var(--v-text)]">
              <p>
                <strong>الوصف:</strong> {summary.problem_description}
              </p>
              {summary.started_when && (
                <p>
                  <strong>بدأت متى:</strong> {summary.started_when}
                </p>
              )}
              {summary.reproduction_steps && (
                <p>
                  <strong>خطوات إعادة الإنتاج:</strong> {summary.reproduction_steps}
                </p>
              )}
              {summary.current_result && (
                <p>
                  <strong>النتيجة الحالية:</strong> {summary.current_result}
                </p>
              )}
              {summary.expected_result && (
                <p>
                  <strong>النتيجة المتوقعة:</strong> {summary.expected_result}
                </p>
              )}
              <p>
                <strong>الأولوية:</strong> {summary.priority}
              </p>
              {summary.attachments.length > 0 && (
                <div className="mt-2">
                  <strong>المرفقات:</strong>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {summary.attachments.map((path) => (
                      <SupportAttachmentImage key={path} path={path} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {(request.related_prd_section || request.related_brain_fact) && (
            <div className="mb-3 flex flex-wrap gap-2 text-[11px] text-[var(--v-text-muted)]">
              {request.related_prd_section && <span>PRD: {request.related_prd_section}</span>}
              {request.related_brain_fact && <span>Brain: {request.related_brain_fact}</span>}
            </div>
          )}

          {diagnosis && (
            <div className="mb-3 rounded-[var(--v-radius-md)] border border-[var(--v-amber)]/30 bg-[var(--v-amber)]/5 p-3 text-xs text-[var(--v-text)]">
              <p className="mb-1 flex items-center gap-1.5 font-semibold text-[var(--v-amber)]">
                <AlertTriangle size={13} /> تشخيص AI أولي (ثقة {diagnosis.confidence}%)
              </p>
              <p>
                <strong>السبب المحتمل:</strong> {diagnosis.probable_cause}
              </p>
              <p>
                <strong>حل مقترح:</strong> {diagnosis.suggested_fix}
              </p>
            </div>
          )}

          {(Object.keys(request.browser_info).length > 0 || Object.keys(request.environment_info).length > 0 || request.recent_client_errors.length > 0) && (
            <details className="mb-3 rounded-[var(--v-radius-md)] border border-[var(--v-border)] p-2">
              <summary className="cursor-pointer text-[11px] font-medium text-[var(--v-text-muted)]">تشخيصات تلقائية (متصفح/بيئة/أخطاء)</summary>
              <div className="mt-2 space-y-1 text-[11px] text-[var(--v-text-muted)]">
                {"userAgent" in request.browser_info && <p>المتصفح: {String(request.browser_info.userAgent)}</p>}
                {"url" in request.environment_info && <p>الرابط: {String(request.environment_info.url)}</p>}
                {"viewport" in request.environment_info && <p>حجم الشاشة: {String(request.environment_info.viewport)}</p>}
                {request.recent_client_errors.length > 0 && (
                  <div>
                    <p className="font-medium">أخطاء حديثة:</p>
                    {request.recent_client_errors.map((e, i) => (
                      <p key={i} className="truncate">
                        - {e.message}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            </details>
          )}

          <div className="mb-3">
            <Button variant="outline" size="sm" onClick={handlePromote} loading={promoting}>
              <AlertTriangle size={13} /> ترقية لحادثة Production
            </Button>
          </div>

          <p className="mb-2 text-xs font-semibold text-[var(--v-text-muted)]">المحادثة الكاملة</p>
          <div dir="ltr" className="max-h-[300px] space-y-2 overflow-y-auto rounded-[var(--v-radius-md)] bg-[var(--v-surface)] p-3 text-left">
            {request.conversation_transcript.map((m, i) => (
              <div key={i} className={`flex ${m.role === "customer" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[80%] rounded-[var(--v-radius-md)] px-2 py-1 text-xs ${
                    m.role === "customer" ? "bg-[var(--v-primary)] text-white" : "bg-[var(--v-bg)] text-[var(--v-text)]"
                  }`}
                >
                  {m.attachmentPath && (
                    <div className="mb-1">
                      <SupportAttachmentImage path={m.attachmentPath} />
                    </div>
                  )}
                  <p className="whitespace-pre-wrap">{m.content}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
    </div>
  );
}
