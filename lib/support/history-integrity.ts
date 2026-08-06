import { createHmac, timingSafeEqual } from "node:crypto";
import type { ConversationMessage } from "@/lib/types/database";

/**
 * حماية سلامة التاريخ في Widget Chat.
 *
 * المشكلة: الـ Widget بيبعت history خام من الذاكرة، فأي زائر يقدر
 * يبعت history مزوّر برسائل "assistant" مُلفّقة عشان يوهم النموذج
 * بسياق مختلف عن الحقيقي.
 *
 * الحل: كل رد من السيرفر بيوقّع الـ history بـ HMAC باستخدام سر
 * خادم. الـ Widget بيرجّع نفس الـ history + التوقيع مع الطلب التالي،
 * والسيرفر بيتأكد من التطابق قبل ما يعتمد أي رسالة "assistant"
 * كمصدر ثقة. لو التوقيع مش صالح، الـ history بيتعامل معاه كسياق
 * محتمل التلاعب: يُقبَل شكل الرسائل، لكن يتعامل معه على أنه
 * potentially-tampered وبيتضاف تحذير للـ AI في الـ prompt.
 */

function getSecret(): string {
  const secret = process.env.SUPPORT_HISTORY_SIGNING_SECRET;
  if (secret && secret.length >= 16) return secret;
  // لو مفيش secret مخصص، بنستخدم SUPABASE_SERVICE_ROLE_KEY كنسخة
  // احتياطية (موجود دائمًا في Vercel، غير مكشوف للعميل). أفضل من
  // انهيار الحماية بالكامل.
  const fallback = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (fallback) return fallback;
  return "pm-os-default-signing-secret-please-override";
}

function canonicalizeHistory(history: ConversationMessage[]): string {
  return JSON.stringify(
    history.map((m) => ({ role: m.role, content: m.content, attachmentPath: m.attachmentPath ?? null }))
  );
}

export function signHistory(history: ConversationMessage[]): string {
  const secret = getSecret();
  return createHmac("sha256", secret).update(canonicalizeHistory(history)).digest("hex");
}

export function verifyHistorySignature(history: ConversationMessage[], signature: unknown): boolean {
  if (typeof signature !== "string" || signature.length !== 64) return false;
  try {
    const expected = signHistory(history);
    const a = Buffer.from(expected, "hex");
    const b = Buffer.from(signature, "hex");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
