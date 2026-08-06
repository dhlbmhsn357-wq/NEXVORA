import { AIService } from "@/lib/ai/service";
import { AITaskType } from "@/lib/ai/types";

export type ImprovePromptResult =
  | { ok: true; improved: string }
  | { ok: false; message: string };

/**
 * "Improve Prompt" حي — يحسّن تنظيم ووضوح البرومبت عبر AI Provider Layer
 * مع **قفل الـ Scope الصارم**: ممنوع اختراع Features، ممنوع حذف
 * Requirements، ممنوع تغيير المعنى. تحسين الصياغة والبنية فقط. بيرجّع
 * النص المحسّن كما هو (مش JSON) عشان يتخزّن كإصدار جديد.
 */
export async function improvePrompt(
  promptText: string,
  options: { profileLabel: string; actorId?: string | null }
): Promise<ImprovePromptResult> {
  if (!promptText.trim()) return { ok: false, message: "البرومبت فارغ." };

  const instruction = `أنت خبير Prompt Engineering داخل VELORA. مهمتك تحسين البرومبت التالي (نوعه: ${options.profileLabel}) **فقط** من ناحية التنظيم والوضوح والبنية.

## قواعد صارمة (أي مخالفة = نتيجة مرفوضة)
- ممنوع اختراع أي متطلب أو Feature أو قسم غير موجود في الأصل.
- ممنوع حذف أي متطلب أو تعليمة موجودة.
- ممنوع تغيير المعنى أو النطاق (Scope) — نفس المهمة بالظبط.
- حسّن فقط: الترتيب المنطقي، الوضوح، إزالة الغموض، توحيد الصياغة، تقوية بنية التعليمات.
- حافظ على أي Schema أو JSON مطلوب كما هو حرفيًا.
- أرجع **نص البرومبت المحسّن فقط** — بدون شرح، بدون تعليق، بدون علامات اقتباس حول النص.

## البرومبت الأصلي
${promptText}

أرجع الآن البرومبت المحسّن كاملًا:`;

  const response = await AIService.execute(AITaskType.PROMPT_REFINEMENT, instruction, {
    actorId: options.actorId ?? undefined,
  });

  if (!response.success || !response.output) {
    return { ok: false, message: response.error?.message ?? "فشل تحسين البرومبت." };
  }

  let improved = response.output.trim();
  // إزالة أي code fences لو النموذج غلّف بها بالخطأ
  if (improved.startsWith("```")) {
    improved = improved.replace(/^```(?:\w+)?\s*/i, "").replace(/```\s*$/i, "").trim();
  }
  if (improved.length < 20) return { ok: false, message: "الناتج المحسّن قصير جدًا — تجاهلناه حفاظًا على الأصل." };

  return { ok: true, improved };
}
