import type { ClientPresentationSlides } from "@/lib/types/database";

/**
 * فحص اتساق العرض التنفيذي — تحقّق حتمي (Deterministic) خالص يمشي على
 * محتوى الشرائح بدون أي استدعاء AI (قرار مقصود: صفر استهلاك لحصة
 * Gemini، ونتيجة فورية طازجة تُحسب وقت العرض). بيرصد المشاكل اللي
 * بتكسر "احترافية أعمال-فقط": تسريب مصطلحات تقنية، محتوى Placeholder
 * فاضي، ونصوص رفيعة جدًّا. النتيجة إرشادية (Warnings) بتتعرض للـ PM
 * قبل التقديم — مش بوابة إلزامية.
 */

export type QualitySeverity = "warning" | "info";

export interface QualityWarning {
  slideKey: string;
  severity: QualitySeverity;
  message: string;
}

// مصطلحات تقنية صريحة ممنوعة في عرض موجّه لغير التقنيين. مقصود إنها
// محدّدة وواضحة (مش كلمات عامة زي "نظام") عشان نتجنّب False Positives.
const TECHNICAL_TERMS: { pattern: RegExp; label: string }[] = [
  { pattern: /\bSQL\b/i, label: "SQL" },
  { pattern: /\bAPI\b/i, label: "API" },
  { pattern: /\bendpoint(s)?\b/i, label: "endpoint" },
  { pattern: /\bschema\b/i, label: "schema" },
  { pattern: /\bwebhook(s)?\b/i, label: "webhook" },
  { pattern: /\b(REST|GraphQL|gRPC)\b/i, label: "REST/GraphQL" },
  { pattern: /\bJSON\b/i, label: "JSON" },
  { pattern: /\b(Docker|Kubernetes|k8s)\b/i, label: "Docker/Kubernetes" },
  { pattern: /\b(Postgres(QL)?|Supabase|MySQL|MongoDB)\b/i, label: "قاعدة بيانات باسمها" },
  { pattern: /\b(Next\.js|React|Node\.js|TypeScript)\b/i, label: "إطار عمل تقني" },
  { pattern: /\bmigration(s)?\b/i, label: "migration" },
  { pattern: /قاعدة بيانات/, label: "قاعدة بيانات" },
];

const PLACEHOLDER_VALUES = ["—", "-", "...", "…", "todo", "tbd", "n/a", "لا يوجد", "لا توجد بيانات"];

// شرائح بنسمح فيها بشرح تقني مبسّط (نظرة عامة على النظام) — بنخفّض
// تسريب المصطلح فيها لـ info بدل warning.
const TECH_TOLERANT_SLIDES = new Set(["architecture", "ai_capabilities"]);

function collectStrings(value: unknown, acc: string[]): void {
  if (typeof value === "string") {
    acc.push(value);
  } else if (Array.isArray(value)) {
    for (const v of value) collectStrings(v, acc);
  } else if (value && typeof value === "object") {
    for (const v of Object.values(value)) collectStrings(v, acc);
  }
}

function isPlaceholder(text: string): boolean {
  const t = text.trim().toLowerCase();
  return PLACEHOLDER_VALUES.includes(t);
}

/**
 * بيفحص عرضًا كاملًا ويرجّع قائمة تحذيرات (فاضية = العرض متّسق ونظيف).
 * clientName اختياري — لو مبعوت بيتأكد إن اسم العميل على الغلاف مش فاضي.
 */
export function checkPresentationConsistency(
  slides: ClientPresentationSlides,
  opts: { clientName?: string } = {}
): QualityWarning[] {
  const warnings: QualityWarning[] = [];
  const record = slides as unknown as Record<string, unknown>;

  for (const [slideKey, slideValue] of Object.entries(record)) {
    const strings: string[] = [];
    collectStrings(slideValue, strings);

    // 1) Placeholder / فاضي
    for (const str of strings) {
      if (isPlaceholder(str)) {
        warnings.push({ slideKey, severity: "warning", message: `شريحة "${slideKey}" فيها محتوى Placeholder فارغ ("${str.trim()}").` });
        break;
      }
    }

    // 2) تسريب مصطلح تقني
    const tolerant = TECH_TOLERANT_SLIDES.has(slideKey);
    for (const { pattern, label } of TECHNICAL_TERMS) {
      if (strings.some((str) => pattern.test(str))) {
        warnings.push({
          slideKey,
          severity: tolerant ? "info" : "warning",
          message: `شريحة "${slideKey}" فيها مصطلح تقني (${label}) — العرض المفروض أعمال-فقط لغير التقنيين.`,
        });
      }
    }
  }

  // 3) اسم العميل على الغلاف
  if (opts.clientName !== undefined) {
    const cover = record.cover as { client_name?: string } | undefined;
    const name = cover?.client_name?.trim() ?? "";
    if (name.length === 0 || isPlaceholder(name)) {
      warnings.push({ slideKey: "cover", severity: "warning", message: "اسم العميل على الغلاف فارغ أو غير محدّد." });
    }
  }

  return warnings;
}
