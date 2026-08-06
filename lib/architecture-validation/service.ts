import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { AIService } from "@/lib/ai/service";
import { AITaskType } from "@/lib/ai/types";
import { getBrainForDownstreamGeneration, formatBrainV2ForPrompt } from "@/lib/brain-v2/downstream-context";
import { findSimilarProjects } from "@/lib/organizational-intelligence/similarity";
import { analyzeArchitecture } from "@/lib/domain-intelligence/module-catalog";
import { getActiveNodeTitles } from "@/lib/domain-intelligence/module-library-service";
import { buildArchitectureValidationPrompt, parseArchitectureValidation } from "./prompt";
import type { ProjectDomain, ArchitectureValidationReport } from "@/lib/types/database";

/**
 * محرّك التحقّق المعماري (Phase 6) — يجعل المنصة "تفكّر قبل توليد الـ PRD":
 * يدمج تحليلًا حتميًا عابرًا للوحدات (module-catalog) + إثراء AI للفئات
 * الدلالية + إعادة استخدام معرفة مشاريع سابقة مشابهة (الوحدات/الأخطاء
 * الشائعة/نتائج QA). يعيد استخدام كل البنية الموجودة (Knowledge Graph
 * nodes، similarity، Brain downstream context، AI Provider Layer) —
 * بدون تكرار منطق.
 */

/** إعادة استخدام معرفة مشاريع سابقة مشابهة (الوحدات + الأخطاء + QA). */
async function gatherReusedInsights(
  supabase: ReturnType<typeof createServiceClient>,
  projectId: string
): Promise<ArchitectureValidationReport["reused_insights"]> {
  const similar = await findSimilarProjects(supabase, projectId);
  if (similar.length === 0) return [];

  const out: ArchitectureValidationReport["reused_insights"] = [];
  for (const s of similar.slice(0, 3)) {
    const { data: detections } = await supabase
      .from("project_module_detections")
      .select("module_key")
      .eq("project_id", s.project_id)
      .eq("present", true);
    const moduleKeys = ((detections ?? []) as { module_key: string }[]).map((d) => d.module_key);

    let mistakes: string[] = [];
    let qa: string[] = [];
    if (moduleKeys.length) {
      const { data: mods } = await supabase
        .from("business_modules")
        .select("common_mistakes, qa_findings")
        .in("module_key", moduleKeys);
      for (const m of (mods ?? []) as { common_mistakes: string[]; qa_findings: string[] }[]) {
        mistakes.push(...(m.common_mistakes ?? []));
        qa.push(...(m.qa_findings ?? []));
      }
    }
    mistakes = [...new Set(mistakes)].slice(0, 8);
    qa = [...new Set(qa)].slice(0, 8);
    out.push({ project_id: s.project_id, name: s.project_name, modules: moduleKeys, mistakes, qa });
  }
  return out;
}

/**
 * يشغّل التحقّق المعماري لمشروع ويخزّن التقرير (upsert صف واحد لكل مشروع).
 * best-effort على AI — لو فشل الإثراء، التقرير الحتمي بيتخزّن كامل.
 */
export async function runArchitectureValidation(projectId: string, actorId: string | null = null): Promise<{ ok: boolean; message?: string }> {
  const supabase = createServiceClient();

  await supabase.from("architecture_validation_reports").upsert(
    { project_id: projectId, status: "generating", requested_by: actorId, generated_at: new Date().toISOString() },
    { onConflict: "project_id" }
  );

  try {
    const [{ data: proj }, titles] = await Promise.all([
      supabase.from("projects").select("domain").eq("id", projectId).maybeSingle(),
      getActiveNodeTitles(projectId),
    ]);
    const domain = ((proj as { domain?: ProjectDomain } | null)?.domain ?? "generic") as ProjectDomain;
    const deterministic = analyzeArchitecture(domain, titles);

    const brain = await getBrainForDownstreamGeneration(supabase, projectId);
    const brainSummary = brain ? formatBrainV2ForPrompt(brain.content) : "";

    // إثراء AI للفئات الدلالية (best-effort)
    let gaps: ArchitectureValidationReport["gaps"] = {};
    let aiSummary = "";
    if (brainSummary) {
      const prompt = buildArchitectureValidationPrompt({ domain, brainSummary, deterministic });
      const res = await AIService.execute(AITaskType.ARCHITECTURE_VALIDATION, prompt, { projectId, actorId: actorId ?? undefined });
      if (res.success) {
        const parsed = parseArchitectureValidation(res.output);
        gaps = parsed.gaps;
        aiSummary = parsed.summary;
      }
    }

    const reusedInsights = await gatherReusedInsights(supabase, projectId);

    await supabase.from("architecture_validation_reports").upsert(
      {
        project_id: projectId,
        status: "ready",
        domain,
        missing_modules: deterministic.missingModules,
        missing_features: deterministic.missingFeatures,
        gaps,
        reused_insights: reusedInsights,
        readiness_score: deterministic.readinessScore,
        ai_summary: aiSummary || null,
        last_error: null,
        generated_from_brain_version: brain?.version ?? null,
        requested_by: actorId,
        generated_at: new Date().toISOString(),
      },
      { onConflict: "project_id" }
    );
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "فشل التحقّق المعماري.";
    await supabase.from("architecture_validation_reports").upsert(
      { project_id: projectId, status: "failed", last_error: message, generated_at: new Date().toISOString() },
      { onConflict: "project_id" }
    );
    return { ok: false, message };
  }
}

export async function getArchitectureReport(projectId: string): Promise<ArchitectureValidationReport | null> {
  const supabase = createServiceClient();
  const { data } = await supabase.from("architecture_validation_reports").select("*").eq("project_id", projectId).maybeSingle();
  return (data as ArchitectureValidationReport | null) ?? null;
}
