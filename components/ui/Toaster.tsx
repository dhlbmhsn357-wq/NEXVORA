"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, XCircle, AlertTriangle, Info, Loader2, X } from "lucide-react";

type ToastTone = "success" | "error" | "warning" | "info" | "loading";

interface ToastItem {
  id: number;
  tone: ToastTone;
  message: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  durationMs: number;
}

type Listener = (items: ToastItem[]) => void;

let items: ToastItem[] = [];
let listeners: Listener[] = [];
let counter = 0;

function emit() {
  for (const l of listeners) l([...items]);
}

function push(tone: ToastTone, message: string, opts: Omit<Partial<ToastItem>, "id" | "tone" | "message"> = {}) {
  const id = ++counter;
  const durationMs = opts.durationMs ?? (tone === "loading" ? 0 : 4500);
  items = [...items, { id, tone, message, durationMs, ...opts }];
  emit();
  return id;
}

function dismiss(id: number) {
  items = items.filter((t) => t.id !== id);
  emit();
}

function update(id: number, patch: Partial<ToastItem>) {
  items = items.map((t) => (t.id === id ? { ...t, ...patch } : t));
  emit();
}

/**
 * واجهة برمجية إمبراتيفية عشان أي جزء من التطبيق يقدر يستدعي toast.success(...)
 * من غير ما يحتاج Context أو Provider — نفس فلسفة sonner/react-hot-toast.
 * الاستدعاء والعرض منفصلين تمامًا: <Toaster/> بيتركب مرة واحدة في RootLayout.
 */
export const toast = {
  success: (message: string, opts?: Parameters<typeof push>[2]) => push("success", message, opts),
  error: (message: string, opts?: Parameters<typeof push>[2]) => push("error", message, opts),
  warning: (message: string, opts?: Parameters<typeof push>[2]) => push("warning", message, opts),
  info: (message: string, opts?: Parameters<typeof push>[2]) => push("info", message, opts),
  loading: (message: string, opts?: Parameters<typeof push>[2]) => push("loading", message, opts),
  dismiss,
  update,
};

const toneConfig: Record<ToastTone, { icon: typeof CheckCircle2; color: string }> = {
  success: { icon: CheckCircle2, color: "var(--v-green)" },
  error: { icon: XCircle, color: "var(--v-red)" },
  warning: { icon: AlertTriangle, color: "var(--v-amber)" },
  info: { icon: Info, color: "var(--v-info)" },
  loading: { icon: Loader2, color: "var(--v-text-muted)" },
};

function ToastRow({ item }: { item: ToastItem }) {
  const [paused, setPaused] = useState(false);
  const [remaining, setRemaining] = useState(item.durationMs);

  useEffect(() => {
    if (paused || item.durationMs <= 0) return;
    const start = Date.now();
    const t = setTimeout(() => dismiss(item.id), remaining);
    return () => {
      clearTimeout(t);
      setRemaining((r) => Math.max(0, r - (Date.now() - start)));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused, item.id]);

  const { icon: Icon, color } = toneConfig[item.tone];

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, x: 40, transition: { duration: 0.15 } }}
      transition={{ duration: 0.22, ease: [0.25, 0.46, 0.45, 0.94] }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      role="status"
      aria-live="polite"
      className="pointer-events-auto flex w-80 items-start gap-3 rounded-[var(--v-radius-lg)] border border-[var(--v-border)] bg-[var(--v-bg)] px-4 py-3 shadow-[var(--v-shadow-lg)]"
    >
      <Icon
        size={17}
        className={`mt-0.5 shrink-0 ${item.tone === "loading" ? "animate-spin" : ""}`}
        style={{ color }}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-[var(--v-text)]">{item.message}</p>
        {item.description && <p className="mt-0.5 text-xs text-[var(--v-text-subtle)]">{item.description}</p>}
        {item.actionLabel && item.onAction && (
          <button
            type="button"
            onClick={() => {
              item.onAction?.();
              dismiss(item.id);
            }}
            className="mt-1.5 text-xs font-bold text-[var(--v-primary)] hover:underline"
          >
            {item.actionLabel}
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={() => dismiss(item.id)}
        aria-label="إغلاق الإشعار"
        className="shrink-0 text-[var(--v-text-muted)] transition-colors hover:text-[var(--v-text)]"
      >
        <X size={14} />
      </button>
    </motion.div>
  );
}

export default function Toaster() {
  const [list, setList] = useState<ToastItem[]>([]);

  useEffect(() => {
    listeners.push(setList);
    return () => {
      listeners = listeners.filter((l) => l !== setList);
    };
  }, []);

  return (
    <div
      className="pointer-events-none fixed bottom-6 z-[60] flex flex-col-reverse gap-2"
      style={{ insetInlineEnd: "1.5rem" }}
    >
      <AnimatePresence>
        {list.map((item) => (
          <ToastRow key={item.id} item={item} />
        ))}
      </AnimatePresence>
    </div>
  );
}
