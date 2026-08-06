import type { SupabaseClient } from "@supabase/supabase-js";
import { knownStages } from "./stage-labels";

const progressOrder: string[] = [
  "lead",
  "intake",
  "research",
  "discovery_meeting",
  "scope_proposal",
  "prototype",
  "build",
  "launch",
  "support",
];

/**
 * يقدّم مرحلة المشروع لـ targetStage فقط لو مرحلته الحالية أقدم في
 * التسلسل الطبيعي — لا يرجّع مرحلة متقدّمة للخلف أبدًا (مثلاً لو
 * المشروع في "build" بالفعل، تسليم فورم اكتشاف متأخر ما يرجّعوش لـ
 * "discovery_meeting"). مراحل غير معروفة (نص حر خارج الـ enum) تُتخطى.
 */
export async function advanceProjectStage(
  supabase: SupabaseClient,
  projectId: string,
  targetStage: string
): Promise<void> {
  if (!knownStages.includes(targetStage as (typeof knownStages)[number])) return;

  const { data: project } = await supabase
    .from("projects")
    .select("stage")
    .eq("id", projectId)
    .maybeSingle();
  if (!project) return;

  const currentIndex = progressOrder.indexOf(project.stage);
  const targetIndex = progressOrder.indexOf(targetStage);
  if (targetIndex === -1) return;
  if (currentIndex !== -1 && currentIndex >= targetIndex) return; // متقدّم بالفعل

  await supabase.from("projects").update({ stage: targetStage }).eq("id", projectId);
}
