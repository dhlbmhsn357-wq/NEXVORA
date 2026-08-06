import { getQuestionsForProjectType } from "@/lib/discovery-form/questions";
import type { ProjectType, BrainEntryType } from "@/lib/types/database";

const brainEntryTypeLabels: Record<BrainEntryType, string> = {
  note: "ملاحظة",
  decision: "قرار",
  link: "رابط",
  risk: "مخاطرة",
  question: "سؤال مفتوح",
  request: "طلب",
  deadline: "موعد نهائي",
};

export interface ProjectAnalysisPromptInput {
  projectType: ProjectType;
  discoveryAnswers: Record<string, unknown>;
  /**
   * أزواج (label: value) من لقطة القالب الديناميكي (Smart Discovery).
   * لو موجودة تُستخدم مباشرة؛ غير كده fallback على الأسئلة الثابتة.
   */
  discoveryPairs?: Array<{ label: string; value: string }>;
  brainEntries: Array<{ entry_type: BrainEntryType; content: string }>;
}

function formatDiscoveryAnswers(
  projectType: ProjectType,
  answers: Record<string, unknown>,
  pairs?: Array<{ label: string; value: string }>
): string {
  if (pairs && pairs.length > 0) {
    return pairs.map((p) => `- ${p.label}: ${p.value}`).join("\n");
  }

  const questions = getQuestionsForProjectType(projectType);
  const lines: string[] = [];

  for (const q of questions) {
    const value = answers[q.key];
    if (value === undefined || value === null || value === "") continue;
    lines.push(`- ${q.label}: ${String(value)}`);
  }

  return lines.length > 0 ? lines.join("\n") : "(لا توجد إجابات مسجّلة بعد)";
}

function formatBrainEntries(
  entries: Array<{ entry_type: BrainEntryType; content: string }>
): string {
  if (entries.length === 0) return "(لا توجد مدخلات في Project Brain بعد)";
  return entries
    .map((e) => `- [${brainEntryTypeLabels[e.entry_type]}] ${e.content}`)
    .join("\n");
}

/**
 * Prompt مستقل لتحليل مشروع (task_type = PROJECT_ANALYSIS) — الملف ده هو
 * المكان الوحيد اللي بيتصمم فيه الـ Prompt، عشان يتعدّل لاحقًا من غير
 * ما نلمس أي منطق برمجي في الـ Agent أو الواجهة.
 */
export function buildProjectAnalysisPrompt(input: ProjectAnalysisPromptInput): string {
  const discoverySection = formatDiscoveryAnswers(
    input.projectType,
    input.discoveryAnswers,
    input.discoveryPairs
  );
  const brainSection = formatBrainEntries(input.brainEntries);

  return `أنت محلل منتجات محترف (Product Analyst) بتساعد مدير منتج (Product Manager) يستعد لاجتماع مع عميل.

مهمتك: تحليل بيانات المشروع التالية فقط، واستخراج فهم عملي منها. لا تخترع معلومات غير موجودة في البيانات، ولا تفترض أي شيء خارج المُعطى.

## إجابات نموذج الاكتشاف
${discoverySection}

## مدخلات Project Brain (ملاحظات وقرارات ومخاطر وأسئلة مسجّلة سابقًا)
${brainSection}

## المطلوب منك بالضبط
حلّل البيانات أعلاه وأرجع **JSON فقط** بالشكل التالي بالضبط، بدون أي نص إضافي قبله أو بعده، وبدون Markdown code fences، وبدون أي مفاتيح غير المذكورة:

{
  "root_problem": "جملة أو جملتين تصف المشكلة الجذرية الحقيقية للعميل بناءً على البيانات",
  "target_users": ["فئة مستخدم مستهدف 1", "فئة مستخدم مستهدف 2"],
  "opportunities": ["فرصة عملية 1", "فرصة عملية 2"],
  "risks": ["مخاطرة محتملة 1", "مخاطرة محتملة 2"],
  "meeting_questions": ["سؤال محدد يجب طرحه على العميل في الاجتماع القادم", "سؤال آخر"]
}

قواعد صارمة:
- أرجع الكائن JSON فقط، من غير أي شرح أو مقدمة أو خاتمة.
- كل قيمة نصية يجب أن تكون بالعربية، مختصرة، وعملية (مش عمومية أو نظرية).
- "meeting_questions" هي أهم جزء — لازم تكون أسئلة محددة وقابلة للطرح فعليًا في اجتماع، مش أسئلة عامة.
- لو البيانات المتاحة غير كافية لاستنتاج نقطة معينة بثقة، اذكر ده كملاحظة داخل القيمة نفسها بدل ما تسيبها فاضية أو تخترع محتوى.`;
}
