import { randomBytes } from "crypto";
import type { DiscoveryFormLink, DiscoveryLinkStatus } from "@/lib/types/database";

/**
 * أبجدية قصيرة بلا أحرف ملتبسة (بدون 0/O/1/I/l) — روابط احترافية قصيرة
 * وسهلة القراءة والنطق.
 */
const SHORT_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz";
export const SHORT_TOKEN_LENGTH = 12;

/**
 * توليد رمز رابط قصير آمن (NanoID-style) — 12 حرفًا من أبجدية 54 رمزًا
 * (~69 بت عشوائية) عبر crypto.randomBytes مع رفض الانحياز (rejection
 * sampling). قصير، فريد عمليًا، وغير قابل للتخمين، ولا يكشف أي id/UUID.
 * الروابط القديمة (64-hex) تفضل شغّالة لأن الحلّ بيقارن عمود token نفسه.
 */
export function generateDiscoveryToken(length = SHORT_TOKEN_LENGTH): string {
  const chars: string[] = [];
  const max = 256 - (256 % SHORT_ALPHABET.length); // حدّ لتفادي الانحياز
  while (chars.length < length) {
    for (const byte of randomBytes(length * 2)) {
      if (byte < max) {
        chars.push(SHORT_ALPHABET[byte % SHORT_ALPHABET.length]);
        if (chars.length === length) break;
      }
    }
  }
  return chars.join("");
}

/** خيارات مدة انتهاء الرابط المعروضة في الداشبورد. */
export const EXPIRATION_OPTIONS: { value: string; label: string; days: number | null }[] = [
  { value: "1h", label: "ساعة واحدة", days: 1 / 24 },
  { value: "6h", label: "6 ساعات", days: 6 / 24 },
  { value: "12h", label: "12 ساعة", days: 12 / 24 },
  { value: "24h", label: "24 ساعة", days: 1 },
  { value: "3", label: "3 أيام", days: 3 },
  { value: "7", label: "7 أيام", days: 7 },
  { value: "14", label: "14 يوم", days: 14 },
  { value: "30", label: "30 يوم", days: 30 },
  { value: "60", label: "60 يوم", days: 60 },
  { value: "90", label: "90 يوم", days: 90 },
  { value: "never", label: "بلا انتهاء", days: null },
];

/** بادئة القيمة المستخدمة لمدة مخصصة بالساعات — شوف parseCustomExpirationHours. */
export const CUSTOM_EXPIRATION_PREFIX = "custom:";

/** يبني قيمة "مخصص" جاهزة للتخزين في EXPIRATION_OPTIONS.value. */
export function buildCustomExpirationValue(hours: number): string {
  return `${CUSTOM_EXPIRATION_PREFIX}${hours}`;
}

/** يستخرج عدد الساعات من قيمة مخصصة، أو null لو مش بالصيغة دي. */
export function parseCustomExpirationHours(value: string): number | null {
  if (!value.startsWith(CUSTOM_EXPIRATION_PREFIX)) return null;
  const hours = Number(value.slice(CUSTOM_EXPIRATION_PREFIX.length));
  return Number.isFinite(hours) && hours > 0 ? hours : null;
}

/** يحسب تاريخ الانتهاء (ISO) من عدد أيام، أو null للأبد. */
export function computeExpiresAt(days: number | null, nowMs: number): string | null {
  if (days === null) return null;
  return new Date(nowMs + days * 24 * 60 * 60 * 1000).toISOString();
}

export type LinkAccessState = "ok" | "submitted" | "expired" | "cancelled";

/**
 * الحالة الفعلية للرابط وقت الوصول — تأخذ الانتهاء الزمني في الحسبان
 * حتى لو عمود status لسه ما اتحدّثش.
 */
export function evaluateLinkState(
  link: Pick<DiscoveryFormLink, "status" | "expires_at">,
  nowMs: number
): LinkAccessState {
  if (link.status === "submitted") return "submitted";
  if (link.status === "cancelled") return "cancelled";
  if (link.status === "expired") return "expired";
  if (link.expires_at && new Date(link.expires_at).getTime() < nowMs) return "expired";
  return "ok";
}

/** التسميات العربية لحالات الرابط (للعرض في الداشبورد). */
export const LINK_STATUS_LABELS: Record<DiscoveryLinkStatus, string> = {
  pending: "بانتظار الفتح",
  opened: "تم الفتح",
  in_progress: "قيد التعبئة",
  submitted: "تم الإرسال",
  expired: "منتهي",
  cancelled: "ملغى",
};
