/**
 * تطبيع أرقام الهاتف المصرية — Pure function، بدون I/O.
 * ==========================================================
 * أرقام الهاتف Identifiers نصية دائمًا — لا تُخزَّن أو تُعالَج كأرقام
 * حسابية أبدًا. لا تخترع رقمًا "يبدو صحيحًا" — لو مش متأكدين، isValid=false
 * وnormalized=null.
 *
 * الموبايل المصري الصالح بعد التطبيع: 201[0125]XXXXXXXX
 * (بادئة كود الدولة 20 + 1 + بادئة الشبكة 0/1/2/5 + 8 أرقام = 12 رقمًا
 * إجمالي بعد الـ 20، أي 201XXXXXXXXX = 12 خانة).
 */

export interface PhoneNormalizationResult {
  /** القيمة الأصلية كما أُدخلت — لا تُعدَّل أبدًا. */
  raw: string;
  /** الرقم المطبَّع بصيغة 201XXXXXXXXX بدون +، أو null لو غير صالح. */
  normalized: string | null;
  isValid: boolean;
}

const EGYPT_MOBILE_PREFIXES = ["10", "11", "12", "15"] as const;

/** يتحقق أن الرقم المطبَّع (بدون كود دولة) بصيغة موبايل مصري صالح: 1[0125]XXXXXXXX = 10 أرقام. */
function isValidLocalMobile(local10: string): boolean {
  if (local10.length !== 10) return false;
  if (local10[0] !== "1") return false;
  const prefix = local10.slice(0, 2);
  return (EGYPT_MOBILE_PREFIXES as readonly string[]).includes(prefix);
}

export function normalizeEgyptianPhone(raw: string): PhoneNormalizationResult {
  const invalid: PhoneNormalizationResult = { raw, normalized: null, isValid: false };

  if (typeof raw !== "string") return invalid;

  // إزالة المسافات والشرطات والأقواس والنقاط الفاصلة الشائعة في ملفات Excel.
  let cleaned = raw.replace(/[\s\-()./]/g, "");
  if (cleaned === "") return invalid;

  // إزالة + البادئة (كود الدولة الدولي).
  if (cleaned.startsWith("+")) {
    cleaned = cleaned.slice(1);
  }

  // كل الأرقام المتبقية يجب أن تكون خانات عشرية فقط.
  if (!/^\d+$/.test(cleaned)) return invalid;

  let local10: string | null = null;

  if (cleaned.startsWith("0020")) {
    // 0020 + 10 أرقام محلية (بدون الصفر المحلي) = 14 خانة
    const rest = cleaned.slice(4);
    if (rest.length === 10) local10 = rest;
  } else if (cleaned.startsWith("20")) {
    // 20 + 10 أرقام محلية = 12 خانة
    const rest = cleaned.slice(2);
    if (rest.length === 10) local10 = rest;
  } else if (cleaned.startsWith("01")) {
    // رقم محلي: 01XXXXXXXXX = 11 خانة (0 + 10 أرقام)
    if (cleaned.length === 11) local10 = cleaned.slice(1);
  } else if (cleaned.startsWith("1") && cleaned.length === 10) {
    // بدون صفر وبدون كود دولة — 1XXXXXXXXX = 10 أرقام
    local10 = cleaned;
  }

  if (!local10 || !isValidLocalMobile(local10)) return invalid;

  return { raw, normalized: `20${local10}`, isValid: true };
}
