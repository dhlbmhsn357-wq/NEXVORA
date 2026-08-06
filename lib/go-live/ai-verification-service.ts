import { AIService } from "@/lib/ai/service";
import { AITaskType } from "@/lib/ai/types";
import { buildGoLiveVerificationPrompt } from "@/lib/ai/prompts/golive-verification";
import { validateGoLiveVerification, type GoLiveVerificationData } from "@/lib/ai/validation/golive-verification";

/**
 * الطبقة الاستشارية بالذكاء الاصطناعي — تقارن سلوك الأعمال قبل/بعد وتكشف
 * المشاكل الخفية، **مستندة لتقرير التحقّق الحتمي فقط**. لا تلغي الحكم
 * (Final Score + Certificate gate). best-effort.
 */

interface Report {
  dataVerification: { matchedCount: number; totalEntities: number; fullyMatched: boolean; checks: Array<{ label: string; difference: number; matched: boolean }> };
  business: Array<{ title: string; state: string }>;
  health: { score: number; passed: boolean };
  kpi: { checks: Array<{ label: string; verdict: string; variancePercent: number }>; degraded: number };
}

function digest(r: Report): string {
  const diffs = r.dataVerification.checks.filter((c) => !c.matched).map((c) => `- ${c.label}: فرق ${c.difference}`).join("\n") || "لا فروق.";
  const biz = r.business.map((b) => `- ${b.title}: ${b.state}`).join("\n");
  const kpi = r.kpi.checks.map((k) => `- ${k.label}: ${k.verdict} (${k.variancePercent}%)`).join("\n") || "لا KPIs.";
  return [
    `تطابق البيانات: ${r.dataVerification.matchedCount}/${r.dataVerification.totalEntities} (${r.dataVerification.fullyMatched ? "تامّ" : "به فروق"}).`,
    `الصحة: ${r.health.score}/100 (${r.health.passed ? "ناجح" : "فاشل"}).`,
    `\nفروق البيانات:\n${diffs}`,
    `\nالتحقّق التجاري:\n${biz}`,
    `\nKPIs (متدهور: ${r.kpi.degraded}):\n${kpi}`,
  ].join("\n");
}

export async function enrichVerificationWithAi(report: Report, domain: string, actorId: string | null): Promise<GoLiveVerificationData | null> {
  try {
    const prompt = buildGoLiveVerificationPrompt(digest(report), domain);
    const resp = await AIService.execute(AITaskType.MIGRATION_GOLIVE_VERIFICATION, prompt, { actorId: actorId ?? undefined });
    if (!resp.success) return null;
    const v = validateGoLiveVerification(resp.output);
    return v.ok ? v.data : null;
  } catch {
    return null;
  }
}
