import { launchBrowser, newTrackedContext } from "./browser-runner";

const MAX_LINKS = 15;
const CRAWL_TIMEOUT_MS = 20_000;

export interface SiteMap {
  homepageTitle: string;
  pages: { url: string; text: string }[];
  actionLabels: string[];
}

/**
 * زحف خفيف بمتصفح حقيقي واحد (الصفحة الرئيسية بس) — بيجمع روابط
 * وأزرار حقيقية موجودة فعليًا في التطبيق، عشان توليد الرحلات بالـ AI
 * يتأسس على واقع حقيقي (أسماء صفحات/أزرار موجودة) مش أسماء مُختلَقة.
 * ده تأسيس (Grounding) بس، مش تحقق آلي لاحق من كل خطوة رحلة مُولَّدة —
 * أي خطوة بتشير لعنصر مش موجود فعليًا هتفشل بصدق وقت التنفيذ الحقيقي
 * (Finding حقيقي)، مش هتُكتشف قبل كده.
 */
export async function crawlSiteMap(stagingUrl: string): Promise<SiteMap> {
  const browser = await launchBrowser();
  try {
    const { page } = await newTrackedContext(browser);
    await page.goto(stagingUrl, { waitUntil: "load", timeout: CRAWL_TIMEOUT_MS });
    const homepageTitle = await page.title();

    const origin = new URL(stagingUrl).origin;
    const links = await page.evaluate(() => {
      return Array.from(document.querySelectorAll("a[href]")).map((a) => ({
        href: (a as HTMLAnchorElement).href,
        text: (a.textContent ?? "").trim(),
      }));
    });
    const actionLabels = await page.evaluate(() => {
      const els = Array.from(document.querySelectorAll("button, [role='tab'], [role='button']"));
      return els.map((e) => (e.textContent ?? "").trim()).filter(Boolean);
    });

    const samePagesMap = new Map<string, string>();
    for (const link of links) {
      if (!link.href.startsWith(origin) || !link.text) continue;
      if (!samePagesMap.has(link.href)) samePagesMap.set(link.href, link.text);
      if (samePagesMap.size >= MAX_LINKS) break;
    }

    return {
      homepageTitle,
      pages: [...samePagesMap.entries()].map(([url, text]) => ({ url, text })),
      actionLabels: [...new Set(actionLabels)].slice(0, MAX_LINKS),
    };
  } finally {
    await browser.close();
  }
}
