import type { Page } from "playwright";
import { launchBrowser, newTrackedContext } from "@/lib/production-validation/browser-runner";

/**
 * ⚠️ تحذير معماري (تعلّمناه من حادثة إنتاج حقيقية): أي حاجة في الملف ده
 * بتستورد "playwright" بشكل غير مباشر (عبر lib/production-validation/browser-runner.ts).
 * ممنوع منعًا باتًا أي استيراد ثابت (import ثابت في أول أي ملف) لأي حاجة
 * من هنا من داخل Server Component أو أي كود بيوصله الـ Client Bundle —
 * استخدم import() ديناميكي دايمًا (نفس ما اتصلح في generation-service.ts
 * بتاع Production Validation). فتح صفحة مشروع واحدة سحب Playwright كاملة
 * (~300 ميجا) في حزمة الصفحة وكسر الموقع في الإنتاج قبل ما نكتشف السبب.
 *
 * طبقة فحص خفيف Read-Only حقيقي — بعكس Production Validation (Phase 4)
 * اللي بيدوس على التطبيق ويملى Forms ويضغط أزرار (هدّام محتمل)، الفحص
 * هنا بيقتصر على: زيارة الصفحة، قياس زمن الاستجابة الحقيقي، قياس
 * Web Vitals حقيقية عبر Performance API الفعلي للمتصفح، والتقاط أي
 * Console Error حقيقي — آمن 100% للتشغيل على بيئة Production حقيقية.
 */

const NAV_TIMEOUT_MS = 20_000;

export interface PageCheckResult {
  url: string;
  httpStatus: number | null;
  responseTimeMs: number;
  pageLoadTimeMs: number | null;
  lcpMs: number | null;
  cls: number | null;
  consoleErrors: string[];
  networkErrors: string[];
  reachable: boolean;
}

/** يقيس Web Vitals حقيقية عبر Performance API الفعلي للمتصفح — مش تقدير، أرقام حقيقية من نفس الزيارة. */
async function measureWebVitals(page: Page): Promise<{ pageLoadTimeMs: number | null; lcpMs: number | null; cls: number | null }> {
  return page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    const pageLoadTimeMs = nav ? Math.round(nav.loadEventEnd - nav.startTime) : null;

    const lcpEntries = performance.getEntriesByType("largest-contentful-paint");
    const lcpMs = lcpEntries.length > 0 ? Math.round(lcpEntries[lcpEntries.length - 1].startTime) : null;

    // Cumulative Layout Shift الحقيقي من PerformanceObserver مش متاح رجعيًا بعد التحميل من غير
    // Observer اتسجّل بدري — بنرجّع null بصراحة بدل تقدير، بدل ما نختلق رقم.
    const cls = null;

    return { pageLoadTimeMs, lcpMs, cls };
  });
}

/**
 * يفحص صفحة واحدة فعليًا: زيارة حقيقية، قياس زمن استجابة حقيقي، Web
 * Vitals حقيقية، والتقاط Console/Network Errors حقيقية. بيرجع نتيجة
 * صريحة حتى لو الصفحة مش متاحة (reachable=false) بدل ما يرمي Exception.
 */
export async function checkPage(browser: Awaited<ReturnType<typeof launchBrowser>>, url: string): Promise<PageCheckResult> {
  const { context, page, consoleErrors, networkErrors } = await newTrackedContext(browser);

  try {
    const start = Date.now();
    const response = await page.goto(url, { waitUntil: "load", timeout: NAV_TIMEOUT_MS }).catch(() => null);
    const responseTimeMs = Date.now() - start;

    if (!response) {
      return {
        url,
        httpStatus: null,
        responseTimeMs,
        pageLoadTimeMs: null,
        lcpMs: null,
        cls: null,
        consoleErrors,
        networkErrors,
        reachable: false,
      };
    }

    const vitals = await measureWebVitals(page).catch(() => ({ pageLoadTimeMs: null, lcpMs: null, cls: null }));

    return {
      url,
      httpStatus: response.status(),
      responseTimeMs,
      pageLoadTimeMs: vitals.pageLoadTimeMs,
      lcpMs: vitals.lcpMs,
      cls: vitals.cls,
      consoleErrors,
      networkErrors,
      reachable: response.ok(),
    };
  } finally {
    await context.close();
  }
}

/**
 * يفحص عدة صفحات بالتسلسل (نفس درس Meeting Prep: تسلسل بدل توازي لتجنّب
 * استهلاك موارد زيادة)، بحد أقصى زمني إجمالي اختياري — عشان لو الموقع
 * فيه صفحات كتير (لغاية 20 بعد توسيع الزحف)، فحص مشروع واحد بطيء ما
 * ياكلش وقت المسح اليومي كله (Cron واحد بيغطي كل المشاريع ورا بعض، سقف
 * 260 ثانية إجمالي — راجع sweep.ts). لو الوقت خلص، بيرجّع النتائج
 * الجزئية اللي جمعها لحد كده بدل ما يكمل الباقي — تغطية جزئية حقيقية،
 * مش تغطية كاملة وهمية.
 */
export async function runHealthCheck(urls: string[], timeBudgetMs?: number): Promise<PageCheckResult[]> {
  const start = Date.now();
  const browser = await launchBrowser();
  try {
    const results: PageCheckResult[] = [];
    for (const url of urls) {
      if (timeBudgetMs !== undefined && Date.now() - start > timeBudgetMs) break;
      results.push(await checkPage(browser, url));
    }
    return results;
  } finally {
    await browser.close();
  }
}
