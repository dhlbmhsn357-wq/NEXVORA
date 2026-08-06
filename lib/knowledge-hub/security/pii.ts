/**
 * كشف وإخفاء البيانات الحسّاسة — **وحدة نقية بلا I/O**.
 *
 * ## ما هذا وما ليس هذا
 *
 * ده **كشف بالأنماط** (Regex) لا محرّك تصنيف ذكي. بيمسك الأنماط
 * الشائعة القابلة للتعرّف حتميًا: بريد، هواتف، بطاقات، IBAN، أرقام
 * قومية، مفاتيح API. **مش** بيمسك الأسماء أو العناوين الحرة (دي تحتاج
 * NER) — وادّعاء ذلك أخطر من الصمت عنه.
 *
 * الاستخدام: فحص محتوى المعرفة قبل التصدير (إخفاء اختياري)، وعدّ
 * الأعلام في تقرير الجودة (تنبيه المدير لوجود بيانات حسّاسة).
 */

export type PiiKind =
  | "email"
  | "phone"
  | "credit_card"
  | "iban"
  | "national_id"
  | "api_key"
  | "ip_address";

export interface PiiMatch {
  kind: PiiKind;
  value: string;
  index: number;
}

export const PII_LABELS: Record<PiiKind, string> = {
  email: "بريد إلكتروني",
  phone: "رقم هاتف",
  credit_card: "بطاقة ائتمان",
  iban: "حساب بنكي (IBAN)",
  national_id: "رقم قومي",
  api_key: "مفتاح API / سرّ",
  ip_address: "عنوان IP",
};

interface Detector {
  kind: PiiKind;
  regex: RegExp;
  /** تحقّق إضافي بعد المطابقة (Luhn للبطاقات مثلًا) لتقليل الإيجابيات الكاذبة. */
  validate?: (value: string) => boolean;
}

// ملاحظة: كل الأنماط بلا علامة g هنا؛ البحث بيضيفها عند التكرار.
const DETECTORS: Detector[] = [
  {
    kind: "email",
    regex: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/,
  },
  {
    // مفاتيح شائعة: sk-... , AKIA... , ghp_... , رموز طويلة عشوائية بادئة معروفة.
    kind: "api_key",
    regex: /\b(?:sk-[A-Za-z0-9]{16,}|AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{10,})\b/,
  },
  {
    kind: "iban",
    regex: /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/,
    validate: (v) => v.length >= 15 && v.length <= 34,
  },
  {
    kind: "credit_card",
    regex: /\b(?:\d[ -]?){13,19}\b/,
    validate: (v) => luhnValid(v.replace(/[ -]/g, "")),
  },
  {
    // رقم قومي مصري (١٤ رقمًا) أو ما يشبهه — نمط طويل من الأرقام المتّصلة.
    kind: "national_id",
    regex: /\b\d{14}\b/,
  },
  {
    kind: "phone",
    // دولي أو محلي بفواصل شائعة، ٧–١٥ رقمًا.
    regex: /(?:\+?\d{1,3}[ -]?)?(?:\(?\d{2,4}\)?[ -]?){2,4}\d{2,4}/,
    validate: (v) => {
      const digits = v.replace(/\D/g, "");
      return digits.length >= 7 && digits.length <= 15;
    },
  },
  {
    kind: "ip_address",
    regex: /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/,
  },
];

/** خوارزمية Luhn — تتحقّق من صحة رقم البطاقة، تقلّل الإيجابيات الكاذبة. */
function luhnValid(digits: string): boolean {
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = Number(digits[i]);
    if (Number.isNaN(n)) return false;
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

/**
 * يكتشف كل تطابقات PII في نصّ.
 *
 * الترتيب مقصود: الأنماط الأكثر تحديدًا (بريد، مفتاح، IBAN، بطاقة) قبل
 * الأعمّ (هاتف، رقم) — والمناطق المُطابَقة تُستبعَد من الفحص الأعمّ عشان
 * رقم البطاقة مايتعدّش «هاتفًا» كمان.
 */
export function detectPii(text: string): PiiMatch[] {
  if (!text) return [];
  const matches: PiiMatch[] = [];
  const claimed: Array<[number, number]> = []; // مناطق مُطالَب بها

  const overlaps = (start: number, end: number): boolean =>
    claimed.some(([s, e]) => start < e && end > s);

  for (const det of DETECTORS) {
    const re = new RegExp(det.regex.source, det.regex.flags.includes("g") ? det.regex.flags : det.regex.flags + "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const value = m[0];
      const start = m.index;
      const end = start + value.length;
      if (overlaps(start, end)) continue;
      if (det.validate && !det.validate(value)) continue;
      matches.push({ kind: det.kind, value, index: start });
      claimed.push([start, end]);
    }
  }

  return matches.sort((a, b) => a.index - b.index);
}

/** ملخّص العدّ لكل نوع — للتقارير. */
export function summarizePii(text: string): Record<PiiKind, number> {
  const summary = {} as Record<PiiKind, number>;
  for (const k of Object.keys(PII_LABELS) as PiiKind[]) summary[k] = 0;
  for (const m of detectPii(text)) summary[m.kind] += 1;
  return summary;
}

/**
 * يُخفي قيمة حسّاسة مع إبقاء آخر ٤ محارف للتعرّف («•••• 4242»).
 */
export function maskValue(value: string, kind: PiiKind): string {
  if (kind === "email") {
    const [local, domain] = value.split("@");
    if (!domain) return "••••";
    const head = local.slice(0, 1);
    return `${head}••••@${domain}`;
  }
  const tail = value.replace(/\s/g, "").slice(-4);
  return `•••• ${tail}`;
}

/**
 * يُخفي كل PII في نصّ. بيرجّع النصّ المُخفَى وعدد ما أُخفي.
 *
 * الإخفاء من الآخِر للأول عشان الفهارس ماتتغيّرش أثناء الاستبدال.
 */
export function maskPii(text: string): { masked: string; count: number } {
  const matches = detectPii(text);
  if (matches.length === 0) return { masked: text, count: 0 };

  let result = text;
  for (const m of [...matches].sort((a, b) => b.index - a.index)) {
    const replacement = maskValue(m.value, m.kind);
    result = result.slice(0, m.index) + replacement + result.slice(m.index + m.value.length);
  }
  return { masked: result, count: matches.length };
}
