"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useVirtualizer } from "@tanstack/react-virtual";
import { FolderKanban } from "lucide-react";
import { loadMoreProjects, type ProjectListItem } from "./load-more-projects-action";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Progress from "@/components/ui/Progress";
import BottomSheet from "@/components/ui/BottomSheet";
import FilterChip from "@/components/ui/FilterChip";
import { stageLabels, stageTones, knownStages, stageProgressPercent } from "@/lib/projects/stage-labels";

const healthDotClass: Record<ProjectListItem["health"], string> = {
  ok: "bg-[var(--v-green)]",
  warning: "bg-[var(--v-amber)]",
  danger: "bg-[var(--v-red)]",
};

const healthLabel: Record<ProjectListItem["health"], string> = {
  ok: "لا توجد تنبيهات",
  warning: "طلب دعم بانتظار المتابعة",
  danger: "مراجعة Prototype محظورة",
};

const VIRTUALIZE_THRESHOLD = 30;

export default function ProjectsList({
  initialProjects,
  initialHasMore,
}: {
  initialProjects: ProjectListItem[];
  initialHasMore: boolean;
}) {
  const [projects, setProjects] = useState(initialProjects);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loadingMore, setLoadingMore] = useState(false);
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [filtersSheetOpen, setFiltersSheetOpen] = useState(false);

  async function handleLoadMore() {
    setLoadingMore(true);
    const result = await loadMoreProjects(projects.length);
    setProjects((prev) => [...prev, ...result.items]);
    setHasMore(result.hasMore);
    setLoadingMore(false);
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return projects.filter((p) => {
      if (stageFilter !== "all" && p.stage !== stageFilter) return false;
      if (!q) return true;
      const name = p.name.toLowerCase();
      const client = p.clients?.company_name?.toLowerCase() ?? "";
      return name.includes(q) || client.includes(q);
    });
  }, [projects, search, stageFilter]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizeEnabled = filtered.length > VIRTUALIZE_THRESHOLD;
  // eslint-disable-next-line react-hooks/incompatible-library -- tanstack-virtual returns non-memoizable helpers by design
  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 92,
    overscan: 6,
    enabled: virtualizeEnabled,
  });

  function renderProject(project: ProjectListItem) {
    return (
      <Link key={project.id} href={`/dashboard/projects/${project.id}`} className="block">
        <Card padding={virtualizeEnabled ? "sm" : "md"} hover className="transition-colors hover:border-[var(--v-primary)]">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${healthDotClass[project.health]}`}
                  title={healthLabel[project.health]}
                  aria-hidden="true"
                />
                <p className="truncate text-sm font-semibold text-[var(--v-text)]">{project.name}</p>
              </div>
              <p className="mt-1 text-xs text-[var(--v-text-muted)]">{project.clients?.company_name || "—"}</p>
            </div>
            <Badge tone={stageTones[project.stage] ?? "neutral"}>{stageLabels[project.stage] || project.stage}</Badge>
          </div>
          <div className="mt-3">
            <Progress value={stageProgressPercent(project.stage)} tone={stageTones[project.stage] === "success" ? "success" : "primary"} />
          </div>
        </Card>
      </Link>
    );
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2">
        <div className="flex-1">
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث في اسم المشروع أو العميل…" />
        </div>
        <div className="hidden w-40 sm:block">
          <Select value={stageFilter} onChange={(e) => setStageFilter(e.target.value)}>
            <option value="all">كل المراحل</option>
            {knownStages.map((s) => (
              <option key={s} value={s}>
                {stageLabels[s]}
              </option>
            ))}
          </Select>
        </div>
        <Button variant="outline" size="sm" className="sm:hidden" onClick={() => setFiltersSheetOpen(true)}>
          فلاتر{stageFilter !== "all" ? " (1)" : ""}
        </Button>
      </div>

      <BottomSheet open={filtersSheetOpen} onClose={() => setFiltersSheetOpen(false)} title="فلاتر المشاريع">
        <Select value={stageFilter} onChange={(e) => setStageFilter(e.target.value)}>
          <option value="all">كل المراحل</option>
          {knownStages.map((s) => (
            <option key={s} value={s}>
              {stageLabels[s]}
            </option>
          ))}
        </Select>
      </BottomSheet>

      {stageFilter !== "all" && (
        <div className="mb-3 flex flex-wrap gap-2">
          <FilterChip label={`المرحلة: ${stageLabels[stageFilter] || stageFilter}`} onRemove={() => setStageFilter("all")} />
        </div>
      )}

      {filtered.length === 0 && (
        <EmptyState icon={<FolderKanban size={28} />} title={projects.length === 0 ? "لا توجد مشاريع بعد" : "مفيش نتائج مطابقة"} />
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
                {renderProject(filtered[row.index])}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-3">{filtered.map(renderProject)}</div>
      )}

      {hasMore && (
        <div className="mt-3 text-center">
          <Button variant="outline" size="sm" onClick={handleLoadMore} loading={loadingMore}>
            تحميل المزيد
          </Button>
          <p className="mt-1 text-[10px] text-[var(--v-text-muted)]">
            البحث والفلاتر بيشتغلوا بس على العناصر المحمّلة حاليًا.
          </p>
        </div>
      )}
    </div>
  );
}
