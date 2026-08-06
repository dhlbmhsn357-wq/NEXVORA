"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Download, X } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "pm-os-pwa-install-dismissed";

/**
 * زرار تركيب PWA يظهر بس لما المتصفح يطلق beforeinstallprompt (يعني
 * فعليًا قابل للتركيب) — مش زرار وهمي دايمًا ظاهر. لو المستخدم رفض،
 * بنحفظ القرار في localStorage عشان مانزعجهوش تاني في نفس الجهاز.
 */
export default function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      // localStorage غير متاح (خصوصية متصفح صارمة) — نتصرف كأنه مش مرفوض.
    }
    if (dismissed) return;

    function handler(e: Event) {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setVisible(true);
    }
    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", () => setVisible(false));
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  function dismiss() {
    setVisible(false);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // غير حرج.
    }
  }

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    setVisible(false);
  }

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          transition={{ duration: 0.2 }}
          className="fixed bottom-6 z-[55] flex items-center gap-3 rounded-[var(--v-radius-lg)] border border-[var(--v-border)] bg-[var(--v-bg)] px-4 py-3 shadow-[var(--v-shadow-lg)]"
          style={{ insetInlineStart: "1.5rem" }}
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-[var(--v-primary-tint)] text-[var(--v-primary)]">
            <Download size={16} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[var(--v-text)]">ثبّت VELORA PM</p>
            <p className="text-xs text-[var(--v-text-subtle)]">استخدمه كتطبيق مستقل من جهازك</p>
          </div>
          <button
            type="button"
            onClick={install}
            className="whitespace-nowrap rounded-[var(--v-radius-md)] bg-[var(--v-primary)] px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-[var(--v-primary-hover)]"
          >
            تثبيت
          </button>
          <button
            type="button"
            onClick={dismiss}
            aria-label="إغلاق"
            className="text-[var(--v-text-muted)] transition-colors hover:text-[var(--v-text)]"
          >
            <X size={14} />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
