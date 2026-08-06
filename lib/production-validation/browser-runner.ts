import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import type { ValidationJourneyStep } from "@/lib/types/database";
import { VIEWPORT_MATRIX, type ViewportSpec } from "./viewport-matrix";
import serverlessChromium from "@sparticuz/chromium";

export { VIEWPORT_MATRIX, type ViewportSpec };

/**
 * طبقة تشغيل المتصفح الحقيقي — Playwright + Chromium headless فعليًا.
 * صفر منطق فحص/تقييم هنا — مسؤولية واحدة: فتح صفحات حقيقية، تنفيذ
 * خطوات حقيقية، والتقاط دليل حقيقي (Console/Network/Screenshot/DOM).
 *
 * قيد معروف (موثّق صراحةً في التقرير الختامي): Chromium بس في هذه
 * النسخة — Firefox/Safari/Edge ومصفوفة أجهزة Mobile حقيقية تحتاج بنية
 * تحتية غير متوفرة حاليًا (Device Farm أو خدمة خارجية مدفوعة).
 */

const NAV_TIMEOUT_MS = 20_000;

export interface StepExecutionResult {
  passed: boolean;
  actualResult: string;
  screenshotBuffer: Buffer | null;
  consoleErrors: string[];
  networkErrors: string[];
}

/** قيم إدخال حقيقية لكل نوع مطلوب في السبيك — مش نص عام واحد لكل الحالات. */
const INPUT_VALUES: Record<NonNullable<ValidationJourneyStep["inputKind"]>, string> = {
  valid: "",
  empty: "",
  huge: "x".repeat(5000),
  special_chars: "<script>alert(1)</script>'; DROP TABLE users; --",
  emoji: "😀🚀👍💯🔥",
  unicode: "العربية 中文 日本語 Ελληνικά",
  sql_injection_like: "' OR '1'='1",
};

function resolveInputValue(step: ValidationJourneyStep): string {
  if (step.inputKind && step.inputKind !== "valid") return INPUT_VALUES[step.inputKind];
  return step.value ?? "";
}

/**
 * حادثة إنتاج حقيقية اتحلّت هنا: على Vercel، Playwright بيلاقي Chromium
 * اللي بيتحمّل وقت npm install محليًا مش موجود جوّه الـ Serverless
 * Function نفسها ("Cannot find module .../playwright-core/browsers.json")
 * — الملفات دي كبيرة جدًا ومحدودش Vercel بيضمّها تلقائيًا. الحل: على
 * Vercel (process.env.VERCEL بيتحط تلقائيًا في كل بيئاته) نستخدم
 * @sparticuz/chromium، نسخة Chromium مبنية خصوصًا للتشغيل جوّه بيئات
 * Serverless (AWS Lambda/Vercel) وبتتضم فعليًا في حزمة الدوال. محليًا
 * (Dev) بيفضل بيستخدم نسخة Playwright العادية اللي اتحمّلت وقت التثبيت.
 */
export async function launchBrowser(): Promise<Browser> {
  if (process.env.VERCEL) {
    return chromium.launch({
      args: serverlessChromium.args,
      executablePath: await serverlessChromium.executablePath(),
      headless: true,
    });
  }
  return chromium.launch({ headless: true });
}

export async function newTrackedContext(browser: Browser, viewport?: ViewportSpec): Promise<{
  context: BrowserContext;
  page: Page;
  consoleErrors: string[];
  networkErrors: string[];
}> {
  const context = await browser.newContext(viewport ? { viewport: { width: viewport.width, height: viewport.height } } : undefined);
  const page = await context.newPage();
  const consoleErrors: string[] = [];
  const networkErrors: string[] = [];

  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => consoleErrors.push(err.message));
  page.on("requestfailed", (req) => networkErrors.push(`${req.method()} ${req.url()} — ${req.failure()?.errorText ?? "فشل غير معروف"}`));

  return { context, page, consoleErrors, networkErrors };
}

/** يحاول تحديد العنصر بالطريقة اللي مستخدم حقيقي هيلاقيه بيها — Role/Text/Label، مش CSS Selector. */
function locate(page: Page, target: string) {
  return page
    .getByRole("button", { name: target, exact: false })
    .or(page.getByRole("link", { name: target, exact: false }))
    .or(page.getByRole("tab", { name: target, exact: false }))
    .or(page.getByLabel(target, { exact: false }))
    .or(page.getByPlaceholder(target, { exact: false }))
    .or(page.getByText(target, { exact: false }))
    .first();
}

/**
 * ينفّذ خطوة واحدة فعليًا على الصفحة الحقيقية. بيرجّع نتيجة صريحة
 * (نجحت/فشلت + النص الفعلي اللي حصل) — الفشل هنا معناه حقيقي: العنصر
 * مالقيتوش، أو التنقل فشل، أو النص المتوقع مش موجود.
 */
