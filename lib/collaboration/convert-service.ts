import { createServiceClient } from "@/lib/supabase/service";
import { buildManualNoteCandidate, type ManualNoteType } from "@/lib/brain-v2/manual-notes";
import { proposeChanges } from "@/lib/brain-v2/pending-changes-service";
import { createSupportRequest } from "@/lib/support/request-service";
import { createTaskFromSource } from "@/lib/work/source-service";
import { toPlainPreview } from "./safe-markdown";
import { recordAuthEvent } from "@/lib/auth/audit";

/**
 * تحويل رسالة محادثة إلى معرفة مؤسسية بضغطة واحدة — الجوهر المعماري
 * للمرحلة: المحادثة جزء من Knowledge Graph مش دردشة عابرة.
 *
 * القرار/المخاطرة/المتطلب/... بتمرّ عبر مسار Pending Changes نفسه بتاع
 * الملاحظات اليدوية (proposeChanges) فبتتراجع قبل ما تدخل Brain رسميًا.
 * الدعم بيمرّ عبر createSupportRequest.
 *
 * قائمة الأنواع (CONVERTIBLE_NOTE_TYPES) في note-types.ts — وحدة نقية
 * عشان الكلاينت يستوردها من غير ما يسحب كود السيرفر ده.
 */

export interface ConvertResult {
  ok: boolean;
  message?: string;
  /** true لو المشروع لسه ماعندوش Brain معتمد (التحويل بيتجاهل بهدوء). */
  skippedNoBrain?: boolean;
}

/** يحوّل نص رسالة إلى Pending Change في Project Brain حسب النوع. */
export async function convertMessageToBrain(params: {
  projectId: string;
  messageId: string;
  body: string;
  noteType: ManualNoteType;
  actorId: string;
}): Promise<ConvertResult> {
  const candidate = buildManualNoteCandidate(params.noteType, params.body);
  const result = await proposeChanges(
    params.projectId,
    "manual_note",
    `collaboration:${params.messageId}`,
    `تحويل رسالة محادثة إلى ${params.noteType}`,
    [candidate]
  );

  await recordAuthEvent({
    actorId: params.actorId,
    targetUserId: null,
    action: "message_converted",
    details: { message_id: params.messageId, target: `brain:${params.noteType}`, project_id: params.projectId },
  });

  if (result.skippedNoBrain) {
    return { ok: false, skippedNoBrain: true, message: "المشروع لسه ماعندوش Project Brain معتمد — التحويل هيشتغل بعد اعتماد Brain." };
  }
  if (result.proposedCount === 0) {
    return { ok: false, message: "المعلومة دي موجودة بالفعل في Brain (مكرّرة)." };
  }
  return { ok: true, message: `تمت الإضافة كـ Pending Change في Brain — راجعها من تبويب Brain Review.` };
}

/** يحوّل رسالة إلى مهمة في محرّك التنفيذ (Work Management). */
export async function convertMessageToTask(params: {
  projectId: string;
  messageId: string;
  body: string;
  actorId: string;
}): Promise<ConvertResult> {
  const r = await createTaskFromSource({
    projectId: params.projectId,
    title: toPlainPreview(params.body, 100),
    description: params.body,
    sourceType: "chat",
    sourceReference: params.messageId,
    createdBy: params.actorId,
  });
  await recordAuthEvent({
    actorId: params.actorId,
    targetUserId: null,
    action: "message_converted",
    details: { message_id: params.messageId, target: "task", project_id: params.projectId },
  });
  if (!r.ok) return { ok: false, message: r.message };
  return { ok: true, message: r.duplicate ? "المهمة دي متعملة قبل كده من نفس الرسالة." : "تم إنشاء مهمة من الرسالة — شوفها في تبويب المهام." };
}

/** يحوّل رسالة إلى تذكرة دعم مرتبطة بالمشروع. */
export async function convertMessageToSupport(params: {
  projectId: string;
  messageId: string;
  body: string;
  actorId: string;
}): Promise<ConvertResult> {
  const supabase = createServiceClient();
  try {
    const nowIso = new Date().toISOString();
    await createSupportRequest(supabase, {
      projectId: params.projectId,
      transcript: [{ role: "customer", content: params.body, created_at: nowIso }],
      requestType: "unclear",
      structuredSummary: {
        problem_description: params.body,
        started_when: null,
        reproduction_steps: null,
        current_result: null,
        expected_result: null,
        priority: "medium",
        attachments: [],
      },
      resolutionStatus: "escalated",
      relatedPrdSection: null,
      relatedBrainFact: null,
      customerIdentifier: `collaboration:${params.messageId}`,
    });
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "فشل إنشاء تذكرة الدعم." };
  }

  await recordAuthEvent({
    actorId: params.actorId,
    targetUserId: null,
    action: "message_converted",
    details: { message_id: params.messageId, target: "support", project_id: params.projectId },
  });
  return { ok: true, message: "تم إنشاء تذكرة دعم من الرسالة." };
}
