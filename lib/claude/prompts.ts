import type { RepoFile } from "@/lib/github/repo-reader";

const SYSTEM_PROMPT = `أنت مهندس برمجيات منفّذ (Code Executor) — مسؤوليتك الوحيدة تنفيذ مهمة برمجية محدّدة بدقة، مش تحليل متطلبات أو اتخاذ قرارات منتج. ممنوع تكتب PRD أو تحلّل المشروع أو تقترح نطاق — ده شغل نموذج تاني مسؤول عنه بالفعل.

قواعد صارمة:
- أرجع كائن JSON فقط، بدون أي شرح أو مقدمة أو Markdown code fences.
- كل ملف بتغيّره لازم يكون محتواه الكامل النهائي (مش Diff/Patch جزئي) في حقل content.
- التزم بأسلوب الكود الموجود فعليًا في الملفات المرفقة (Naming, Formatting, Imports) — الهدف اتساق مع المشروع مش إعادة كتابة بأسلوبك.
- ممنوع تلمس ملفات برّه نطاق المهمة المطلوبة.
- لو المهمة غامضة أو ناقصة معلومة أساسية، نفّذ أفضل تفسير معقول ووضّح الافتراض في summary — ممنوع ترجع فاضي.`;

/**
 * Prompt تنفيذ مهمة واحدة — Claude بياخد المهمة + محتوى الملفات ذات
 * الصلة (لو موجودة، من قراءة Repository حقيقية) ويرجّع التغييرات
 * المطلوبة بشكل بنيوي (JSON) عشان نطبّقها عبر GitHub Contents API —
 * مفيش Git Clone أو تنفيذ محلي، الكود بيتكتب مباشرة عبر GitHub API.
 */
export function buildTaskExecutionPrompt(
  taskTitle: string,
  taskDescription: string,
  existingFiles: RepoFile[]
): { system: string; prompt: string } {
  const filesBlock =
    existingFiles.length > 0
      ? existingFiles.map((f) => `### ${f.path}\n\`\`\`\n${f.content}\n\`\`\``).join("\n\n")
      : "(مفيش ملفات موجودة بالفعل ذات صلة — المهمة دي غالبًا إنشاء ملفات جديدة)";

  return {
    system: SYSTEM_PROMPT,
    prompt: `# المهمة: ${taskTitle}

${taskDescription}

# الملفات الحالية ذات الصلة
${filesBlock}

## صيغة الرد (JSON فقط)
{
  "summary": "ملخص قصير لما اتعمل",
  "files": [
    { "path": "مسار/الملف.ts", "action": "create|update|delete", "content": "المحتوى الكامل النهائي للملف (احذف الحقل لو action=delete)" }
  ]
}`,
  };
}
