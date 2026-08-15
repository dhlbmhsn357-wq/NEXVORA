/**
 * Guards انتقال حالة الجهة المستهدفة — Pure function، بدون I/O.
 * =================================================================
 * يُستدعى من service.ts قبل أي تحديث لعمود status على prospects.
 */
import type { ProspectStatus } from "./types";

const CONTACTED_SOURCE_STATUSES: ProspectStatus[] = ["new", "needs_verification", "ready_to_contact"];

export interface StatusTransitionInput {
  currentStatus: ProspectStatus;
  targetStatus: ProspectStatus;
  /** هل للجهة Lead مرتبط بالفعل (converted_lead_id ليس null)؟ */
  hasConvertedLeadId: boolean;
  /** true فقط لو جاي من confirmMessageSent (تأكيد صريح لإرسال الرسالة). */
  confirmedSent?: boolean;
  /** true فقط لو جاي من إجراء "إعادة فتح" صريح ومسجَّل. */
  explicitReopen?: boolean;
}

export interface StatusTransitionResult {
  ok: boolean;
  message?: string;
}

export function validateStatusTransition(input: StatusTransitionInput): StatusTransitionResult {
  const { currentStatus, targetStatus, hasConvertedLeadId, confirmedSent, explicitReopen } = input;

  // لا تحول إلى contacted لمجرد فتح واتساب — فقط عبر تأكيد صريح إرسال الرسالة،
  // ومن حالة مصدر منطقية (لا نعيد "تواصل" مع جهة ردّت بالفعل مثلًا).
  if (targetStatus === "contacted") {
    if (!confirmedSent) {
      return { ok: false, message: "لا يمكن التحول إلى «تم التواصل» إلا بعد تأكيد صريح بإرسال الرسالة." };
    }
    if (!CONTACTED_SOURCE_STATUSES.includes(currentStatus)) {
      return { ok: false, message: `لا يمكن التحول إلى «تم التواصل» من الحالة الحالية (${currentStatus}).` };
    }
  }

  // لا تحول إلى converted دون Lead مرتبط، ولا تحويل مزدوج (idempotent).
  if (targetStatus === "converted") {
    if (currentStatus === "converted") {
      return { ok: false, message: "الجهة محوَّلة بالفعل إلى Lead — لا يمكن تحويلها مرة أخرى." };
    }
    if (!hasConvertedLeadId) {
      return { ok: false, message: "لا يمكن التحول إلى «محوَّل» بدون Lead مرتبط." };
    }
  }

  // الخروج من not_fit/archived يحتاج إجراء "إعادة فتح" صريح ومسجَّل كنشاط جديد.
  if ((currentStatus === "not_fit" || currentStatus === "archived") && targetStatus !== currentStatus && !explicitReopen) {
    return { ok: false, message: "الجهة مؤرشفة أو غير مناسبة — تحتاج إجراء «إعادة فتح» صريح." };
  }

  return { ok: true };
}
