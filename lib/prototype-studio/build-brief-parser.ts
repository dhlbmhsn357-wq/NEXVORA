/**
 * Prototype Studio — Build Brief Parser (soft validation)
 * =======================================================
 * يفحص وجود أقسام أساسية داخل Build Brief المُلصق من ChatGPT.
 * لا يرفض — يُرجع تحذيرات فقط. القرار النهائي بشري.
 *
 * الأقسام المتوقعة (تعرف على أي heading Markdown بأي level يحتوي الاسم):
 *   • Objective  / Goal
 *   • Scope
 *   • Flows      / User Flows
 *   • Screens    / Wireframes
 */

export const EXPECTED_SECTIONS = [
  { key: "objective", labels: ["objective", "goal", "الهدف"] },
  { key: "scope",     labels: ["scope", "النطاق"] },
  { key: "flows",     labels: ["flows", "user flows", "التدفّقات", "تدفقات"] },
  { key: "screens",   labels: ["screens", "wireframes", "الشاشات"] },
] as const;

export type BriefSectionKey = (typeof EXPECTED_SECTIONS)[number]["key"];

export interface BuildBriefParseResult {
  wordCount: number;
  headingsFound: string[];
  missingSections: BriefSectionKey[];
  warnings: string[];
}

/**
 * ينظّف قيم hex اللي جاي بادئة `#` مكرّرة (`##0E7490` → `#0E7490`).
 * سبب المشكلة: ChatGPT أحيانًا يكتب `##RRGGBB` بالخطأ (# ثاني من markdown syntax
 * أو لخلط بين hex prefix و heading marker). النتيجة على الشاشة `##0E7490`.
 * القاعدة: `##` أو أكثر متبوعة بـ 3/6/8 hex digits → نُبقي `#` واحدة فقط.
 * لا نلمس `##` في headings (سطر يبدأ بها + مسافة + كلمات).
 */
export function normalizeHexInBrief(content: string): string {
  return content.replace(/#{2,}([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g, "#$1");
}

export function parseBuildBrief(content: string): BuildBriefParseResult {
  const trimmed = content.trim();
  const wordCount = trimmed.split(/\s+/).filter(Boolean).length;
  const headings = extractHeadings(trimmed);
  const lowered = headings.map((h) => h.toLowerCase());

  const missing: BriefSectionKey[] = [];
  for (const s of EXPECTED_SECTIONS) {
    const found = lowered.some((h) => s.labels.some((l) => h.includes(l)));
    if (!found) missing.push(s.key);
  }

  const warnings: string[] = [];
  if (wordCount < 100) warnings.push("المحتوى قصير جدًا (<100 كلمة) — تأكد أن الـ brief كامل.");
  if (missing.length > 0) warnings.push(`أقسام ناقصة: ${missing.join(", ")}`);
  if (headings.length === 0) warnings.push("لا توجد عناوين Markdown — الـ brief قد يكون غير مُهيكل.");

  return { wordCount, headingsFound: headings, missingSections: missing, warnings };
}

function extractHeadings(md: string): string[] {
  const out: string[] = [];
  for (const line of md.split("\n")) {
    const m = /^\s*#{1,6}\s+(.+?)\s*$/.exec(line);
    if (m) out.push(m[1]);
  }
  return out;
}
