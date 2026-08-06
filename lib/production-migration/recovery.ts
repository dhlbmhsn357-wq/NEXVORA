/**
 * الاستعادة الحيّة من الأخطاء (Live Error Recovery) — **وحدة نقية بلا I/O**.
 *
 * إذا فشلت دفعة، لا تُوقَف العملية بالكامل. تُصنَّف الأخطاء المعروفة حتميًا
 * وتُقترَح استجابة: إعادة (Retry) للأخطاء العابرة، مراجعة (Review) لأخطاء
 * البيانات/القيود، أو إيقاف عند الأخطاء الحرجة. الأخطاء غير المعروفة تُحال
 * للطبقة الاستشارية بالذكاء الاصطناعي.
 */

import type { ErrorClass, RecoveryAction, RecoveryDecision } from "./execution-types";

const PATTERNS: Array<{ re: RegExp; cls: ErrorClass }> = [
  { re: /timeout|timed out|deadlock|lock wait|connection|econn|network|reset by peer|temporar/i, cls: "transient" },
  { re: /duplicate key|unique|foreign key|violates|constraint|not-null|not null/i, cls: "constraint" },
  { re: /out of memory|disk full|no space|quota|too many|rate limit/i, cls: "resource" },
  { re: /invalid|parse|malformed|encoding|type mismatch|cast/i, cls: "data" },
];

export function classifyError(message: string): ErrorClass {
  for (const p of PATTERNS) if (p.re.test(message)) return p.cls;
  return "unknown";
}

export function decideRecovery(message: string, retryCount: number, maxRetries: number): RecoveryDecision {
  const errorClass = classifyError(message);
  let action: RecoveryAction;
  let autoSafe = false;
  let reason: string;

  switch (errorClass) {
    case "transient":
      if (retryCount < maxRetries) {
        action = "retry";
        autoSafe = true;
        reason = `خطأ عابر (محاولة ${retryCount + 1}/${maxRetries}) — إعادة آمنة بتراجع أُسّي.`;
      } else {
        action = "review";
        reason = "استُنفدت المحاولات لخطأ عابر — يحتاج مراجعة المدير.";
      }
      break;
    case "resource":
      action = retryCount < maxRetries ? "retry" : "review";
      autoSafe = action === "retry";
      reason = "ضغط موارد — إعادة بعد تهدئة أو تقليل Chunk، ثم مراجعة إن تكرّر.";
      break;
    case "constraint":
      action = "review";
      reason = "انتهاك قيد/مرجع — قد يشير لعلاقة مكسورة؛ لا يُتخطّى تلقائيًا.";
      break;
    case "data":
      action = "review";
      reason = "بيانات غير صالحة في الدفعة — مراجعة قبل التخطّي أو الإصلاح.";
      break;
    default:
      action = "review";
      reason = "خطأ غير معروف — يُحال للطبقة الاستشارية بالذكاء الاصطناعي.";
      break;
  }

  return { errorClass, action, reason: reason.replace(/\s+/g, " ").trim(), autoSafe };
}
