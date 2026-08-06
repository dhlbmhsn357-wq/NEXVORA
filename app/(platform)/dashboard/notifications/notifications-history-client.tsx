"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Search, CheckCheck, Archive, ArchiveRestore, Trash2 } from "lucide-react";
import Card from "@/components/ui/Card";
import Badge, { type BadgeTone } from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import EmptyState from "@/components/ui/EmptyState";
import {
  getNotificationHistory,
  markSelectedNotificationsRead,
  archiveNotifications,
  restoreNotifications,
  deleteNotifications,
  markNotificationOpened,
} from "../notifications-actions";
import type { NotificationFeedItem, NotificationStatusFilter, NotificationReadFilter } from "@/lib/notifications/service";

const PAGE_SIZE = 30;

const SEVERITY_TONE: Record<string, BadgeTone> = { critical: "danger", warning: "warning", info: "info" };
const STATUS_TABS: Array<{ key: NotificationStatusFilter; label: string }> = [
  { key: "active", label: "الكل (نشط)" },
  { key: "archived", label: "مؤرشف" },
  { key: "all", label: "الكل بالكامل" },
];

export default function NotificationsHistoryClient({
  initialItems,
  initialTotal,
}: {
  initialItems: NotificationFeedItem[];
  initialTotal: number;
}) {
  const [items, setItems] = useState(initialItems);
  const [total, setTotal] = useState(initialTotal);
  const [status, setStatus] = useState<NotificationStatusFilter>("active");
  const [readState, setReadState] = useState<NotificationReadFilter>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();
  const [isLoading, setIsLoading] = useState(false);

  async function refetch() {
    setIsLoading(true);
    try {
      const result = await getNotificationHistory({ status, readState, search, page, pageSize: PAGE_SIZE });
      setItems(result.items);
      setTotal(result.total);
      setSelected(new Set());
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    // إعادة الجلب عند تغيير الفلاتر/الصفحة — الحالة بتتحدّث جوّه refetch نفسها.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, readState, page]);

  function runSearch() {
    setPage(1);
    refetch();
  }

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelected((prev) => (prev.size === items.length ? new Set() : new Set(items.map((i) => i.id))));
  }

  function runBulk(action: (ids: string[]) => Promise<void>) {
    const ids = [...selected];
    if (ids.length === 0) return;
    startTransition(async () => {
      await action(ids);
      await refetch();
    });
  }

  async function openItem(n: NotificationFeedItem) {
    setItems((prev) => prev.map((i) => (i.id === n.id ? { ...i, isRead: true } : i)));
    await markNotificationOpened(n.id);
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-4">
      <Card padding="md">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1 rounded-[var(--v-radius-md)] bg-[var(--v-surface)] p-1">
            {STATUS_TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => {
                  setStatus(tab.key);
                  setPage(1);
                }}
                className={`rounded-[var(--v-radius-sm)] px-3 py-1.5 text-xs font-medium transition ${
                  status === tab.key ? "bg-[var(--v-bg)] text-[var(--v-primary)] shadow-[var(--v-shadow-sm)]" : "text-[var(--v-text-muted)]"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <select
            value={readState}
            onChange={(e) => {
              setReadState(e.target.value as NotificationReadFilter);
              setPage(1);
            }}
            className="rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-bg)] px-2.5 py-1.5 text-xs text-[var(--v-text)]"
          >
            <option value="all">الكل</option>
            <option value="unread">غير مقروء</option>
            <option value="read">مقروء</option>
          </select>

          <div className="flex flex-1 min-w-[200px] gap-2">
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث في الإشعارات..." onKeyDown={(e) => e.key === "Enter" && runSearch()} />
            <Button variant="outline" size="sm" onClick={runSearch}>
              <Search size={14} />
            </Button>
          </div>
        </div>

        {selected.size > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[var(--v-border)] pt-3">
            <span className="text-xs text-[var(--v-text-muted)]">{selected.size} محدّد</span>
            <Button variant="outline" size="sm" onClick={() => runBulk((ids) => markSelectedNotificationsRead(ids))} disabled={isPending}>
              <CheckCheck size={13} /> تعليم كمقروء
            </Button>
            {status !== "archived" ? (
              <Button variant="outline" size="sm" onClick={() => runBulk((ids) => archiveNotifications(ids))} disabled={isPending}>
                <Archive size={13} /> أرشفة
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={() => runBulk((ids) => restoreNotifications(ids))} disabled={isPending}>
                <ArchiveRestore size={13} /> استرجاع
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => runBulk((ids) => deleteNotifications(ids))} disabled={isPending}>
              <Trash2 size={13} /> حذف (ناعم)
            </Button>
          </div>
        )}
      </Card>

      <Card padding="none">
        {items.length === 0 && !isLoading ? (
          <div className="p-6">
            <EmptyState title="لا توجد إشعارات" description="جرّب تغيير الفلتر أو البحث." />
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 border-b border-[var(--v-border)] px-3 py-2">
              <input type="checkbox" checked={selected.size > 0 && selected.size === items.length} onChange={toggleSelectAll} className="h-4 w-4" />
              <span className="text-[11px] text-[var(--v-text-muted)]">تحديد الكل ({items.length})</span>
            </div>
            {items.map((n) => (
              <div key={n.id} className="flex items-start gap-3 border-b border-[var(--v-border)] p-3 text-sm last:border-b-0 hover:bg-[var(--v-surface)]">
                <input type="checkbox" checked={selected.has(n.id)} onChange={() => toggleSelected(n.id)} className="mt-1 h-4 w-4" />
                <Link href={n.target_url} onClick={() => openItem(n)} className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={SEVERITY_TONE[n.severity] ?? "neutral"}>{n.severity}</Badge>
                    {n.projectName && <span className="text-[11px] text-[var(--v-text-muted)]">{n.projectName}</span>}
                    {n.status === "archived" && <Badge tone="neutral">مؤرشف</Badge>}
                    <span className="text-[11px] text-[var(--v-text-subtle)]">{new Date(n.created_at).toLocaleString("ar-EG")}</span>
                  </div>
                  <p className={`mt-1 ${n.isRead ? "text-[var(--v-text-subtle)]" : "font-medium text-[var(--v-text)]"}`}>{n.message}</p>
                </Link>
              </div>
            ))}
          </>
        )}
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
            السابق
          </Button>
          <span className="text-xs text-[var(--v-text-muted)]">
            {page} / {totalPages}
          </span>
          <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
            التالي
          </Button>
        </div>
      )}
    </div>
  );
}
