"use client";

import { useEffect } from "react";
import { toast } from "@/components/ui/Toaster";

/**
 * تسجيل الـ Service Worker + رصد نسخة جديدة جاهزة. لو لقينا Worker
 * تاني بينتظر (waiting)، نعرض Toast بزرار "تحديث" بدل ما نعمل Reload
 * تلقائي يقطع على المستخدم شغله.
 */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    let refreshing = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });

    navigator.serviceWorker.register("/sw.js").then((registration) => {
      function notifyIfWaiting(worker: ServiceWorker | null) {
        if (!worker) return;
        if (worker.state === "installed" && navigator.serviceWorker.controller) {
          toast.info("تحديث جديد متاح للنظام", {
            actionLabel: "تحديث الآن",
            onAction: () => worker.postMessage("SKIP_WAITING"),
            durationMs: 0,
          });
        }
      }

      notifyIfWaiting(registration.waiting);
      registration.addEventListener("updatefound", () => {
        const worker = registration.installing;
        worker?.addEventListener("statechange", () => notifyIfWaiting(worker));
      });
    }).catch(() => {
      // فشل التسجيل مش حرج — التطبيق يشتغل عادي أونلاين بدون PWA cache.
    });
  }, []);

  return null;
}