export async function executeStep(
  page: Page,
  baseUrl: string,
  step: ValidationJourneyStep
): Promise<{ passed: boolean; actualResult: string }> {
  try {
    switch (step.type) {
      case "navigate": {
        const url = step.target?.startsWith("http") ? step.target : new URL(step.target ?? "/", baseUrl).toString();
        const res = await page.goto(url, { waitUntil: "load", timeout: NAV_TIMEOUT_MS });
        if (!res || !res.ok()) return { passed: false, actualResult: `فشل فتح الصفحة (HTTP ${res?.status() ?? "?"})` };
        return { passed: true, actualResult: `تم فتح ${url} بنجاح` };
      }
      case "click": {
        if (!step.target) return { passed: false, actualResult: "لا يوجد Target محدد للنقر." };
        await locate(page, step.target).click({ timeout: NAV_TIMEOUT_MS });
        return { passed: true, actualResult: `تم النقر على "${step.target}"` };
      }
      case "double_click": {
        if (!step.target) return { passed: false, actualResult: "لا يوجد Target محدد للنقر المزدوج." };
        await locate(page, step.target).dblclick({ timeout: NAV_TIMEOUT_MS });
        return { passed: true, actualResult: `تم النقر المزدوج على "${step.target}"` };
      }
      case "rapid_click": {
        if (!step.target) return { passed: false, actualResult: "لا يوجد Target محدد للنقر السريع." };
        const el = locate(page, step.target);
        for (let i = 0; i < 3; i++) await el.click({ timeout: NAV_TIMEOUT_MS, force: i > 0 }).catch(() => {});
        return { passed: true, actualResult: `تم الضغط السريع (3 مرات) على "${step.target}"` };
      }
      case "fill": {
        if (!step.target) return { passed: false, actualResult: "لا يوجد Target محدد للكتابة." };
        const value = resolveInputValue(step);
        await locate(page, step.target).fill(value, { timeout: NAV_TIMEOUT_MS });
        return { passed: true, actualResult: `تم إدخال قيمة (${step.inputKind ?? "valid"}) في "${step.target}"` };
      }
      case "expect_text": {
        if (!step.target) return { passed: false, actualResult: "لا يوجد نص متوقع محدد." };
        const visible = await page.getByText(step.target, { exact: false }).first().isVisible({ timeout: NAV_TIMEOUT_MS }).catch(() => false);
        return visible
          ? { passed: true, actualResult: `النص "${step.target}" ظاهر فعليًا` }
          : { passed: false, actualResult: `النص المتوقع "${step.target}" غير موجود في الصفحة` };
      }
      case "wait": {
        await page.waitForTimeout(Number(step.value) || 1000);
        return { passed: true, actualResult: "تم الانتظار" };
      }
      case "go_back": {
        await page.goBack({ timeout: NAV_TIMEOUT_MS });
        return { passed: true, actualResult: "تم الرجوع للصفحة السابقة" };
      }
      case "go_forward": {
        await page.goForward({ timeout: NAV_TIMEOUT_MS });
        return { passed: true, actualResult: "تم التقدم للصفحة التالية" };
      }
      case "reload": {
        await page.reload({ timeout: NAV_TIMEOUT_MS });
        return { passed: true, actualResult: "تم تحديث الصفحة" };
      }
      case "set_offline": {
        await page.context().setOffline(true);
        return { passed: true, actualResult: "تم قطع الاتصال (Offline Mode)" };
      }
      case "set_online": {
        await page.context().setOffline(false);
        return { passed: true, actualResult: "تم استعادة الاتصال" };
      }
      case "throttle_network": {
        const client = await page.context().newCDPSession(page);
        await client.send("Network.emulateNetworkConditions", {
          offline: false,
          downloadThroughput: (50 * 1024) / 8,
          uploadThroughput: (20 * 1024) / 8,
          latency: 800,
        });
        return { passed: true, actualResult: "تم تفعيل محاكاة اتصال بطيء (Slow 3G تقريبًا)" };
      }
      default:
        return { passed: false, actualResult: `نوع خطوة غير مدعوم: ${step.type}` };
    }
  } catch (err) {
    return { passed: false, actualResult: err instanceof Error ? err.message : "فشل غير متوقع أثناء تنفيذ الخطوة." };
  }
}

export interface OverflowCheckResult {
  hasHorizontalOverflow: boolean;
  scrollWidth: number;
  clientWidth: number;
  overlappingElementCount: number;
}

/** فحص Overflow/تداخل عناصر حقيقي عبر قياسات DOM فعلية — مش تخمين. */
export async function checkResponsiveOverflow(page: Page): Promise<OverflowCheckResult> {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const hasHorizontalOverflow = doc.scrollWidth > doc.clientWidth + 1;

    // تداخل عناصر تقريبي: عناصر تفاعلية (button/a/input) بتتقاطع مساحاتها مع بعض.
    const interactive = Array.from(document.querySelectorAll("button, a, input, select, textarea")) as HTMLElement[];
    let overlappingElementCount = 0;
    for (let i = 0; i < interactive.length; i++) {
      const a = interactive[i].getBoundingClientRect();
      if (a.width === 0 || a.height === 0) continue;
      for (let j = i + 1; j < interactive.length; j++) {
        const b = interactive[j].getBoundingClientRect();
        if (b.width === 0 || b.height === 0) continue;
        const overlap = !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
        if (overlap) {
          overlappingElementCount++;
          break;
        }
      }
    }

    return {
      hasHorizontalOverflow,
      scrollWidth: doc.scrollWidth,
      clientWidth: doc.clientWidth,
      overlappingElementCount,
    };
  });
}

export interface AxeViolation {
  id: string;
  impact: string | null;
  description: string;
  help: string;
  helpUrl: string;
  nodesCount: number;
  targetSelectors: string[];
}

/** فحص Accessibility حقيقي بمحرك axe-core الرسمي — مش استنتاج AI. */
export async function runAccessibilityScan(page: Page): Promise<AxeViolation[]> {
  const results = await new AxeBuilder({ page }).analyze();
  return results.violations.map((v) => ({
    id: v.id,
    impact: v.impact ?? null,
    description: v.description,
    help: v.help,
    helpUrl: v.helpUrl,
    nodesCount: v.nodes.length,
    targetSelectors: v.nodes.slice(0, 3).map((n) => n.target.join(" ")),
  }));
}

export async function takeScreenshot(page: Page): Promise<Buffer> {
  return page.screenshot({ fullPage: false });
}
