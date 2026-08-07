"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PanelRightClose, PanelRightOpen, Star, Clock } from "lucide-react";
import Logo from "../components/logo";
import { useT } from "@/lib/i18n/context";
import { NAV_GROUPS, NAV_ITEMS_FLAT, isNavActive, filterNavByFlags, type NavItem } from "./nav-config";
import { useFeatureFlag } from "@/lib/feature-flags/context";

/**
 * الشريط الجانبي (UI/UX Phase 2) — تنقّل مؤسسي كامل: أقسام مجمّعة، وضع
 * مطويّ (أيقونات فقط) محفوظ، مؤشّر نشط، + وحدات مثبّتة (Pinned) وأخيرة
 * (Recent) محفوظة في localStorage. يظهر على lg+؛ الموبايل يستخدم Drawer
 * التوب-بار. RTL. presentation-only بالكامل.
 */
const COLLAPSE_KEY = "velora-sidebar-collapsed";
const PINNED_KEY = "velora-sidebar-pinned";
const RECENT_KEY = "velora-sidebar-recent";
const MAX_RECENT = 4;

function readList(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export default function Sidebar() {
  const pathname = usePathname();
  const t = useT();
  const navLabel = (item: NavItem) => (item.labelKey ? t(item.labelKey) : item.label);
  // Feature flags: نبني مجموعة الـ flags المفعّلة اللي المستخدم يشوفها.
  const extendedTechnicalDelivery = useFeatureFlag("extended_technical_delivery");
  const enabledFlags = new Set<string>();
  if (extendedTechnicalDelivery) enabledFlags.add("extended_technical_delivery");
  const visibleGroups = filterNavByFlags(NAV_GROUPS, enabledFlags);
  const [collapsed, setCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [pinned, setPinned] = useState<string[]>([]);
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => {
    // ترطيب التفضيلات من localStorage عند التحميل (مزامنة مع نظام خارجي).
    /* eslint-disable react-hooks/set-state-in-effect */
    setMounted(true);
    setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
    setPinned(readList(PINNED_KEY));
    setRecent(readList(RECENT_KEY));
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  // تتبّع آخر الوحدات المزارة (أول عنصر تنقّل يطابق المسار الحالي).
  useEffect(() => {
    const match = NAV_ITEMS_FLAT.find((n) => isNavActive(pathname, n.href) && n.href !== "/dashboard");
    if (!match) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRecent((prev) => {
      const next = [match.href, ...prev.filter((h) => h !== match.href)].slice(0, MAX_RECENT);
      localStorage.setItem(RECENT_KEY, JSON.stringify(next));
      return next;
    });
  }, [pathname]);

  const toggle = useCallback(() => {
    setCollapsed((c) => {
      const next = !c;
      localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      return next;
    });
  }, []);

  const togglePin = useCallback((href: string) => {
    setPinned((prev) => {
      const next = prev.includes(href) ? prev.filter((h) => h !== href) : [...prev, href];
      localStorage.setItem(PINNED_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const width = collapsed ? "5rem" : "16rem";

  function renderItem(item: NavItem, opts?: { showPin?: boolean }) {
    const active = isNavActive(pathname, item.href);
    const isPinned = pinned.includes(item.href);
    return (
      <div key={item.href} className="group/item relative">
        <Link
          href={item.href}
          aria-current={active ? "page" : undefined}
          title={collapsed ? navLabel(item) : undefined}
          className={`relative flex items-center gap-3 rounded-[var(--v-radius-md)] px-3 py-2 text-sm transition ${
            collapsed ? "justify-center" : ""
          } ${
            active
              ? "bg-[var(--v-primary-tint)] font-medium text-[var(--v-primary)]"
              : "text-[var(--v-text-secondary)] hover:bg-[var(--v-surface)] hover:text-[var(--v-primary)]"
          }`}
        >
          {active && <span className="absolute inset-y-1 right-0 w-0.5 rounded-full bg-[var(--v-primary)]" aria-hidden />}
          <item.icon size={18} className="shrink-0" />
          {!collapsed && <span className="truncate">{navLabel(item)}</span>}
        </Link>
        {!collapsed && opts?.showPin && (
          <button
            type="button"
            onClick={() => togglePin(item.href)}
            aria-label={isPinned ? `إلغاء تثبيت ${item.label}` : `تثبيت ${item.label}`}
            className={`absolute left-2 top-1/2 -translate-y-1/2 rounded p-1 transition ${
              isPinned ? "text-[var(--v-amber)]" : "text-[var(--v-text-subtle)] opacity-0 group-hover/item:opacity-100"
            }`}
          >
            <Star size={13} fill={isPinned ? "currentColor" : "none"} />
          </button>
        )}
      </div>
    );
  }

  const pinnedItems = pinned.map((h) => NAV_ITEMS_FLAT.find((n) => n.href === h)).filter(Boolean) as NavItem[];
  const recentItems = recent
    .filter((h) => !pinned.includes(h))
    .map((h) => NAV_ITEMS_FLAT.find((n) => n.href === h))
    .filter(Boolean) as NavItem[];

  return (
    <aside
      className="sticky top-0 hidden h-screen shrink-0 flex-col border-l border-[var(--v-border)] bg-[var(--v-bg)] lg:flex"
      style={{ width: mounted ? width : "16rem", transition: "width 0.2s ease" }}
    >
      <div className={`flex h-16 items-center border-b border-[var(--v-border)] ${collapsed ? "justify-center px-2" : "justify-between px-4"}`}>
        {!collapsed && (
          <Link href="/dashboard" aria-label="VELORA">
            <Logo size={44} />
          </Link>
        )}
        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? t("sidebar.expand") : t("sidebar.collapse")}
          className="flex h-9 w-9 items-center justify-center rounded-[var(--v-radius-md)] text-[var(--v-text-muted)] transition hover:bg-[var(--v-surface)] hover:text-[var(--v-primary)]"
        >
          {collapsed ? <PanelRightOpen size={18} /> : <PanelRightClose size={18} />}
        </button>
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4 scrollbar-hide">
        {/* المثبّتة */}
        {!collapsed && pinnedItems.length > 0 && (
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--v-text-subtle)]">
              <Star size={11} /> {t("sidebar.pinned")}
            </div>
            {pinnedItems.map((item) => renderItem(item, { showPin: true }))}
          </div>
        )}

        {/* الأخيرة */}
        {!collapsed && recentItems.length > 0 && (
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--v-text-subtle)]">
              <Clock size={11} /> {t("sidebar.recent")}
            </div>
            {recentItems.map((item) => renderItem(item))}
          </div>
        )}

        {/* المجموعات الرئيسية */}
        {visibleGroups.map((group, gi) => (
          <div key={group.title ?? `g${gi}`} className="space-y-1">
            {group.title && !collapsed && (
              <div className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--v-text-subtle)]">{group.titleKey ? t(group.titleKey) : group.title}</div>
            )}
            {group.title && collapsed && gi > 0 && <div className="mx-auto my-2 h-px w-6 bg-[var(--v-border)]" />}
            {group.items.map((item) => renderItem(item, { showPin: true }))}
          </div>
        ))}
      </nav>

      {!collapsed && (
        <div className="border-t border-[var(--v-border)] px-4 py-2 text-[11px] text-[var(--v-text-subtle)]">
          <kbd className="rounded border border-[var(--v-border)] px-1 py-0.5">⌘K</kbd> {t("sidebar.searchHint")}
        </div>
      )}
    </aside>
  );
}
