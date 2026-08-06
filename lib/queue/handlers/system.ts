import { defineJobHandler } from "../registry";

/**
 * معالجات النظام المدمجة — **بنية تحتية بحتة، بلا أي منطق أعمال**.
 *
 * وجودها يخدم غرضين:
 *
 * ١. **إثبات مسار التوسيع.** لو النوعان دول اشتغلوا من غير أي تعديل
 *    على الطابور أو وقت التشغيل، يبقى إضافة عامل حقيقي لاحقًا
 *    (معرفة، ذكاء اصطناعي، مراجعة هندسية) تسجيلٌ فقط — وهو الشرط
 *    المعماري للمرحلة دي.
 *
 * ٢. **قياس البنية معزولة.** قياس أداء الطابور بمهام حقيقية بيقيس
 *    الذكاء الاصطناعي والشبكة مش الطابور. المهمة الفارغة بتعزل
 *    التكلفة الحقيقية للبنية نفسها.
 */

/** مهمة فارغة — تنجح فورًا. تُستخدم في القياس واختبار الطرف للطرف. */
export const NOOP_JOB = defineJobHandler<{ label?: string }>({
  type: "system.noop",
  workerType: "system",
  concurrency: 10,
  timeoutMs: 10_000,
  maxAttempts: 1,
  defaultPriority: "background",
  description: "مهمة فارغة للتحقّق من البنية وقياس أدائها.",
  handler: async (ctx) => {
    await ctx.reportProgress(100, "تمّت.");
    return { result: { label: ctx.payload.label ?? null, ok: true } };
  },
});

/**
 * مهمة متعدّدة الخطوات — تختبر التقدّم ونقاط التوقّف والإلغاء والاستئناف
 * دون أي عمل حقيقي.
 *
 * تستأنف من آخر خطوة محفوظة، فهي البرهان العملي على أن الاستئناف يعمل.
 */
export const STEPPED_JOB = defineJobHandler<{ steps?: number; stepMs?: number }>({
  type: "system.stepped",
  workerType: "system",
  concurrency: 5,
  timeoutMs: 60_000,
  maxAttempts: 2,
  defaultPriority: "background",
  description: "مهمة تجريبية متعدّدة الخطوات لاختبار التقدّم والاستئناف والإلغاء.",
  handler: async (ctx) => {
    const steps = Math.max(1, Math.min(ctx.payload.steps ?? 5, 100));
    const stepMs = Math.max(0, Math.min(ctx.payload.stepMs ?? 0, 1_000));

    // الاستئناف من آخر نقطة محفوظة لا من الصفر.
    const startAt = typeof ctx.checkpoint?.step === "number" ? ctx.checkpoint.step : 0;

    for (let step = startAt; step < steps; step++) {
      // فحص الإلغاء **بين** الخطوات لا أثناءها.
      if (await ctx.isCanceled()) {
        await ctx.log("execution", `اتلغت عند الخطوة ${step} من ${steps}.`);
        return;
      }

      if (stepMs > 0) await sleep(stepMs, ctx.signal);

      await ctx.saveCheckpoint({ step: step + 1 });
      await ctx.reportProgress(Math.round(((step + 1) / steps) * 100), `الخطوة ${step + 1}/${steps}`);
    }

    return { result: { steps, resumedFrom: startAt } };
  },
});

/** انتظار يحترم إشارة الإلغاء بدل أن يتجاهلها. */
function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new Error("aborted"));
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    function onAbort() {
      clearTimeout(timer);
      reject(new Error("aborted"));
    }
    signal.addEventListener("abort", onAbort, { once: true });
  });
}
