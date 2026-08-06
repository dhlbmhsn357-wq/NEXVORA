import { createCipheriv, createDecipheriv, randomBytes, createHash, timingSafeEqual } from "crypto";

/**
 * تشفير الأسرار الحسّاسة (Connection Strings، كلمات المرور، API Tokens)
 * — **AES-256-GCM** (سرّية + سلامة مُصادَق عليها).
 *
 * ## الفلسفة الأمنية
 *
 * منصّة الترحيل قد تجمع بيانات اعتماد أنظمة العملاء. القاعدة:
 * - **لا يُخزَّن سرّ نصًّا صريحًا أبدًا.** يُشفَّر قبل أي كتابة في DB.
 * - المفتاح من متغيّر بيئة `MIGRATION_SECRET_KEY` فقط — لا في الكود ولا DB.
 * - الناتج مُوسَّم `v1:` ليسمح بتدوير الخوارزمية/المفتاح لاحقًا.
 * - `maskSecret` لأي عرض في الواجهة؛ السرّ الكامل لا يُعاد للعميل ولا يُسجَّل.
 *
 * لو المفتاح غير مضبوط، `encryptSecret` **يفشل صراحةً** بدل التخزين غير
 * الآمن — الفشل الآمن مقصود.
 */

const VERSION = "v1";
const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12; // موصى به لـ GCM
const KEY_BYTES = 32; // AES-256
const ENV_KEY = "MIGRATION_SECRET_KEY";

export class SecretCryptoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SecretCryptoError";
  }
}

/**
 * يشتقّ مفتاح 32-بايت من متغيّر البيئة. يقبل صيغتين:
 * - hex/base64 بطول 32 بايت مباشرة (الأفضل).
 * - أي عبارة سرّية → تُشتَقّ عبر SHA-256 (يضمن 32 بايت دائمًا).
 */
function resolveKey(): Buffer {
  const raw = process.env[ENV_KEY];
  if (!raw || raw.trim().length === 0) {
    throw new SecretCryptoError(
      `${ENV_KEY} غير مضبوط — لا يمكن تشفير/فكّ أي سرّ. اضبط مفتاحًا سرّيًا قويًا في البيئة قبل تسجيل مصادر حيّة.`
    );
  }
  const trimmed = raw.trim();

  // جرّب hex/base64 بطول 32 بايت مباشرة.
  for (const enc of ["hex", "base64"] as const) {
    try {
      const buf = Buffer.from(trimmed, enc);
      if (buf.length === KEY_BYTES) return buf;
    } catch {
      /* جرّب التالي */
    }
  }

  // fallback: اشتقاق حتمي 32 بايت من أي عبارة.
  return createHash("sha256").update(trimmed, "utf8").digest();
}

/** هل التشفير مُهيَّأ (المفتاح موجود)؟ — للتحقّق قبل السماح بمصادر حيّة. */
export function isSecretCryptoConfigured(): boolean {
  const raw = process.env[ENV_KEY];
  return typeof raw === "string" && raw.trim().length > 0;
}

/**
 * يشفّر نصًّا سرّيًا → سلسلة مُوسَّمة `v1:ivB64:tagB64:cipherB64`.
 * كل استدعاء يولّد IV جديدًا (نفس النصّ يعطي ناتجًا مختلفًا).
 */
export function encryptSecret(plaintext: string): string {
  if (typeof plaintext !== "string" || plaintext.length === 0) {
    throw new SecretCryptoError("لا يمكن تشفير قيمة فارغة.");
  }
  const key = resolveKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64"), tag.toString("base64"), encrypted.toString("base64")].join(":");
}

/**
 * يفكّ سلسلة مشفَّرة أنتجها `encryptSecret`. يفشل صراحةً لو تلاعُب في
 * البيانات (فشل مصادقة GCM) أو صيغة غير معروفة.
 */
export function decryptSecret(payload: string): string {
  if (typeof payload !== "string" || !payload.startsWith(`${VERSION}:`)) {
    throw new SecretCryptoError("صيغة سرّ غير معروفة أو غير مدعومة.");
  }
  const parts = payload.split(":");
  if (parts.length !== 4) throw new SecretCryptoError("سرّ تالف — عدد الأجزاء غير صحيح.");
  const [, ivB64, tagB64, cipherB64] = parts;

  const key = resolveKey();
  try {
    const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivB64, "base64"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    const decrypted = Buffer.concat([decipher.update(Buffer.from(cipherB64, "base64")), decipher.final()]);
    return decrypted.toString("utf8");
  } catch {
    throw new SecretCryptoError("فشل فكّ السرّ — قد يكون المفتاح تغيّر أو البيانات تعرّضت للتلاعب.");
  }
}

/**
 * يُخفي سرًّا للعرض الآمن في الواجهة: يبقي آخر 2-4 محارف فقط.
 * `"supersecretpassword"` → `"••••••••word"`. للقيم القصيرة جدًا: كلّها نقاط.
 */
export function maskSecret(value: string | null | undefined, visibleTail = 4): string {
  if (!value) return "";
  if (value.length <= visibleTail + 2) return "•".repeat(Math.max(6, value.length));
  return "•".repeat(8) + value.slice(-visibleTail);
}

/** مقارنة زمن-ثابت لسرّين نصّيين (يتجنّب تسريب التوقيت). */
export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}
