// ⚠️ تحذير معماري (نفس تحذير check-runner.ts بالظبط): أي استيراد لهذا
// الملف من كود بيوصله الـ Client Bundle أو من مسار Server Component بيتنفذ
// وقت عرض الصفحة (زي page.tsx) ممنوع يكون Import ثابت — استخدم import()
// ديناميكي دايمًا. الملف ده بيستورد Playwright بشكل غير مباشر عبر
// browser-runner.ts.
import type { Browser, Page } from "playwright";
import { launchBrowser, newTrackedContext } from "@/lib/production-validation/browser-runner";

const MAX_PAGES = 20;
const CRAWL_TIME_BUDGET_MS = 45_000;
const PAGE_NAV_TIMEOUT_MS = 8_000;

function normalizeUrl(rawUrl: string): string | null {
  try {
    const u = new URL(rawUrl);
    u.hash = "";
    return u.toString();
  } catch {
    return null;
  }
}

async function collectSameOriginLinks(page: Page, origin: string): Promise<string[]> {
  const hrefs = await page.evaluate(() => Array.from(document.querySelectorAll("a[href]")).map((a) => (a as HTMLAnchorElement).href));
  const normalized = hrefs.map(normalizeUrl).filter((u): u is string => u !== null && u.startsWith(origin));
  return normalized;
}

/**
 * زحف حقيقي متكرر (BFS، مش صفحة رئيسية بس) لاكتشاف صفحات الموقع —
 * مبني خصيصًا لـ Production Monitoring (اكتشاف سريع للروابط بس، بدون
 * قياس أداء هنا — القياس الفعلي شغل check-runner.ts بعد كده). مُقيّد
 * بحد أقصى للصفحات ووقت إجمالي عشان الفحص اليومي (اللي بيغطي كل
 * المشاريع ورا بعض) يفضل جوّه مهلة Vercel Cron الحالية (260 ثانية).
 * أي صفحة تفشل وقت الاكتشاف بترفض بصمت هنا — هتظهر كـ Finding حقيقي
 * (unreachable/http_error) وقت الفحص الفعلي بعد كده، مش هنا.
 */
export async function discoverSitePages(rootUrl: string): Promise<string[]> {
  const origin = new URL(rootUrl).origin;
  const rootNormalized = normalizeUrl(rootUrl) ?? rootUrl;

  const discovered = new Set<string>([rootNormalized]);
  const visited = new Set<string>();
  const queue: string[] = [rootNormalized];
  const start = Date.now();

  let browser: Browser | null = null;
  try {
    browser = await launchBrowser();
    const { page } = await newTrackedContext(browser);

    while (queue.length > 0 && discovered.size < MAX_PAGES && Date.now() - start < CRAWL_TIME_BUDGET_MS) {
      const current = queue.shift();
      if (!current || visited.has(current)) continue;
      visited.add(current);

      try {
        await page.goto(current, { waitUntil: "domcontentloaded", timeout: PAGE_NAV_TIMEOUT_MS });
      } catch {
        continue;
      }

      const links = await collectSameOriginLinks(page, origin);
      for (const link of links) {
        if (discovered.size >= MAX_PAGES) break;
        if (discovered.has(link)) continue;
        discovered.add(link);
        queue.push(link);
      }
    }

    return [...discovered];
  } finally {
    if (browser) await browser.close();
  }
}
