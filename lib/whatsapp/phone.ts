/**
 * تطبيع رقم الهاتف إلى صيغة E.164 بدون + (كما تطلبها معظم الـ APIs زي Meta).
 *
 * الاستراتيجية:
 *  1) نشيل أي رموز غير أرقام.
 *  2) لو الرقم بيبدأ بـ 00 نستبدلها بلا شيء (كود دولي دولي).
 *  3) لو ما فيهوش كود دولة (طوله محلي)، نضيف كود الدولة الافتراضي.
 *  4) نتحقق من طول معقول (7-15 رقم) — قاعدة E.164.
 */

/** خريطة كود الدولة لكل ISO alpha-2 مدعومة (يمكن التوسّع). */
const COUNTRY_TO_CC: Record<string, string> = {
  EG: "20",
  SA: "966",
  AE: "971",
  QA: "974",
  KW: "965",
  BH: "973",
  OM: "968",
  JO: "962",
  MA: "212",
  DZ: "213",
  TN: "216",
  LY: "218",
  IQ: "964",
  YE: "967",
  SY: "963",
  LB: "961",
  PS: "970",
  SD: "249",
  US: "1",
  GB: "44",
  DE: "49",
  FR: "33",
  TR: "90",
  IN: "91",
};

export type PhoneNormalizationResult =
  | { ok: true; e164: string }
  | { ok: false; reason: string };

export function normalizePhone(
  raw: string | null | undefined,
  defaultCountry: string
): PhoneNormalizationResult {
  if (!raw || typeof raw !== "string") {
    return { ok: false, reason: "الرقم فاضي." };
  }
  const trimmed = raw.trim();
  const hasPlus = trimmed.startsWith("+");
  let digits = trimmed.replace(/\D+/g, "");

  if (!digits) return { ok: false, reason: "الرقم لا يحتوي على أرقام." };

  // 00XX… → XX…
  if (!hasPlus && digits.startsWith("00")) digits = digits.slice(2);

  const cc = COUNTRY_TO_CC[defaultCountry.toUpperCase()] ?? "";

  // لو الرقم لا يبدأ بأي كود دولة معروف وطوله محلي (<= 11)، نضيف الافتراضي
  const knownCcs = Object.values(COUNTRY_TO_CC);
  const startsWithKnownCc = knownCcs.some((c) => digits.startsWith(c));

  if (!hasPlus && !startsWithKnownCc) {
    if (!cc) return { ok: false, reason: "لم يتم تحديد كود الدولة." };
    // لو الرقم بيبدأ بصفر (رقم محلي مصري 010…) نشيله قبل الإلصاق
    if (digits.startsWith("0")) digits = digits.replace(/^0+/, "");
    digits = cc + digits;
  }

  if (digits.length < 7 || digits.length > 15) {
    return { ok: false, reason: "طول الرقم غير صحيح." };
  }

  return { ok: true, e164: digits };
}

/** رابط wa.me لرقم منسّق — مفيد لفتح محادثة يدوية من الواجهة. */
export function waMeLink(e164: string, prefill?: string): string {
  const base = `https://wa.me/${e164}`;
  return prefill ? `${base}?text=${encodeURIComponent(prefill)}` : base;
}
