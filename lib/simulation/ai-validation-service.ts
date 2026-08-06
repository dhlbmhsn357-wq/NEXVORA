import type { SupabaseClient } from "@supabase/supabase-js";
import { AIService } from "@/lib/ai/service";
import { AITaskType } from "@/lib/ai/types";
import { buildSimulationValidationPrompt } from "@/lib/ai/prompts/migration-simulation";
import { validateSimulationValidation, type SimValidationData } from "@/lib/ai/validation/migration-simulation";
import type { SimulationReport } from "./simulation-types";

/**
 * الطبقة الاستشارية بالذكاء الاصطناعي — تُثري تقرير المحاكاة الحتمي بتحقّق
 * تجاري وتنبّؤ مخاطر وتوصيات، **مستندة للتقرير والذاكرة المؤسسية فقط**.
 * لا تلغي الحكم الحتمي (Approval Score) — تفسّره. best-effort (فشلها لا يفشل المحاكاة).
 */

/** يبني خلاصة مضغوطة من التقرير (لا صفوف خام) لتغذية الـPrompt. */
function digest(report: SimulationReport): string {
  const s = report.summary;
  const topIssues = report.issues.slice(0, 12).map((i) => `- [${i.severity}] ${i.entity}.${i.field}: ${i.message} (×${i.count})`).join("\n");
  const rels = report.relationships.checks.map((c) => `- ${c.fromEntity}→${c.toEntity} (${c.kind}): ${c.broken} مكسور من ${c.checked}`).join("\n");
  const biz = report.business.checks.filter((c) => !c.passed).map((c) => `- ${c.title} (${c.entity}): ${c.oldValue}→${c.newValue}`).join("\n") || "لا فشل تجاري.";
  return [
    `الصفوف: مصدر ${s.totalSourceRows} → هدف ${s.totalTargetRows} | مرحَّل ${s.outcomes.migrated}، تخطّي ${s.outcomes.skipped}، أرشفة ${s.outcomes.archived}، فشل ${s.outcomes.failed}.`,
    `فقدان بيانات: ${s.dataLossCount} | علاقات مكسورة: ${s.brokenRelations} | فشل تجاري: ${s.businessFailures} | مشاكل حرجة: ${s.criticalIssues}.`,
    `درجة الاعتماد: ${report.approval.score}/100 (${report.approval.verdict}) | محظور: ${report.approval.blocked ? "نعم" : "لا"} | المخاطر: ${report.risk.level} (${report.risk.riskScore}).`,
    report.approval.blockers.length ? `قواعد المنع: ${report.approval.blockers.join(" | ")}` : "لا قواعد منع.",
    `الأداء (مليون صفّ): ${report.performance.scenarios.find((x) => x.rows === 1_000_000)?.estimatedSeconds ?? "?"} ثانية، توقّف ${report.performance.scenarios.find((x) => x.rows === 1_000_000)?.estimatedDowntimeSeconds ?? "?"} ثانية.`,
    `الجداول الحرجة: ${report.risk.criticalTables.join("، ") || "لا شيء"}.`,
    `\nأهمّ المشاكل:\n${topIssues || "لا مشاكل."}`,
    `\nالعلاقات:\n${rels || "لا علاقات."}`,
    `\nالفشل التجاري:\n${biz}`,
  ].join("\n");
}

export async function enrichSimulationWithAi(
  report: SimulationReport,
  domain: string,
  _entityCount: number,
  actorId: string | null,
  _entities: string[],
  client: SupabaseClient
): Promise<SimValidationData | null> {
  try {
    // دروس ترحيلات سابقة من الذاكرة المؤسسية (عناوين موجزة).
    let orgMemory = "";
    try {
      const { data } = await client
        .from("org_experiences")
        .select("title, experience_type")
        .in("experience_type", ["failure_pattern", "lesson_learned", "success_pattern"])
        .eq("status", "published")
        .limit(8);
      if (data && data.length) orgMemory = (data as Array<{ title: string; experience_type: string }>).map((e) => `- [${e.experience_type}] ${e.title}`).join("\n");
    } catch {
      /* الذاكرة المؤسسية اختيارية */
    }

    const prompt = buildSimulationValidationPrompt(digest(report), domain, orgMemory);
    const resp = await AIService.execute(AITaskType.MIGRATION_SIMULATION_VALIDATION, prompt, { actorId: actorId ?? undefined });
    if (!resp.success) return null;
    const v = validateSimulationValidation(resp.output);
    return v.ok ? v.data : null;
  } catch {
    return null;
  }
}
