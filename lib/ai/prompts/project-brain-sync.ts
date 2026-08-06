import { getQuestionsForProjectType } from "@/lib/discovery-form/questions";
import type { AggregatedProjectData } from "@/lib/brain/aggregation";

function formatDiscoverySection(data: AggregatedProjectData): string {
  // النظام الجديد (Smart Discovery): أزواج جاهزة من لقطة القالب الديناميكي.
  if (data.discoveryPairs.length > 0) {
    return data.discoveryPairs.map((p) => `- ${p.label}: ${p.value}`).join("\n");
  }

  // fallback للفورمات القديمة المعبّأة بالأسئلة الثابتة.
  const questions = getQuestionsForProjectType(data.projectType);
  const lines = questions
    .map((q) => {
      const value = data.discoveryAnswers[q.key];
      if (value === undefined || value === null || value === "") return null;
      return `- ${q.label}: ${String(value)}`;
    })
    .filter((line): line is string => line !== null);

  return lines.length > 0 ? lines.join("\n") : "(لا توجد إجابات مسجّلة)";
}

function formatMeetingsSection(data: AggregatedProjectData): string {
  if (data.meetings.length === 0) return "(لا توجد اجتماعات معالجة بعد)";
  return data.meetings
    .map((m) => {
      const label = `اجتماع بتاريخ ${new Date(m.date).toLocaleDateString("ar-EG")}${m.title ? ` — ${m.title}` : ""}`;
      const transcript = m.transcript ? m.transcript.slice(0, 4000) : "(بدون نص مفرّغ)";
      return `### ${label}\n${transcript}`;
    })
    .join("\n\n");
}

function formatBrainEntriesSection(data: AggregatedProjectData): string {
  if (data.brainEntries.length === 0) return "(لا توجد مدخلات مسجّلة)";
  return data.brainEntries
    .map((e) => `- [مصدر: ${e.sourceLabel}] (${e.entryType}) ${e.content}`)
    .join("\n");
}

/**
 * Prompt مستقل لمزامنة Project Brain — الملف الوحيد المسؤول عن تصميم
 * النص المرسل لـ AI، عشان يتعدّل لاحقًا من غير أي تعديل في Aggregation
 * Engine أو AIService.
 */
export function buildProjectBrainSyncPrompt(data: AggregatedProjectData, fusedContext = ""): string {
  return `أنت محلل منتجات محترف بتساعد فريق وكالة تطوير يفهم مشروع عميل بشكل شامل ومحدّث.

مهمتك: اقرأ كل البيانات المجمّعة تحت عن المشروع، ولخّصها في رؤية موحّدة ومنظمة. اعتمد فقط على المعلومات المذكورة تحت — لا تخترع أي معلومة غير موجودة.

## اسم المشروع ونوعه
${data.projectName} (${data.projectType})

## مصدر العميل الأولي (Lead)
المصدر: ${data.leadSource ?? "غير محدد"}
ملاحظات: ${data.leadNotes ?? "لا توجد"}

## إجابات نموذج الاكتشاف
${formatDiscoverySection(data)}

## الاجتماعات المعالجة (نصوصها المفرّغة)
${formatMeetingsSection(data)}

## مدخلات Project Brain المسجّلة سابقًا (قرارات، مخاطر، طلبات، أسئلة، ملاحظات)
${formatBrainEntriesSection(data)}
${fusedContext ? `\n${fusedContext}\n` : ""}
## المطلوب منك بالضبط
أرجع **JSON فقط** بالشكل التالي بالضبط، بدون أي نص إضافي قبله أو بعده، وبدون Markdown code fences، وبدون أي مفاتيح غير المذكورة:

{
  "summary": "ملخص شامل من 3-5 جمل لحالة المشروع الحالية وفهمه العام",
  "key_facts": ["حقيقة أساسية ثابتة عن المشروع أو العميل"],
  "pain_points": ["مشكلة أو ألم حقيقي يعاني منه العميل بناءً على البيانات"],
  "decisions_log": [{ "content": "قرار تم اتخاذه فعليًا", "source": "نفس تسمية المصدر الظاهرة أعلاه، مثلاً اجتماع بتاريخ ... أو نموذج الاكتشاف" }],
  "open_questions": [{ "question": "سؤال مفتوح لسه محتاج إجابة", "answered": false }]
}

قواعد صارمة:
- أرجع الكائن JSON فقط، من غير أي شرح أو مقدمة أو خاتمة.
- لكل عنصر في decisions_log، استخدم تسمية المصدر بالظبط زي ما ظهرت في البيانات فوق (مثلاً "اجتماع بتاريخ ...")، ولو القرار مستنتج من نموذج الاكتشاف اكتب "نموذج الاكتشاف".
- open_questions.answered لازم يكون false دايمًا (الأسئلة المتجاوب عليها بتتحدد يدويًا في الواجهة بعدين، مش من هنا).
- لو مفيش عناصر لفئة معينة، أرجع مصفوفة فاضية [] لها.
- كل النصوص بالعربية.`;
}
