import { AIService } from "@/lib/ai/service";
import { AITaskType } from "@/lib/ai/types";
import { buildHypercareAnalysisPrompt } from "@/lib/ai/prompts/hypercare-analysis";
import { validateHypercareAnalysis, type HypercareAnalysisData } from "@/lib/ai/validation/hypercare-analysis";
import type { HealthReport, Anomaly } from "./hypercare-types";

/**
 * الطبقة الاستشارية بالذكاء الاصطناعي — تحليل جذر السبب الحقيقي والتوصيات،
 * **مستندة لتقرير المراقبة الحتمي فقط**. لا تلغي الكشف الحتمي. best-effort.
 */

interface AnalysisInput {
  health: HealthReport;
  anomalies: Anomaly[];
  openIncidents: string[];
}

function digest(i: AnalysisInput): string {
  const anom = i.anomalies.map((a) => `- [${a.severity}] ${a.label}: ${a.description}`).join("\n") || "لا شذوذ.";
  const inc = i.openIncidents.slice(0, 10).map((t) => `- ${t}`).join("\n") || "لا حوادث مفتوحة.";
  return [
    `الصحة الإجمالية: ${i.health.overall}/100 (${i.health.status}).`,
    `التفصيل: نظام ${i.health.breakdown.systemHealth}، أعمال ${i.health.breakdown.businessHealth}، أداء ${i.health.breakdown.performanceHealth}، قاعدة ${i.health.breakdown.databaseHealth}، بنية ${i.health.breakdown.infrastructureHealth}.`,
    `\nالشذوذ:\n${anom}`,
    `\nالحوادث المفتوحة:\n${inc}`,
  ].join("\n");
}

export async function analyzeHypercareWithAi(input: AnalysisInput, domain: string, actorId: string | null): Promise<HypercareAnalysisData | null> {
  try {
    const prompt = buildHypercareAnalysisPrompt(digest(input), domain);
    const resp = await AIService.execute(AITaskType.MIGRATION_HYPERCARE_ANALYSIS, prompt, { actorId: actorId ?? undefined });
    if (!resp.success) return null;
    const v = validateHypercareAnalysis(resp.output);
    return v.ok ? v.data : null;
  } catch {
    return null;
  }
}
