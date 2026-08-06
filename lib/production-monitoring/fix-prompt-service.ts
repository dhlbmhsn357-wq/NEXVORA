import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { AIService } from "@/lib/ai/service";
import { AITaskType } from "@/lib/ai/types";
import {
  PRODUCTION_FIX_PERSONA,
  buildProductionFixContextItems,
  buildProductionFixStageBody,
} from "@/lib/ai/prompts/production-fix-prompt";
import { validateProductionFixPromptGeneration } from "@/lib/ai/validation/production-fix-prompt";
import { buildFrameworkPrompt } from "@/lib/ai/prompt-framework";
import type { MonitoringFixPrompt, MonitoringIncident } from "@/lib/types/database";

export type GenerateFixPromptsResult = { status: "success"; count: number } | { status: "error"; message: string };

/**
 * محرّك "Claude Architect" (Phase 6) — بيولّد مجموعة Prompts إصلاح
 * مقسّمة حسب المحور التقني لحادثة واحدة، منفصل تمامًا عن fix-prompt
 * الخاص بحلقة إصلاح Engineering QA. كل تشغيلة جديدة بتُعلّم الدفعة
 * القديمة (لو موجودة) بـ superseded بدل حذفها — سجل كامل بلا استبدال صامت.
 */
export async function generateFixPromptsForIncident(incidentId: string, actorId: string | null = null): Promise<GenerateFixPromptsResult> {
  const supabase: SupabaseClient = createServiceClient();

  const { data: incidentRow } = await supabase.from("monitoring_incidents").select("*").eq("id", incidentId).maybeSingle();
  if (!incidentRow) return { status: "error", message: "الحادثة غير موجودة." };
  const incident = incidentRow as MonitoringIncident;

  // Unified Prompt Framework (pilot): profile=production، target=claude_code
  // (بيحقن Claude Code Workflow: Branch/TypeCheck/ESLint/Tests/Build/Rollback)،
  // + Prompt Readiness Score + حفظ إصدار في prompt_generations.
  const framework = await buildFrameworkPrompt(supabase, {
    projectId: incident.project_id,
    stage: "production_fix_prompt",
    profileId: "production",
    persona: PRODUCTION_FIX_PERSONA,
    stageBody: buildProductionFixStageBody(),
    contextItems: buildProductionFixContextItems({
      title: incident.title,
      description: incident.description,
      category: incident.category,
      severity: incident.severity,
      root_cause: incident.root_cause,
      affected_components: incident.affected_components,
      workaround: incident.workaround,
      permanent_solution: incident.permanent_solution,
      patch_proposal: incident.patch_proposal,
    }),
    actorId,
  });

  const response = await AIService.execute(AITaskType.PRODUCTION_FIX_PROMPT_GENERATION, framework.assembled.text, { projectId: incident.project_id, actorId: actorId ?? undefined });
  if (!response.success) return { status: "error", message: response.error?.message ?? "فشل استدعاء AI." };

  const validated = validateProductionFixPromptGeneration(response.output);
  if (!validated.ok) return { status: "error", message: validated.reason };

  const { data: existing } = await supabase.from("monitoring_fix_prompts").select("id, version").eq("incident_id", incidentId).order("version", { ascending: false }).limit(1).maybeSingle();
  const nextVersion = (existing?.version ?? 0) + 1;

  if (existing) {
    await supabase.from("monitoring_fix_prompts").update({ status: "superseded" }).eq("incident_id", incidentId).eq("status", "pending");
  }

  const { error } = await supabase.from("monitoring_fix_prompts").insert(
    validated.data.map((p, index) => ({
      incident_id: incidentId,
      project_id: incident.project_id,
      area: p.area,
      order_index: index,
      content: p.content,
      version: nextVersion,
      status: "pending",
    }))
  );
  if (error) return { status: "error", message: error.message };

  await supabase.from("monitoring_incident_events").insert({
    incident_id: incidentId,
    project_id: incident.project_id,
    event_type: "fix_proposed",
    detail: `تم توليد ${validated.data.length} Prompt إصلاح (نسخة ${nextVersion}).`,
    actor_id: actorId,
  });

  return { status: "success", count: validated.data.length };
}

export async function getFixPromptsForIncident(supabase: SupabaseClient, incidentId: string): Promise<MonitoringFixPrompt[]> {
  const { data } = await supabase.from("monitoring_fix_prompts").select("*").eq("incident_id", incidentId).eq("status", "pending").order("order_index");
  return (data as MonitoringFixPrompt[] | null) ?? [];
}

export async function getFixPromptsForProject(supabase: SupabaseClient, projectId: string): Promise<MonitoringFixPrompt[]> {
  const { data } = await supabase.from("monitoring_fix_prompts").select("*").eq("project_id", projectId).eq("status", "pending").order("order_index");
  return (data as MonitoringFixPrompt[] | null) ?? [];
}
