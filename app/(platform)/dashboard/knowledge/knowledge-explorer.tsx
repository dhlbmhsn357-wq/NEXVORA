"use client";

import { useMemo, useState } from "react";
import { LayoutGrid, List, Table as TableIcon, Search } from "lucide-react";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import { categoryLabel } from "@/lib/knowledge-hub/model";
import {
  applyExplorer,
  type ExplorerItem,
  type ExplorerFilters,
  type ExplorerSort,
} from "@/lib/knowledge-hub/explorer/filters";
import type { ExplorerData } from "./explorer-actions";

/**
 * مستكشف المعرفة — بيئة تصفّح بنمط Notion/Confluence مخصّصة للمشاريع.
 *
 * ثلاثة عروض (قائمة · جدول · بطاقات) + شريط فلاتر + بحث فوري. الفلترة
 * والترتيب في العميل عبر `applyExplorer` النقي — تفاعل لحظي بلا رحلة
 * خادم لكل ضغطة.
 */

type ViewMode = "list" | "table" | "cards";

const STATUS_LABELS: Record<string, string> = {
  active: "نشط",
  archived: "مؤرشف",
  merged: "مدمج",
  rejected: "مرفوض",
  superseded: "متجاوَز",
};

function statusLabel(s: string): string {
  return STATUS_LABELS[s] ?? s;
}

export default function KnowledgeExplorer({ data }: { data: ExplorerData }) {
  const [view, setView] = useState<ViewMode>("cards");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("");
  const [status, setStatus] = useState<string>("");
  const [minConfidence, setMinConfidence] = useState<number>(0);
  const [sort, setSort] = useState<ExplorerSort>("recent");

  const filters: ExplorerFilters = useMemo(
    () => ({
      search: search.trim() || undefined,
      category: category || null,
      status: status || null,
      minConfidence: minConfidence || null,
    }),
    [search, category, status, minConfidence]
  );

  const results = useMemo(
    () => applyExplorer(data.items, filters, sort),
    [data.items, filters, sort]
  );

  if (data.items.length === 0) {
    return (
      <Card padding="md">
        <p className="text-sm text-[var(--v-text-muted)]">
          لا توجد عناصر معرفة بعد. ارفع مصادر في مركز المعرفة لتظهر هنا.
        </p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* شريط الأدوات */}
      <Card padding="md">
        <div className="flex flex-wrap items-center gap-3">
          {/* بحث */}
          <div className="relative min-w-[200px] flex-1">
            <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--v-text-muted)]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="بحث في المعرفة…"
              className="w-full rounded-[var(--v-radius-sm)] border border-[var(--v-border)] bg-[var(--v-bg)] py-2 pr-9 pl-3 text-sm text-[var(--v-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--v-primary)]"
            />
          </div>

          {/* الفلاتر */}
          <FilterSelect value={category} onChange={setCategory} placeholder="كل التصنيفات"
            options={data.facets.categories.map((c) => ({ value: c, label: categoryLabel(c) }))} />
          <FilterSelect value={status} onChange={setStatus} placeholder="كل الحالات"
            options={data.facets.statuses.map((s) => ({ value: s, label: statusLabel(s) }))} />
          <FilterSelect value={String(minConfidence)} onChange={(v) => setMinConfidence(Number(v))} placeholder="أي ثقة"
            options={[{ value: "60", label: "ثقة ≥ ٦٠٪" }, { value: "80", label: "ثقة ≥ ٨٠٪" }]} />
          <FilterSelect value={sort} onChange={(v) => setSort(v as ExplorerSort)} placeholder="ترتيب"
            options={[{ value: "recent", label: "الأحدث" }, { value: "confidence", label: "الأعلى ثقة" }, { value: "title", label: "أبجديًا" }]} />

          {/* مبدّل العرض */}
          <div className="flex items-center gap-1 rounded-[var(--v-radius-sm)] border border-[var(--v-border)] p-0.5">
            <ViewBtn active={view === "cards"} onClick={() => setView("cards")} icon={<LayoutGrid size={15} />} />
            <ViewBtn active={view === "list"} onClick={() => setView("list")} icon={<List size={15} />} />
            <ViewBtn active={view === "table"} onClick={() => setView("table")} icon={<TableIcon size={15} />} />
          </div>
        </div>

        <p className="mt-2 font-mono-plex text-xs text-[var(--v-text-muted)]">
          {results.length} من {data.items.length} عنصر
        </p>
      </Card>

      {/* النتائج */}
      {results.length === 0 ? (
        <Card padding="md">
          <p className="text-sm text-[var(--v-text-muted)]">لا نتائج تطابق الفلاتر الحالية.</p>
        </Card>
      ) : view === "cards" ? (
        <CardsView items={results} />
      ) : view === "list" ? (
        <ListView items={results} />
      ) : (
        <TableView items={results} />
      )}
    </div>
  );
}

