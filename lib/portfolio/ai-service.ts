import { AIService } from "@/lib/ai/service";
import { AITaskType } from "@/lib/ai/types";

/**
 * ذكاء التسليم عبر AI Provider Layer فقط: تنبؤ مخاطر التأخير + أدوار
 * ناقصة + ملخص تنفيذي أسبوعي، من إشارات المشروع الحقيقية.
 */

export interface DeliveryIntelligenceInput {
  projectName: string;
  healthScore: number;
  overallProgress: number;
  blockedTasks: number;
  overdueTasks: number;
  delayedMilestones: number;
  teamRoles: string[];
  upcomingMilestones: { title: string; planned_date: string | null; progress: number }[];
}

export interface DeliveryIntelligenceResult {
  delivery_risk: "low" | "medium" | "high";
  completion_probability: number;
  predicted_delays: string[];
  missing_roles: string[];
  recommendations: string[];
  executive_summary: string;
}

function buildPrompt(input: DeliveryIntelligenceInput): string {
  return `أنت مدير محفظة مشاريع (Portfolio Manager) خبير. حلّل حالة المشروع وتنبّأ بمخاطر التسليم.

المشروع: ${input.projectName}
درجة الصحة: ${input.healthScore}/100 | التقدّم: ${input.overallProgress}%
مهام محجوبة: ${input.blockedTasks} | متأخرة: ${input.overdueTasks} | مراحل متأخرة: ${input.delayedMilestones}
أدوار الفريق الحالية: ${input.teamRoles.join(", ") || "لا يوجد"}
مراحل قادمة: ${input.upcomingMilestones.map((m) => `${m.title} (${m.planned_date ?? "بدون موعد"}، ${m.progress}%)`).join(" | ") || "لا يوجد"}

أعد **JSON فقط** بالشكل ده:
{
  "delivery_risk": "low|medium|high",
  "completion_probability": <0-100>,
  "predicted_delays": ["توقّع تأخير محدّد"],
  "missing_roles": ["دور ناقص في الفريق"],
  "recommendations": ["توصية عملية لتحسين التسليم"],
  "executive_summary": "ملخص تنفيذي موجز (2-3 جمل)"
}
قواعد: استنتج من الأرقام المعطاة فقط، لا تخترع. اكتب بالعربي.`;
}

export async function analyzeDelivery(input: DeliveryIntelligenceInput, projectId: string, actorId?: string): Promise<{ ok: boolean; result?: DeliveryIntelligenceResult; message?: string }> {
  const response = await AIService.execute(AITaskType.DELIVERY_INTELLIGENCE, buildPrompt(input), { projectId, actorId });
  if (!response.success) return { ok: false, message: response.error?.message ?? "فشل التحليل." };
  try {
    const m = (response.output ?? "").match(/\{[\s\S]*\}/);
    if (!m) return { ok: false, message: "رد غير مفهوم." };
    const p = JSON.parse(m[0]) as Partial<DeliveryIntelligenceResult>;
    const arr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x) => typeof x === "string").map(String) : []);
    return {
      ok: true,
      result: {
        delivery_risk: (["low", "medium", "high"].includes(p.delivery_risk as string) ? p.delivery_risk : "medium") as DeliveryIntelligenceResult["delivery_risk"],
        completion_probability: typeof p.completion_probability === "number" ? Math.max(0, Math.min(100, p.completion_probability)) : 50,
        predicted_delays: arr(p.predicted_delays),
        missing_roles: arr(p.missing_roles),
        recommendations: arr(p.recommendations),
        executive_summary: typeof p.executive_summary === "string" ? p.executive_summary : "",
      },
    };
  } catch {
    return { ok: false, message: "تعذّر قراءة نتيجة التحليل." };
  }
}
