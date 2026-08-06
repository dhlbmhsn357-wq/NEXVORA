import { AIService } from "@/lib/ai/service";
import { AITaskType } from "@/lib/ai/types";
import type { TaskAiEstimate } from "@/lib/types/database";

/**
 * مساعد AI للمهام عبر AI Provider Layer فقط (ممنوع نداء المزوّد مباشرة):
 * اقتراح Subtasks + تقدير التعقيد/الجهد/المخاطر.
 */

export interface TaskAiResult {
  estimate: TaskAiEstimate | null;
  subtasks: string[];
}

function buildPrompt(title: string, description: string): string {
  return `أنت مدير هندسة خبير. حلّل المهمة دي وقدّر جهدها واقترح تقسيمها لمهام فرعية.

عنوان المهمة: ${title}
الوصف: ${description || "(لا يوجد)"}

أعد **JSON فقط** بالشكل ده بالظبط:
{
  "estimate": { "complexity": "low|medium|high", "effort_hours": <رقم>, "risk": "low|medium|high", "rationale": "سبب مختصر بالعربي" },
  "subtasks": ["مهمة فرعية 1", "مهمة فرعية 2"]
}
قواعد: 2 إلى 6 مهام فرعية عملية. effort_hours رقم واقعي. لا تخترع تفاصيل غير موجودة. اكتب بالعربي.`;
}

export async function analyzeTask(title: string, description: string, actorId?: string, projectId?: string | null): Promise<{ ok: boolean; result?: TaskAiResult; message?: string }> {
  const response = await AIService.execute(AITaskType.TASK_ORCHESTRATION, buildPrompt(title, description), { actorId, projectId: projectId ?? undefined });
  if (!response.success) return { ok: false, message: response.error?.message ?? "فشل التحليل." };

  try {
    const match = (response.output ?? "").match(/\{[\s\S]*\}/);
    if (!match) return { ok: false, message: "رد غير مفهوم." };
    const parsed = JSON.parse(match[0]) as { estimate?: Partial<TaskAiEstimate>; subtasks?: unknown };
    const est = parsed.estimate;
    const estimate: TaskAiEstimate | null = est && typeof est.effort_hours === "number"
      ? {
          complexity: (["low", "medium", "high"].includes(est.complexity as string) ? est.complexity : "medium") as TaskAiEstimate["complexity"],
          effort_hours: est.effort_hours,
          risk: (["low", "medium", "high"].includes(est.risk as string) ? est.risk : "medium") as TaskAiEstimate["risk"],
          rationale: typeof est.rationale === "string" ? est.rationale : "",
        }
      : null;
    const subtasks = Array.isArray(parsed.subtasks) ? parsed.subtasks.filter((s) => typeof s === "string" && s.trim()).map(String) : [];
    return { ok: true, result: { estimate, subtasks } };
  } catch {
    return { ok: false, message: "تعذّر قراءة نتيجة التحليل." };
  }
}