function ViewBtn({ active, onClick, icon }: { active: boolean; onClick: () => void; icon: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-[var(--v-radius-xs)] p-1.5 transition-colors ${
        active ? "bg-[var(--v-primary)] text-white" : "text-[var(--v-text-muted)] hover:bg-[var(--v-surface-2)]"
      }`}
    >
      {icon}
    </button>
  );
}

function FilterSelect({
  value, onChange, placeholder, options,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-[var(--v-radius-sm)] border border-[var(--v-border)] bg-[var(--v-bg)] px-2 py-2 text-xs text-[var(--v-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--v-primary)]"
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

function ConfidenceBadge({ confidence }: { confidence: number }) {
  const tone = confidence >= 80 ? "success" : confidence >= 60 ? "info" : "warning";
  return <Badge tone={tone}>{confidence}٪</Badge>;
}

function CardsView({ items }: { items: ExplorerItem[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => (
        <Card key={item.id} padding="md">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-sm font-semibold text-[var(--v-text)]">{item.title || "بلا عنوان"}</h3>
            <ConfidenceBadge confidence={item.confidence} />
          </div>
          <p className="mt-2 line-clamp-3 text-xs text-[var(--v-text-muted)]">{item.content}</p>
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <Badge tone="neutral">{categoryLabel(item.category)}</Badge>
            {item.status !== "active" && <Badge tone="warning">{statusLabel(item.status)}</Badge>}
          </div>
        </Card>
      ))}
    </div>
  );
}

function ListView({ items }: { items: ExplorerItem[] }) {
  return (
    <Card padding="none">
      <ul className="divide-y divide-[var(--v-border)]">
        {items.map((item) => (
          <li key={item.id} className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-[var(--v-text)]">{item.title || "بلا عنوان"}</p>
              <p className="truncate text-xs text-[var(--v-text-muted)]">{item.content}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Badge tone="neutral">{categoryLabel(item.category)}</Badge>
              <ConfidenceBadge confidence={item.confidence} />
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function TableView({ items }: { items: ExplorerItem[] }) {
  return (
    <Card padding="none">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-right text-sm">
          <thead>
            <tr className="border-b border-[var(--v-border)] text-xs text-[var(--v-text-muted)]">
              <th className="px-4 py-2 font-medium">العنوان</th>
              <th className="px-4 py-2 font-medium">التصنيف</th>
              <th className="px-4 py-2 font-medium">الحالة</th>
              <th className="px-4 py-2 font-medium">الثقة</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--v-border)]">
            {items.map((item) => (
              <tr key={item.id} className="hover:bg-[var(--v-surface-2)]">
                <td className="max-w-[280px] truncate px-4 py-2.5 text-[var(--v-text)]">{item.title || "بلا عنوان"}</td>
                <td className="px-4 py-2.5"><Badge tone="neutral">{categoryLabel(item.category)}</Badge></td>
                <td className="px-4 py-2.5 text-[var(--v-text-muted)]">{statusLabel(item.status)}</td>
                <td className="px-4 py-2.5"><ConfidenceBadge confidence={item.confidence} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
