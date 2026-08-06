"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Building2, ExternalLink } from "lucide-react";
import { loadMoreClients, type ClientListItem } from "./load-more-clients-action";
import { stageLabels } from "@/lib/projects/stage-labels";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import Input from "@/components/ui/Input";

const VIRTUALIZE_THRESHOLD = 30;

export default function ClientsList({
  initialClients,
  initialHasMore,
}: {
  initialClients: ClientListItem[];
  initialHasMore: boolean;
}) {
  const [clients, setClients] = useState(initialClients);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loadingMore, setLoadingMore] = useState(false);
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  async function handleLoadMore() {
    setLoadingMore(true);
    const result = await loadMoreClients(clients.length);
    setClients((prev) => [...prev, ...result.items]);
    setHasMore(result.hasMore);
    setLoadingMore(false);
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter((c) => {
      if (c.company_name.toLowerCase().includes(q)) return true;
      if ((c.industry ?? "").toLowerCase().includes(q)) return true;
      if ((c.country ?? "").toLowerCase().includes(q)) return true;
      if (c.contacts.some((x) => x.full_name.toLowerCase().includes(q))) return true;
      if (c.contacts.some((x) => (x.email ?? "").toLowerCase().includes(q))) return true;
      return false;
    });
  }, [clients, search]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizeEnabled = filtered.length > VIRTUALIZE_THRESHOLD;
  // eslint-disable-next-line react-hooks/incompatible-library -- tanstack-virtual returns non-memoizable helpers by design
  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 84,
    overscan: 4,
    enabled: virtualizeEnabled,
  });

  function renderClient(c: ClientListItem) {
    const expanded = expandedId === c.id;
    const recentProject = [...c.projects].sort(
      (a, b) => new Date(b.stage_changed_at).getTime() - new Date(a.stage_changed_at).getTime()
    )[0];

    const rowPadding = virtualizeEnabled ? "p-3" : "p-4";

    return (
      <Card key={c.id} padding="none">
        <div className={`flex items-start justify-between gap-3 ${rowPadding}`}>
          <button
            type="button"
            onClick={() => setExpandedId(expanded ? null : c.id)}
            aria-expanded={expanded}
            className="min-w-0 flex-1 text-right focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--v-primary)]"
          >
            <p className="text-sm font-semibold text-[var(--v-text)]">{c.company_name}</p>
            <p className="mt-1 text-xs text-[var(--v-text-muted)]">
              {c.industry || "قطاع غير محدد"}
              {c.country ? ` · ${c.country}` : ""}
            </p>
            {recentProject && (
              <p className="mt-1 text-[11px] text-[var(--v-text-muted)]">
                آخر نشاط: {stageLabels[recentProject.stage] || recentProject.stage} ·{" "}
                {new Date(recentProject.stage_changed_at).toLocaleDateString("ar-EG")}
              </p>
            )}
          </button>
          <div className="flex shrink-0 flex-col items-end gap-2">
            <div className="flex items-center gap-2">
              <Badge>{c.projects.length} مشروع</Badge>
              <Badge>{c.contacts.length} جهة اتصال</Badge>
            </div>
            {recentProject && (
              <Link
                href={`/dashboard/projects/${recentProject.id}`}
                className="flex items-center gap-1 text-[11px] font-medium text-[var(--v-primary)] hover:underline"
              >
                فتح سريع
                <ExternalLink size={11} />
              </Link>
            )}
          </div>
        </div>

        {expanded && (
          <div className="border-t border-[var(--v-border)] p-4">
            {c.website && (
              <p className="mb-2 text-xs">
                <a
                  href={c.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  dir="ltr"
                  className="text-[var(--v-primary)] hover:underline"
                >
                  {c.website}
                </a>
              </p>
            )}

            {c.contacts.length > 0 && (
              <div className="mb-4">
                <p className="mb-2 text-xs font-semibold text-[var(--v-text-muted)]">جهات الاتصال</p>
                <div className="space-y-1.5">
                  {c.contacts.map((x) => (
                    <div
                      key={x.id}
                      className="flex flex-wrap items-center gap-2 rounded-[var(--v-radius-md)] bg-[var(--v-surface)] p-2 text-xs text-[var(--v-text)]"
                    >
                      <span className="font-medium">{x.full_name}</span>
                      {x.email && (
                        <span dir="ltr" className="text-[var(--v-text-muted)]">
                          {x.email}
                        </span>
                      )}
                      {x.phone && <span className="text-[var(--v-text-muted)]">{x.phone}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {c.projects.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-semibold text-[var(--v-text-muted)]">المشاريع</p>
                <div className="space-y-1.5">
                  {c.projects.map((p) => (
                    <Link
                      key={p.id}
                      href={`/dashboard/projects/${p.id}`}
                      className="flex items-center justify-between rounded-[var(--v-radius-md)] bg-[var(--v-surface)] p-2 text-xs hover:bg-[var(--v-primary-tint)]"
                    >
                      <span className="text-[var(--v-text)]">{p.name}</span>
                      <span className="text-[var(--v-text-muted)]">{p.stage}</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {c.contacts.length === 0 && c.projects.length === 0 && (
              <p className="text-xs text-[var(--v-text-muted)]">
                مفيش جهات اتصال ولا مشاريع مسجلة بعد لهذا العميل.
              </p>
            )}
          </div>
        )}
      </Card>
    );
  }

  return (
    <div>
      <div className="mb-4">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="بحث في اسم الشركة، الصناعة، البلد، جهة الاتصال…"
        />
      </div>

      {filtered.length === 0 && (
        <EmptyState icon={<Building2 size={28} />} title={clients.length === 0 ? "لا يوجد عملاء بعد" : "مفيش نتائج مطابقة"} />
      )}

      {virtualizeEnabled ? (
        <div ref={scrollRef} className="max-h-[70vh] overflow-y-auto">
          <div className="relative" style={{ height: virtualizer.getTotalSize() }}>
            {virtualizer.getVirtualItems().map((row) => (
              <div
                key={row.key}
                ref={virtualizer.measureElement}
                data-index={row.index}
                className="absolute top-0 left-0 w-full pb-2"
                style={{ transform: `translateY(${row.start}px)` }}
              >
                {renderClient(filtered[row.index])}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-3">{filtered.map(renderClient)}</div>
      )}

      {hasMore && (
        <div className="mt-3 text-center">
          <Button variant="outline" size="sm" onClick={handleLoadMore} loading={loadingMore}>
            تحميل المزيد
          </Button>
          <p className="mt-1 text-[10px] text-[var(--v-text-muted)]">
            البحث بيشتغل بس على العملاء المحمّلين حاليًا.
          </p>
        </div>
      )}
    </div>
  );
}
