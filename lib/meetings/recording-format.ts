/**
 * منطق نقي لتسجيل الاجتماع داخل المنصة — اختيار صيغة التسجيل، ضبط
 * جودة الصوت، وحراسة الحجم. منفصل عن أي API متصفح عشان يكون قابلًا
 * للاختبار بالكامل.
 */

/**
 * ترتيب الصيغ المفضّلة للتسجيل. Opus بجودة منخفضة كفاية للكلام بيخلّي
 * ساعة اجتماع ≈ 11 ميجابايت — مهم جدًا لأن التفريغ بيبعت الملف inline
 * وله سقف حجم (شوف MAX_INLINE_AUDIO_BYTES).
 *
 * Chrome/Edge/Firefox → webm/opus · Safari → mp4 (AAC).
 */
export const PREFERRED_RECORDING_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/ogg;codecs=opus",
  "audio/webm",
  "audio/mp4",
] as const;

/** معدل بت منخفض مناسب للكلام — بيقلّل الحجم من غير ما يضر دقة التفريغ. */
export const RECORDING_AUDIO_BITS_PER_SECOND = 32_000;

/**
 * سقف حجم الملف اللي ينفع يتبعت للتفريغ في طلب واحد (inline). الحد
 * الفعلي للطلب حوالي 20MB، فبنسيب هامش أمان للـ prompt والترميز base64.
 */
export const MAX_INLINE_AUDIO_BYTES = 18 * 1024 * 1024;

/**
 * يختار أول صيغة مدعومة في المتصفح الحالي. `isSupported` بتتمرّر من
 * الواجهة (MediaRecorder.isTypeSupported) عشان الدالة تفضل نقية.
 * بيرجّع null لو مفيش أي صيغة مدعومة — الواجهة بتعرض رسالة واضحة.
 */
export function pickRecordingMimeType(isSupported: (mimeType: string) => boolean): string | null {
  for (const candidate of PREFERRED_RECORDING_MIME_TYPES) {
    if (isSupported(candidate)) return candidate;
  }
  return null;
}

/**
 * يشيل لاحقة الـ codecs من الـ MIME — Storage والـ AI بيتوقعوا نوعًا
 * أساسيًا نضيفًا ("audio/webm" مش "audio/webm;codecs=opus").
 */
export function baseMimeType(mimeType: string): string {
  return mimeType.split(";")[0].trim();
}

/** امتداد الملف المناسب للـ MIME — للتسمية في Storage فقط. */
export function recordingFileExtension(mimeType: string): string {
  const base = baseMimeType(mimeType);
  if (base === "audio/mp4") return "m4a";
  if (base === "audio/ogg") return "ogg";
  return "webm";
}

export type RecordingSizeVerdict =
  | { ok: true }
  | { ok: false; reason: string };

/**
 * حارس الحجم قبل ما نبدأ المعالجة — بيمنع فشلًا غامضًا في التفريغ
 * ويشرح للمستخدم الحل العملي (تقسيم الاجتماع أو الرفع عبر البوت).
 */
export function checkRecordingSize(bytes: number): RecordingSizeVerdict {
  if (bytes <= 0) return { ok: false, reason: "التسجيل فارغ — ما اتسجّلش أي صوت." };
  if (bytes > MAX_INLINE_AUDIO_BYTES) {
    const mb = Math.round(bytes / (1024 * 1024));
    const maxMb = Math.round(MAX_INLINE_AUDIO_BYTES / (1024 * 1024));
    return {
      ok: false,
      reason: `حجم التسجيل ${mb} ميجابايت وأقصى حجم للتفريغ التلقائي ${maxMb} ميجابايت. قسّم الاجتماع لجلستين أو ابعت الملف على بوت تليجرام.`,
    };
  }
  return { ok: true };
}

export interface MicErrorInfo {
  /** رسالة عربية تشرح السبب الحقيقي. */
  message: string;
  /**
   * هل إعادة المحاولة بالضغط مفيدة؟ false يعني المتصفح حافظ الرفض،
   * فلازم المستخدم يغيّره من إعدادات الموقع — إعادة الضغط هتترفض فورًا
   * من غير ما يظهر أي طلب إذن.
   */
  retryable: boolean;
}

/**
 * يترجم خطأ getUserMedia لسبب واضح. الفرق الجوهري: الرفض المحفوظ
 * (NotAllowedError بعد رفض سابق) مش بيتحل بالضغط تاني — لازم المستخدم
 * يفتح إعدادات الموقع. عرض "اضغط للسماح" في الحالة دي بيضلّل المستخدم.
 */
export function describeMicError(errorName: string | undefined, permissionDenied = false): MicErrorInfo {
  switch (errorName) {
    case "NotAllowedError":
    case "PermissionDeniedError":
      return permissionDenied
        ? {
            message:
              "المتصفح حافظ رفض الميكروفون لهذا الموقع. افتح القفل 🔒 جنب رابط الموقع → الميكروفون → اسمح، وبعدها حدّث الصفحة.",
            retryable: false,
          }
        : { message: "لازم تسمح بالميكروفون عشان التسجيل يشتغل.", retryable: true };
    case "NotFoundError":
    case "DevicesNotFoundError":
      return { message: "مفيش ميكروفون متصل بالجهاز.", retryable: true };
    case "NotReadableError":
    case "TrackStartError":
      return { message: "الميكروفون مشغول ببرنامج تاني (Zoom/Teams مثلًا) — اقفله وحاول تاني.", retryable: true };
    case "SecurityError":
      return { message: "التسجيل بيحتاج اتصالًا آمنًا (HTTPS).", retryable: false };
    default:
      return { message: "تعذّر تشغيل الميكروفون.", retryable: true };
  }
}

/** صياغة مدة التسجيل (مللي ثانية) بشكل HH:MM:SS. */
export function formatRecordingDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}
