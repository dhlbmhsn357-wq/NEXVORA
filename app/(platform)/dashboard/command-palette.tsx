"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { Search, CornerDownLeft, ArrowUp, ArrowDown } from "lucide-react";
import { NAV_GROUPS, filterNavByFlags, type NavItem, type NavGroup } from "./nav-config";
import { useFeatureFlag } from "@/lib/feature-flags/context";

/**
 * لوحة الأوامر (⌘K / Ctrl+K) — مشغّل تنقّل احترافي بأسلوب Linear/Raycast.
 * تنقّل فقط (بدون أي منطق عمل): فتح أي وحدة/صفحة عبر بحث فوري + تنقّل
 * بلوحة المفاتيح (أسهم/Enter/Esc). Presentation-only بالكامل.
 */

interface Command {
  label: string;
  group: string;
  href: string;
  keywords?: string;
}

function buildCommands(groups: NavGroup[]): Command[] {
  const cmds: Command[] = [];
  for (const g of groups) {
    for (const item of g.items as NavItem[]) {
      cmds.push({ label: item.label, group: g.title ?? "الرئيسية", href: item.href });
    }
  }
  return cmds;
}

export default function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const [mounted, setMounted] = useState(false);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) {
      /* eslint-disable react-hooks/set-state-in-effect */
      setQuery("");
      setActive(0);
      /* eslint-enable react-hooks/set-state-in-effect */
      // تركيز الحقل بعد ظهور اللوحة
      const t = setTimeout(() => inputRef.current?.focus(), 20);
      return () => clearTimeout(t);
    }
  }, [open]);

  const extendedTechnicalDelivery = useFeatureFlag("extended_technical_delivery");
  const commands = useMemo(() => {
    const enabledFlags = new Set<string>();
    if (extendedTechnicalDelivery) enabledFlags.add("extended_technical_delivery");
    return buildCommands(filterNavByFlags(NAV_GROUPS, enabledFlags));
  }, [extendedTechnicalDelivery]);
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((c) => c.label.toLowerCase().includes(q) || c.group.toLowerCase().includes(q) || (c.keywords ?? "").includes(q));
  }, [commands, query]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (active >= results.length) setActive(0);
  }, [results, active]);

  function go(cmd: Command | undefined) {
    if (!cmd) return;
    setOpen(false);
    router.push(cmd.href);
  }

  function onInputKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); go(results[active]); }
  }

  if (!mounted || !open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 px-4 pt-[12vh] backdrop-blur-sm" onClick={() => setOpen(false)}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="لوحة الأوامر"
        className="w-full max-w-xl overflow-hidden rounded-[var(--v-radius-xl)] border border-[var(--v-border)] bg-[var(--v-bg)] shadow-[var(--v-shadow-lg)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-[var(--v-border)] px-4">
          <Search size={18} className="shrink-0 text-[var(--v-text-muted)]" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onInputKey}
            placeholder="ابحث عن وحدة أو صفحة…"
            className="w-full bg-transparent py-3.5 text-sm text-[var(--v-text)] placeholder:text-[var(--v-text-subtle)] focus:outline-none"
          />
          <kbd className="hidden shrink-0 rounded border border-[var(--v-border)] px-1.5 py-0.5 text-[10px] text-[var(--v-text-subtle)] sm:block">Esc</kbd>
        </div>

        <div className="max-h-[50vh] overflow-y-auto p-2">
          {results.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-[var(--v-text-secondary)]">لا نتائج لـ &quot;{query}&quot;</p>
          ) : (
            results.map((cmd, i) => (
              <button
                key={cmd.href}
                onMouseEnter={() => setActive(i)}
                onClick={() => go(cmd)}
                className={`flex w-full items-center justify-between gap-3 rounded-[var(--v-radius-md)] px-3 py-2.5 text-right text-sm transition ${
                  i === active ? "bg-[var(--v-primary-tint)] text-[var(--v-primary)]" : "text-[var(--v-text-secondary)]"
                }`}
              >
                <span className="font-medium">{cmd.label}</span>
                <span className="text-[11px] text-[var(--v-text-subtle)]">{cmd.group}</span>
              </button>
            ))
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-[var(--v-border)] px-4 py-2 text-[11px] text-[var(--v-text-subtle)]">
          <span className="flex items-center gap-2">
            <span className="flex items-center gap-1"><ArrowUp size={11} /><ArrowDown size={11} /> تنقّل</span>
            <span className="flex items-center gap-1"><CornerDownLeft size={11} /> فتح</span>
          </span>
          <span>⌘K / Ctrl+K</span>
        </div>
      </div>
    </div>,
    document.body
  );
}
