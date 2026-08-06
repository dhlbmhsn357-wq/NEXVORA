/**
 * نقطة دخول العامل — المُشغَّلة على Railway.
 *
 * التشغيل:
 * ```
 * WORKER_TYPE=system WORKER_KEY=system-1 npx tsx services/worker/index.ts
 * ```
 *
 * **إضافة عامل جديد لاحقًا لا تلمس هذا الملف.** بتسجّل المعالجات في
 * `lib/queue/handlers/`، وبتشغّل نفس الملف بـ `WORKER_TYPE` مختلف.
 * وقت التشغيل بيسأل السجل ويلاقي الأنواع لوحده.
 */

// الاستيراد لأثره الجانبي: تحميل الملف بيسجّل كل المعالجات.
import "@/lib/queue/handlers";

import { DEFAULT_WORKER_CONFIG, Scheduler, Worker } from "./runtime";

async function main() {
  const workerType = process.env.WORKER_TYPE;
  if (!workerType) {
    console.error("WORKER_TYPE مطلوب — مثال: system · ai · browser · document");
    process.exit(1);
  }

  // معرّف مستقر لكل نسخة. Railway بيوفّر REPLICA_ID، ولو مش موجود
  // بنولّد واحدًا — التسجيل لازم يفضل فريدًا وإلا داست نسخة على أخرى.
  const workerKey =
    process.env.WORKER_KEY ??
    `${workerType}-${process.env.RAILWAY_REPLICA_ID ?? process.pid}`;

  const worker = new Worker({
    ...DEFAULT_WORKER_CONFIG,
    workerType,
    workerKey,
    concurrency: Number(process.env.WORKER_CONCURRENCY ?? DEFAULT_WORKER_CONFIG.concurrency),
    version: process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7),
  });

  // المجدوِل على نسخة واحدة فقط: الازدواج بيكرّر الصيانة بلا ضرر لكنه هدر.
  const scheduler = process.env.RUN_SCHEDULER === "true" ? new Scheduler() : null;
  scheduler?.start();

  const shutdown = async (signal: string) => {
    scheduler?.stop();
    await worker.shutdown(`إشارة ${signal}`);
    process.exit(0);
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  // الاستثناء غير الملتقَط بيسيب العملية في حالة غير معروفة. الخروج
  // المتعمَّد أوضح: Railway بيعيد التشغيل، وآلية التعافي بتلقط المهام.
  process.on("uncaughtException", (err) => {
    console.error("[worker] استثناء غير ملتقَط:", err);
    void shutdown("uncaughtException");
  });
  process.on("unhandledRejection", (err) => {
    console.error("[worker] رفض غير معالَج:", err);
  });

  await worker.start();
}

void main().catch((err) => {
  console.error("[worker] فشل الإقلاع:", err);
  process.exit(1);
});
