import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProjectBrainSyncData } from "@/lib/ai/validation/project-brain-sync";
import type { ProjectBrain, ProjectBrainVersionReason } from "@/lib/types/database";

/**
 * طبقة Versioning — كل تعديل فعلي (من AI أو يدوي) بيتسجّل هنا كنسخة
 * جديدة، ورقم version بيزيد. مفيش تسجيل نسخة عند القراءة العادية.
 */

async function getOrCreateBrain(
  supabase: SupabaseClient,
  projectId: string
): Promise<ProjectBrain> {
  const { data: existing } = await supabase
    .from("project_brain")
    .select("*")
    .eq("project_id", projectId)
    .maybeSingle();

  if (existing) return existing as ProjectBrain;

  const { data: created, error } = await supabase
    .from("project_brain")
    .insert({ project_id: projectId })
    .select("*")
    .single();

  if (error || !created) {
    throw new Error(`فشل إنشاء Project Brain: ${error?.message ?? "سبب غير معروف"}`);
  }
  return created as ProjectBrain;
}

async function insertVersion(
  supabase: SupabaseClient,
  projectId: string,
  version: number,
  snapshot: {
    summary: string | null;
    key_facts: unknown;
    pain_points: unknown;
    decisions_log: unknown;
    open_questions: unknown;
  },
  reason: ProjectBrainVersionReason,
  isManual: boolean,
  createdBy?: string
): Promise<void> {
  await supabase.from("project_brain_versions").insert({
    project_id: projectId,
    version,
    summary: snapshot.summary,
    key_facts: snapshot.key_facts,
    pain_points: snapshot.pain_points,
    decisions_log: snapshot.decisions_log,
    open_questions: snapshot.open_questions,
    reason,
    is_manual: isManual,
    created_by: createdBy ?? null,
  });
}

/**
 * يطبّق نتيجة مزامنة AI ناجحة. لو فيه ملخص يدوي حالي، ميستبدلوش تلقائيًا
 * (Conflict) — بيخزّن اقتراح AI في pending_summary ويحدّث باقي الحقول
 * مباشرة (دول مالهاش Conflict، الملخص بس هو القابل للتعديل اليدوي).
 */
export async function applyAiSyncResult(
  supabase: SupabaseClient,
  projectId: string,
  result: ProjectBrainSyncData,
  reason: Extract<
    ProjectBrainVersionReason,
    "meeting_processed" | "discovery_form_updated" | "manual_resync"
  >
): Promise<void> {
  const brain = await getOrCreateBrain(supabase, projectId);
  const newVersion = brain.version + 1;

  if (brain.summary_is_manual) {
    await supabase
      .from("project_brain")
      .update({
        pending_summary: result.summary,
        key_facts: result.key_facts,
        pain_points: result.pain_points,
        decisions_log: result.decisions_log,
        open_questions: result.open_questions,
        version: newVersion,
        sync_status: "idle",
        last_synced_at: new Date().toISOString(),
        last_sync_error: null,
      })
      .eq("project_id", projectId);

    await insertVersion(
      supabase,
      projectId,
      newVersion,
      {
        summary: brain.summary,
        key_facts: result.key_facts,
        pain_points: result.pain_points,
        decisions_log: result.decisions_log,
        open_questions: result.open_questions,
      },
      reason,
      false
    );
    return;
  }

  await supabase
    .from("project_brain")
    .update({
      summary: result.summary,
      key_facts: result.key_facts,
      pain_points: result.pain_points,
      decisions_log: result.decisions_log,
      open_questions: result.open_questions,
      version: newVersion,
      sync_status: "idle",
      last_synced_at: new Date().toISOString(),
      last_sync_error: null,
    })
    .eq("project_id", projectId);

  await insertVersion(supabase, projectId, newVersion, result, reason, false);
}

export async function applyManualSummaryEdit(
  supabase: SupabaseClient,
  projectId: string,
  newSummary: string,
  userId?: string
): Promise<void> {
  const brain = await getOrCreateBrain(supabase, projectId);
  const newVersion = brain.version + 1;

  await supabase
    .from("project_brain")
    .update({ summary: newSummary, summary_is_manual: true, version: newVersion })
    .eq("project_id", projectId);

  await insertVersion(
    supabase,
    projectId,
    newVersion,
    {
      summary: newSummary,
      key_facts: brain.key_facts,
      pain_points: brain.pain_points,
      decisions_log: brain.decisions_log,
      open_questions: brain.open_questions,
    },
    "manual_edit",
    true,
    userId
  );
}

export async function acceptPendingProposal(
  supabase: SupabaseClient,
  projectId: string,
  userId?: string
): Promise<void> {
  const brain = await getOrCreateBrain(supabase, projectId);
  if (!brain.pending_summary) return;

  const newVersion = brain.version + 1;

  await supabase
    .from("project_brain")
    .update({
      summary: brain.pending_summary,
      pending_summary: null,
      summary_is_manual: false,
      version: newVersion,
    })
    .eq("project_id", projectId);

  await insertVersion(
    supabase,
    projectId,
    newVersion,
    {
      summary: brain.pending_summary,
      key_facts: brain.key_facts,
      pain_points: brain.pain_points,
      decisions_log: brain.decisions_log,
      open_questions: brain.open_questions,
    },
    "accepted_proposal",
    false,
    userId
  );
}

export async function dismissPendingProposal(
  supabase: SupabaseClient,
  projectId: string
): Promise<void> {
  await supabase.from("project_brain").update({ pending_summary: null }).eq("project_id", projectId);
}
