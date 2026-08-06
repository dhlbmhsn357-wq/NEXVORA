/**
 * فحص صحة النظام (System Health Report) — **وحدة نقية بلا I/O**.
 *
 * يجمّع صحة قاعدة البيانات/الخدمات/التخزين/الأداء/الفهارس/الطابور/العمّال/
 * الكاش في تقرير + درجة. الخدمة تُغذّي الإشارات الفعلية (المتاحة عبر
 * service-role: طابور/عمّال/زمن استعلام)، وهذه الوحدة تُصدر الحكم.
 */

import type { HealthInput, HealthComponent, HealthReport } from "./verification-types";

export function buildHealthReport(input: HealthInput): HealthReport {
  const perfOk = input.avgQueryMs > 0 && input.avgQueryMs <= 500;
  const components: HealthComponent[] = [
    { key: "database", label: "قاعدة البيانات", ok: input.databaseOk, detail: input.databaseOk ? "متاحة وتستجيب." : "غير متاحة." },
    { key: "api", label: "الخدمات (API)", ok: input.apiOk, detail: input.apiOk ? "الخدمات المساندة تعمل." : "بعض الخدمات لا تستجيب." },
    { key: "storage", label: "التخزين", ok: input.storageOk, detail: input.storageOk ? "التخزين متاح." : "التخزين غير متاح." },
    { key: "performance", label: "الأداء", ok: perfOk, detail: perfOk ? `متوسّط الاستعلام ${input.avgQueryMs}ms (ضمن الحدّ).` : `متوسّط الاستعلام ${input.avgQueryMs}ms — مرتفع.` },
    { key: "indexes", label: "الفهارس", ok: input.indexesOk, detail: input.indexesOk ? "الفهارس مبنيّة." : "فهارس ناقصة تؤثّر على الأداء." },
    { key: "queues", label: "الطابور", ok: input.queuesOk, detail: input.queuesOk ? "الطابور جاهز." : "الطابور غير جاهز." },
    { key: "workers", label: "العمّال", ok: input.workersActive, detail: input.workersActive ? "عمّال نشطون." : "لا عمّال نشطون." },
    { key: "cache", label: "الكاش", ok: input.cacheOk, detail: input.cacheOk ? "الكاش يعمل." : "الكاش غير مفعّل." },
  ];
  const okCount = components.filter((c) => c.ok).length;
  const score = Math.round((okCount / components.length) * 100);
  // حاجز: قاعدة/تخزين متاحان لازمان لاعتبار الصحة ناجحة.
  const passed = input.databaseOk && input.storageOk && score >= 75;
  return { components, score, passed };
}
