"use client";

import { useMemo, useState } from "react";
import { Upload } from "lucide-react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import FilterChip from "@/components/ui/FilterChip";
import EmptyState from "@/components/ui/EmptyState";
import Tabs from "@/components/ui/Tabs";
import { Target } from "lucide-react";
import ProspectsTable from "./prospects-table";
import ImportWizardModal from "./import-wizard-modal";
import TodayContactTab from "./today-contact-tab";
import { listProspectsAction } from "./prospect-actions";
import { compareProspectsForDefaultOrder } from "@/lib/prospecting/sorting";
import { PROSPECT_STATUS_LABELS, PRIORITY_LABELS, CONFIDENCE_LABELS } from "./prospect-ui-constants";
import type { ProspectRow, ProspectStatus, ProspectPriority, ProspectConfidence } from "@/lib/prospecting/types";
import type { ProspectListFilters } from "@/lib/prospecting/service";

export interface AssignableProfile {
  id: string;
  name: string;
}

export default function ProspectsClient({
  initialItems,
  initialHasMore,
  canManage,
  isOwnerOrAdmin,
  currentUserId,
  profiles,
}: {
  initialItems: ProspectRow[];
  initialHasMore: boolean;
  canManage: boolean;
  isOwnerOrAdmin: boolean;
  currentUserId: string | null;
  profiles: AssignableProfile[];
}) {
  const [items, setItems] = useState(initialItems);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loadingMore, setLoadingMore] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const [search, setSearch] = useState("");
  const [sector, setSector] = useState("");
  const [governorate, setGovernorate] = useState("");
  const [priority, setPriority] = useState<ProspectPriority | "all">("all");
  const [confidence, setConfidence] = useState<ProspectConfidence | "all">("all");
  const [status, setStatus] = useState<ProspectStatus | "all">("all");
  const [assignedToMe, setAssignedToMe] = useState(false);
  const [followUpToday, setFollowUpToday] = useState(false);
  const [followUpOverdue, setFollowUpOverdue] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const profileNameById = useMemo(() => new Map(profiles.map((p) => [p.id, p.name])), [profiles]);
  const [nowMs] = useState(() => Date.now());

  function currentFilters(): ProspectListFilters {
    return {
      search: search.trim() || undefined,
      sector: sector || undefined,
      governorate: governorate || undefined,
      priority: priority === "all" ? undefined : priority,
      confidence: confidence === "all" ? undefined : confidence,
      status: status === "all" ? undefined : status,
      assignedTo: assignedToMe && currentUserId ? currentUserId : undefined,
      followUpToday: followUpToday || undefined,
      followUpOverdue: followUpOverdue || undefined,
      includeArchived: showArchived || undefined,
    };
  }

  async function handleLoadMore() {
    setLoadingMore(true);
    const result = await listProspectsAction(currentFilters(), items.length);
    if (result.ok) {
      setItems((prev) => [...prev, ...result.data.items]);
      setHasMore(result.data.hasMore);
    }
    setLoadingMore(false);
  }

  async function refetchFirstPage() {
    const result = await listProspectsAction(currentFilters(), 0);
    if (result.ok) {
      setItems(result.data.items);
      setHasMore(result.data.hasMore);
    }
  }

  const sectors = useMemo(
    () => Array.from(new Set(items.map((p) => p.sector).filter((s): s is string => !!s))).sort(),
    [items]
  );
  const governorates = useMemo(
    () => Array.from(new Set(items.map((p) => p.governorate).filter((g): g is string => !!g))).sort(),
    [items]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((p) => {
      if (!showArchived && p.status === "archived") return false;
      if (sector && p.sector !== sector) return false;
      if (governorate && p.governorate !== governorate) return false;
      if (priority !== "all" && p.priority !== priority) return false;
      if (confidence !== "all" && p.confidence !== confidence) return false;
      if (status !== "all" && p.status !== status) return false;
      if (assignedToMe && p.assignedTo !== currentUserId) return false;
      if (followUpToday) {
        if (!p.nextFollowUpAt) return false;
        const d = new Date(p.nextFollowUpAt);
        const now = new Date();
        if (
          d.getUTCFullYear() !== now.getUTCFullYear() ||
          d.getUTCMonth() !== now.getUTCMonth() ||
          d.getUTCDate() !== now.getUTCDate()
        )
          return false;
      }
      if (followUpOverdue) {
        if (!p.nextFollowUpAt || new Date(p.nextFollowUpAt).getTime() >= nowMs) return false;
      }
      if (!q) return true;
      const name = p.organizationName.toLowerCase();
      const phone = p.primaryPhoneNormalized?.toLowerCase() ?? "";
      return name.includes(q) || phone.includes(q);
    });
  }, [items, search, sector, governorate, priority, confidence, status, assignedToMe, currentUserId, followUpToday, followUpOverdue, showArchived, nowMs]);

  const sorted = useMemo(() => {
    const nowIso = new Date().toISOString();
    return [...filtered].sort((a, b) => compareProspectsForDefaultOrder(a, b, nowIso));
  }, [filtered]);

  const activeFilterChips: { key: string; label: string; onRemove: () => void }[] = [];
  if (sector) activeFilterChips.push({ key: "sector", label: `القطاع: ${sector}`, onRemove: () => setSector("") });
  if (governorate) activeFilterChips.push({ key: "gov", label: `المحافظة: ${governorate}`, onRemove: () => setGovernorate("") });
  if (priority !== "all") activeFilterChips.push({ key: "priority", label: `الأولوية: ${PRIORITY_LABELS[priority]}`, onRemove: () => setPriority("all") });
  if (confidence !== "all") activeFilterChips.push({ key: "confidence", label: `الثقة: ${CONFIDENCE_LABELS[confidence]}`, onRemove: () => setConfidence("all") });
  if (status !== "all") activeFilterChips.push({ key: "status", label: `الحالة: ${PROSPECT_STATUS_LABELS[status]}`, onRemove: () => setStatus("all") });
  if (assignedToMe) activeFilterChips.push({ key: "mine", label: "المسند إليّ", onRemove: () => setAssignedToMe(false) });
  if (followUpToday) activeFilterChips.push({ key: "today", label: "متابعات اليوم", onRemove: () => setFollowUpToday(false) });
  if (followUpOverdue) activeFilterChips.push({ key: "overdue", label: "متابعات متأخرة", onRemove: () => setFollowUpOverdue(false) });
  if (showArchived) activeFilterChips.push({ key: "archived", label: "إظهار المؤرشف", onRemove: () => setShowArchived(false) });

  const listContent = (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-56">
            <Input placeholder="بحث بالاسم أو الهاتف…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="w-40">
            <Select value={sector} onChange={(e) => setSector(e.target.value)}>
              <option value="">كل القطاعات</option>
              {sectors.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </Select>
          </div>
          <div className="w-40">
            <Select value={governorate} onChange={(e) => setGovernorate(e.target.value)}>
              <option value="">كل المحافظات</option>
              {governorates.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </Select>
          </div>
          <div className="w-36">
            <Select value={priority} onChange={(e) => setPriority(e.target.value as ProspectPriority | "all")}>
              <option value="all">كل الأولويات</option>
              {(Object.keys(PRIORITY_LABELS) as ProspectPriority[]).map((p) => (
                <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>
              ))}
            </Select>
          </div>
          <div className="w-36">
            <Select value={confidence} onChange={(e) => setConfidence(e.target.value as ProspectConfidence | "all")}>
              <option value="all">كل درجات الثقة</option>
              {(Object.keys(CONFIDENCE_LABELS) as ProspectConfidence[]).map((c) => (
                <option key={c} value={c}>{CONFIDENCE_LABELS[c]}</option>
              ))}
            </Select>
          </div>
          <div className="w-40">
            <Select value={status} onChange={(e) => setStatus(e.target.value as ProspectStatus | "all")}>
              <option value="all">كل الحالات</option>
              {(Object.keys(PROSPECT_STATUS_LABELS) as ProspectStatus[]).map((s) => (
                <option key={s} value={s}>{PROSPECT_STATUS_LABELS[s]}</option>
              ))}
            </Select>
          </div>
          <Button variant={assignedToMe ? "primary" : "outline"} size="sm" onClick={() => setAssignedToMe((v) => !v)}>
            المسند إليّ
          </Button>
          <Button variant={followUpToday ? "primary" : "outline"} size="sm" onClick={() => setFollowUpToday((v) => !v)}>
            متابعات اليوم
          </Button>
          <Button variant={followUpOverdue ? "primary" : "outline"} size="sm" onClick={() => setFollowUpOverdue((v) => !v)}>
            متابعات متأخرة
          </Button>
          <Button variant={showArchived ? "primary" : "outline"} size="sm" onClick={() => setShowArchived((v) => !v)}>
            إظهار المؤرشف
          </Button>
        </div>
      </div>

      {activeFilterChips.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {activeFilterChips.map((c) => (
            <FilterChip key={c.key} label={c.label} onRemove={c.onRemove} />
          ))}
        </div>
      )}

      {sorted.length === 0 ? (
        <EmptyState
          icon={<Target size={28} />}
          title={items.length === 0 ? "لا توجد جهات بعد" : "لا توجد نتائج مطابقة للفلاتر"}
          description={items.length === 0 ? "ارفع ملف Excel أو CSV لبدء قاعدة الاستهداف." : undefined}
          primaryAction={items.length === 0 && canManage ? { label: "استيراد ملف", onClick: () => setImportOpen(true) } : undefined}
        />
      ) : (
        <ProspectsTable
          items={sorted}
          canManage={canManage}
          isOwnerOrAdmin={isOwnerOrAdmin}
          profiles={profiles}
          profileNameById={profileNameById}
          onChanged={refetchFirstPage}
        />
      )}

      {hasMore && (
        <div className="mt-3 text-center">
          <Button variant="outline" size="sm" onClick={handleLoadMore} loading={loadingMore}>
            تحميل المزيد
          </Button>
        </div>
      )}
    </div>
  );

  return (
    <div>
      <div className="mb-4 flex justify-end">
        {canManage && (
          <Button variant="primary" size="sm" icon={<Upload size={14} />} onClick={() => setImportOpen(true)}>
            استيراد ملف
          </Button>
        )}
      </div>

      <Tabs
        items={[
          { key: "all", label: "كل الجهات", content: listContent },
          {
            key: "today",
            label: "تواصل اليوم",
            content: <TodayContactTab profileNameById={profileNameById} />,
          },
        ]}
      />

      {importOpen && (
        <ImportWizardModal
          onClose={() => setImportOpen(false)}
          onImported={() => {
            setImportOpen(false);
            refetchFirstPage();
          }}
        />
      )}
    </div>
  );
}
