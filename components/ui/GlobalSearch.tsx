"use client";

import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Search, Clock } from "lucide-react";
import Badge from "./Badge";
import type { SearchResult } from "@/app/api/search/route";

const typeLabels: Record<SearchResult["type"], string> = {
  project: "مشروع",
  lead: "عميل محتمل",
  client: "عميل",
};

const RECENTS_KEY = "pm-os-recent-searches";
const MAX_RECENTS = 5;

function loadRecents(): SearchResult[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENTS_KEY);
    return raw ? (JSON.parse(raw) as SearchResult[]) : [];
  } catch {
    return [];
  }
}

function saveRecents(list: SearchResult[]) {
  try {
    window.localStorage.setItem(RECENTS_KEY, JSON.stringify(list));
  } catch {
    // التخزين المحلي مش حرج — لو فشل (وضع خاص، مساحة ممتلئة) البحث نفسه يفضل شغال عادي.
  }
}

/**
 * بحث عام في الـ Topbar — يفتح بـ Ctrl/Cmd+K كمان، بيدور في المشاريع
 * والعملاء المحتملين والعملاء. النتائج بتيجي من /api/search (محمي
 * بجلسة تسجيل الدخول).
 */
export default function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [recents, setRecents] = useState<SearchResult[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // القائمة الظاهرة فعليًا دلوقتي (نتائج بحث أو عمليات بحث سابقة) —
  // مصدر واحد للتنقل بالكيبورد بدل ما نكرر منطق الفهرسة مرتين.
  const visibleList = query.trim().length >= 2 ? results : recents;

  useEffect(() => {
    function handleShortcut(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
      }
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  function handleInputKeyDown(e: ReactKeyboardEvent<HTMLInputElement>) {
    if (visibleList.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % visibleList.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + visibleList.length) % visibleList.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const target = visibleList[activeIndex];
      if (target) handleSelect(target);
    }
  }

  useEffect(() => {
    if (open) {
      // قراءة لمرة واحدة عند الفتح من localStorage — مش قيمة تتغيّر تفاعليًا.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRecents(loadRecents());
      setActiveIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      // تصفير حقل البحث عند الإغلاق — مش قيمة مشتقة وقت الـ render.
      setQuery("");
      setResults([]);
    }
  }, [open]);

  useEffect(() => {
    if (query.trim().length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResults([]);
      return;
    }
    const timeout = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`);
        const data = await res.json();
        setResults(data.results ?? []);
      } catch {
        setResults([]);
      }
      setLoading(false);
    }, 250);
    return () => clearTimeout(timeout);
  }, [query]);

  function handleSelect(result: SearchResult) {
    const next = [result, ...recents.filter((r) => r.href !== result.href)].slice(0, MAX_RECENTS);
    saveRecents(next);
    setOpen(false);
    router.push(result.href);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-surface)] px-3 py-1.5 text-xs text-[var(--v-text-muted)] transition hover:border-[var(--v-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--v-primary)]"
      >
        <Search size={14} aria-hidden="true" />
        <span className="hidden sm:inline">بحث…</span>
        <span className="hidden rounded bg-[var(--v-surface-2)] px-1.5 py-0.5 font-mono text-[10px] sm:inline">Ctrl K</span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-[10vh]"
            onClick={() => setOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.98 }}
              transition={{ duration: 0.15 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-lg overflow-hidden rounded-[var(--v-radius-lg)] border border-[var(--v-border)] bg-[var(--v-bg)] shadow-[var(--v-shadow-lg)]"
            >
              <div className="relative flex items-center border-b border-[var(--v-border)]">
                <Search size={16} className="pointer-events-none absolute right-4 text-[var(--v-text-muted)]" />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setActiveIndex(0);
                  }}
                  onKeyDown={handleInputKeyDown}
                  placeholder="دوّر على مشروع، عميل محتمل، أو عميل…"
                  role="combobox"
                  aria-expanded={visibleList.length > 0}
                  aria-controls="global-search-listbox"
                  aria-activedescendant={visibleList[activeIndex] ? `search-option-${activeIndex}` : undefined}
                  className="w-full bg-transparent py-3 pe-4 ps-10 text-sm text-[var(--v-text)] outline-none"
                />
              </div>
              <div id="global-search-listbox" role="listbox" className="max-h-80 overflow-y-auto">
                {query.trim().length < 2 && recents.length > 0 && (
                  <>
                    <p className="px-4 pt-3 pb-1 text-[11px] font-semibold text-[var(--v-text-muted)]">عمليات بحث سابقة</p>
                    {recents.map((r, i) => (
                      <button
                        key={`recent-${r.type}-${r.id}`}
                        id={`search-option-${i}`}
                        role="option"
                        type="button"
                        onClick={() => handleSelect(r)}
                        onMouseEnter={() => setActiveIndex(i)}
                        aria-selected={i === activeIndex}
                        className={`flex w-full items-center justify-between gap-2 px-4 py-2.5 text-right ${
                          i === activeIndex ? "bg-[var(--v-surface)]" : ""
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <Clock size={13} className="shrink-0 text-[var(--v-text-muted)]" aria-hidden="true" />
                          <div>
                            <p className="text-sm text-[var(--v-text)]">{r.title}</p>
                            {r.subtitle && <p className="text-[11px] text-[var(--v-text-muted)]">{r.subtitle}</p>}
                          </div>
                        </div>
                        <Badge>{typeLabels[r.type]}</Badge>
                      </button>
                    ))}
                  </>
                )}
                {query.trim().length < 2 && recents.length === 0 && (
                  <p className="p-4 text-xs text-[var(--v-text-muted)]">اكتب حرفين على الأقل للبحث في المشاريع والعملاء المحتملين والعملاء.</p>
                )}
                {loading && <p className="p-4 text-xs text-[var(--v-text-muted)]">جاري البحث…</p>}
                {!loading && query.trim().length >= 2 && results.length === 0 && (
                  <p className="p-4 text-xs text-[var(--v-text-muted)]">مفيش نتائج.</p>
                )}
                {!loading &&
                  results.map((r, i) => (
                    <button
                      key={`${r.type}-${r.id}`}
                      id={`search-option-${i}`}
                      role="option"
                      type="button"
                      onClick={() => handleSelect(r)}
                      onMouseEnter={() => setActiveIndex(i)}
                      aria-selected={i === activeIndex}
                      className={`flex w-full items-center justify-between gap-2 px-4 py-2.5 text-right ${
                        i === activeIndex ? "bg-[var(--v-surface)]" : ""
                      }`}
                    >
                      <div>
                        <p className="text-sm text-[var(--v-text)]">{r.title}</p>
                        {r.subtitle && <p className="text-[11px] text-[var(--v-text-muted)]">{r.subtitle}</p>}
                      </div>
                      <Badge>{typeLabels[r.type]}</Badge>
                    </button>
                  ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
