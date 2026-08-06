"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Menu, X, Search, ChevronDown, User, LogOut } from "lucide-react";
import Logo from "../components/logo";
import { logoutAction } from "../login/actions";
import { useT } from "@/lib/i18n/context";
import LanguageSwitcher from "@/components/ui/LanguageSwitcher";
import { NAV_GROUPS, isNavActive, filterNavByRole, type NavGroup } from "./nav-config";

/**
 * التنقّل على الموبايل (أقل من lg) — إعادة تصميم كاملة (Critical Fix):
 * رأس (شعار + اسم النظام + إغلاق)، بحث فوري داخل العناصر، أقسام قابلة
 * للطيّ (Accordion) بكل العناصر ظاهرة افتراضيًا، تمييز الصفحة الحالية،
 * حركات احترافية، Scroll طبيعي بدون Overflow، مساحات لمس ≥44px،
 * قفل تمرير الخلفية، Focus trap، و Escape للإغلاق. RTL بالكامل.
 * لا يحذف أي عنصر — يستخدم نفس مصدر nav-config مع فلترة حسب الدور.
 */
export default function MobileNav({
  userLabel,
  role,
}: {
  userLabel: string;
  role: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [loggingOut, setLoggingOut] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const panelRef = useRef<HTMLDivElement>(null);
  const t = useT();

  const groups = useMemo(() => filterNavByRole(NAV_GROUPS, role), [role]);
  const navLabel = (item: NavGroup["items"][number]) => (item.labelKey ? t(item.labelKey) : item.label);
  const groupLabel = (g: NavGroup) => (g.titleKey ? t(g.titleKey) : g.title ?? "");

  // الدرج بيتعمله Portal لـ body عشان يهرب من حاوية backdrop-filter بتاعة
  // التوب-بار (اللي بتخلّي fixed يتقلّص لحجم الهيدر ويبان شفاف).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
  }, []);

  // قفل تمرير الصفحة خلف الدرج + Escape + Focus trap بسيط.
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        close();
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const focusables = panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input, [tabindex]:not([tabindex="-1"])'
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    window.addEventListener("keydown", handleKey);
    // نقل التركيز داخل الدرج عند الفتح.
    const t = window.setTimeout(() => panelRef.current?.focus(), 60);
    return () => {
      window.removeEventListener("keydown", handleKey);
      window.clearTimeout(t);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, close]);

  async function handleLogout() {
    setLoggingOut(true);
    await logoutAction();
    router.push("/login");
    router.refresh();
  }

  // نتائج البحث المسطّحة (تتجاهل الطيّ وتعرض القسم لكل عنصر).
  const q = query.trim().toLowerCase();
  const searchResults = useMemo(() => {
    if (!q) return [];
    const out: { href: string; label: string; icon: NavGroup["items"][number]["icon"]; section: string }[] = [];
    for (const g of groups) {
      const section = g.titleKey ? t(g.titleKey) : g.title ?? "";
      for (const it of g.items) {
        const label = it.labelKey ? t(it.labelKey) : it.label;
        // يطابق النص المترجَم والنص العربي معًا (يشتغل في اللغتين).
        if (label.toLowerCase().includes(q) || it.label.toLowerCase().includes(q)) {
          out.push({ href: it.href, label, icon: it.icon, section });
        }
      }
    }
    return out;
  }, [q, groups, t]);

  return (
    <>
      {/* زرّ فتح القائمة + الشعار (يظهروا أقل من lg فقط) */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("topbar.openMenu")}
        aria-expanded={open}
        className="flex h-10 w-10 items-center justify-center rounded-[var(--v-radius-md)] border border-[var(--v-border)] text-[var(--v-text-secondary)] transition hover:bg-[var(--v-surface)] hover:text-[var(--v-primary)] lg:hidden"
      >
        <Menu size={20} />
      </button>
      <Link href="/dashboard" className="lg:hidden" aria-label="VELORA">
        <Logo size={30} showWordmark={false} />
      </Link>

      {mounted &&
        createPortal(
          <AnimatePresence>
            {open && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-[2px] lg:hidden"
                onClick={close}
              >
            <motion.div
              ref={panelRef}
              tabIndex={-1}
              role="dialog"
              aria-modal="true"
              aria-label="قائمة التنقّل"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", stiffness: 380, damping: 38 }}
              onClick={(e) => e.stopPropagation()}
              className="absolute inset-y-0 right-0 flex h-full w-[86%] max-w-[380px] flex-col bg-[var(--v-bg)] shadow-[var(--v-shadow-lg)] outline-none"
            >
              {/* الرأس: شعار + اسم النظام + إغلاق */}
              <div className="flex items-center justify-between gap-3 border-b border-[var(--v-border)] px-4 py-3.5">
                <div className="flex min-w-0 items-center gap-3">
                  <Logo size={34} showWordmark={false} />
                  <div className="min-w-0 leading-tight">
                    <p className="truncate text-sm font-semibold text-[var(--v-text)]">VELORA</p>
                    <p className="truncate text-[11px] text-[var(--v-text-subtle)]">{t("topbar.subtitle")}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={close}
                  aria-label={t("topbar.closeMenu")}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--v-radius-md)] text-[var(--v-text-muted)] transition hover:bg-[var(--v-surface)] hover:text-[var(--v-text)]"
                >
                  <X size={20} />
                </button>
              </div>

              {/* البحث داخل عناصر القائمة */}
              <div className="border-b border-[var(--v-border)] p-3">
                <div className="relative">
                  <Search
                    size={16}
                    className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[var(--v-text-subtle)]"
                  />
                  <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={t("topbar.searchMenu")}
                    aria-label={t("topbar.searchMenu")}
                    className="h-11 w-full rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-surface)] pe-9 ps-3 text-sm text-[var(--v-text)] outline-none transition placeholder:text-[var(--v-text-subtle)] focus-visible:border-[var(--v-primary)] focus-visible:ring-2 focus-visible:ring-[var(--v-primary)]/30"
                  />
                </div>
              </div>

              {/* منطقة التنقّل (Scroll طبيعي) */}
              <nav className="flex-1 overflow-y-auto overscroll-contain px-3 py-3">
                {q ? (
                  searchResults.length > 0 ? (
                    <div className="flex flex-col gap-1">
                      {searchResults.map((item) => (
                        <NavLink
                          key={item.href}
                          href={item.href}
                          label={item.label}
                          Icon={item.icon}
                          active={isNavActive(pathname, item.href)}
                          hint={item.section}
                          onClick={close}
                        />
                      ))}
                    </div>
                  ) : (
                    <p className="px-3 py-8 text-center text-sm text-[var(--v-text-subtle)]">
                      {t("topbar.noResults")} «{query}»
                    </p>
                  )
                ) : (
                  <div className="flex flex-col gap-2">
                    {groups.map((group, gi) => {
                      // القسم بلا عنوان = عناصر أساسية ثابتة فوق (بدون طيّ).
                      if (!group.title) {
                        return (
                          <div key={`g${gi}`} className="flex flex-col gap-1">
                            {group.items.map((item) => (
                              <NavLink
                                key={item.href}
                                href={item.href}
                                label={navLabel(item)}
                                Icon={item.icon}
                                active={isNavActive(pathname, item.href)}
                                onClick={close}
                              />
                            ))}
                          </div>
                        );
                      }
                      const isCollapsed = !!collapsed[group.title];
                      return (
                        <div key={group.title} className="flex flex-col">
                          <button
                            type="button"
                            onClick={() =>
                              setCollapsed((c) => ({ ...c, [group.title as string]: !c[group.title as string] }))
                            }
                            aria-expanded={!isCollapsed}
                            className="flex min-h-[44px] items-center justify-between rounded-[var(--v-radius-md)] px-3 text-[11px] font-semibold uppercase tracking-wide text-[var(--v-text-subtle)] transition hover:text-[var(--v-text-secondary)]"
                          >
                            <span>{groupLabel(group)}</span>
                            <motion.span animate={{ rotate: isCollapsed ? 0 : 180 }} transition={{ duration: 0.2 }}>
                              <ChevronDown size={15} />
                            </motion.span>
                          </button>
                          <AnimatePresence initial={false}>
                            {!isCollapsed && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
                                className="overflow-hidden"
                              >
                                <div className="flex flex-col gap-1 pt-1">
                                  {group.items.map((item) => (
                                    <NavLink
                                      key={item.href}
                                      href={item.href}
                                      label={navLabel(item)}
                                      Icon={item.icon}
                                      active={isNavActive(pathname, item.href)}
                                      onClick={close}
                                    />
                                  ))}
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      );
                    })}
                  </div>
                )}
              </nav>

              {/* التذييل: الحساب + تسجيل الخروج */}
              <div className="border-t border-[var(--v-border)] p-3">
                {userLabel && (
                  <p className="truncate px-3 pb-2 text-xs text-[var(--v-text-subtle)]">{userLabel}</p>
                )}
                <div className="flex flex-col gap-1">
                  <LanguageSwitcher variant="full" />
                  <Link
                    href="/dashboard/account"
                    onClick={close}
                    className="flex min-h-[44px] items-center gap-2.5 rounded-[var(--v-radius-md)] px-3 text-sm text-[var(--v-text-secondary)] transition hover:bg-[var(--v-surface)] hover:text-[var(--v-primary)]"
                  >
                    <User size={17} /> {t("topbar.account")}
                  </Link>
                  <button
                    type="button"
                    onClick={handleLogout}
                    disabled={loggingOut}
                    className="flex min-h-[44px] w-full items-center gap-2.5 rounded-[var(--v-radius-md)] px-3 text-sm text-[var(--v-red)] transition hover:bg-[var(--v-red)]/10 disabled:opacity-50"
                  >
                    <LogOut size={17} /> {loggingOut ? t("topbar.loggingOut") : t("topbar.logout")}
                  </button>
                </div>
              </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </>
  );
}

function NavLink({
  href,
  label,
  Icon,
  active,
  hint,
  onClick,
}: {
  href: string;
  label: string;
  Icon: NavGroup["items"][number]["icon"];
  active: boolean;
  hint?: string;
  onClick: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={`relative flex min-h-[48px] items-center gap-3 rounded-[var(--v-radius-md)] px-3 text-sm transition ${
        active
          ? "bg-[var(--v-primary-tint)] font-medium text-[var(--v-primary)]"
          : "text-[var(--v-text-secondary)] hover:bg-[var(--v-surface)] hover:text-[var(--v-primary)]"
      }`}
    >
      {active && (
        <span className="absolute inset-y-2 right-0 w-0.5 rounded-full bg-[var(--v-primary)]" aria-hidden />
      )}
      <Icon size={18} className="shrink-0" />
      <span className="flex-1 truncate">{label}</span>
      {hint && <span className="shrink-0 text-[10px] text-[var(--v-text-subtle)]">{hint}</span>}
    </Link>
  );
}
