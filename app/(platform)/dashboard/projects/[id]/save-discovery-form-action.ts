"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ProjectBrainSyncService } from "@/lib/brain/sync-service";
import { getTemplateQuestions } from "@/lib/discovery-templates/queries";
import { buildQuestionsSnapshot } from "@/lib/discovery-templates/snapshot";

type SaveResult = { ok: boolean; message?: string; formId?: string };

/**
 * دالة قديمة — تفضل شغّالة للفورمات المبنية على الأسئلة الثابتة
 * (lib/discovery-form/questions.ts). ما بتلمسش template_id ولا snapshot.
 */
export async function saveDiscoveryForm(
  projectId: string,
  existingFormId: string | null,
  answers: Record<string, unknown>
): Promise<{ ok: boolean; message?: string }> {
  const supabase = await createClient();

  if (existingFormId) {
    const { error } = await supabase
      .from("discovery_forms")
      .update({ answers, status: "submitted", submitted_at: new Date().toISOString() })
      .eq("id", existingFormId);
    if (error) return { ok: false, message: error.message };
  } else {
    const { error } = await supabase.from("discovery_forms").insert({
      project_id: projectId,
      answers,
      status: "submitted",
      submitted_at: new Date().toISOString(),
    });
    if (error) return { ok: false, message: error.message };
  }

  revalidatePath(`/dashboard/projects/${projectId}`);

  after(async () => {
    const result = await ProjectBrainSyncService.sync(projectId, "discovery_form_updated");
    if (result.status === "error") {
      console.error(`[DiscoveryForm] Project Brain sync failed for project ${projectId}: ${result.message}`);
    }
  });

  return { ok: true };
}

/**
 * Helper داخلي: upsert فورم الاكتشاف المبني على قالب ديناميكي.
 * يبني اللقطة من أسئلة القالب الحالية (integrity)، ويحدّث القالب
 * المرتبط بالمشروع عشان يتفكر لاحقًا.
 */
async function upsertTemplateForm(
  projectId: string,
  templateId: string,
  answers: Record<string, unknown>,
  status: "draft" | "submitted"
): Promise<SaveResult> {
  const supabase = await createClient();

  const questions = await getTemplateQuestions(supabase, templateId);
  const snapshot = buildQuestionsSnapshot(questions);

  const row: Record<string, unknown> = {
    project_id: projectId,
    template_id: templateId,
    answers,
    questions_snapshot: snapshot,
    status,
  };
  if (status === "submitted") {
    row.submitted_at = new Date().toISOString();
  }

  // Discovery Workspace: التعبئة الداخلية (من الفريق) بتستخدم "جلسة
  // داخلية" واحدة لكل مشروع = صف بلا link_id. find-then-update/insert
  // بدل upsert onConflict لأن القيد الفريد على project_id اتشال (0057).
  const { data: existing } = await supabase
    .from("discovery_forms")
    .select("id")
    .eq("project_id", projectId)
    .is("link_id", null)
    .maybeSingle();

  let data: { id: string } | null = null;
  let error: { message: string } | null = null;
  if (existing) {
    const res = await supabase.from("discovery_forms").update(row).eq("id", existing.id).select("id").single();
    data = res.data as { id: string } | null;
    error = res.error;
  } else {
    const res = await supabase.from("discovery_forms").insert(row).select("id").single();
    data = res.data as { id: string } | null;
    error = res.error;
  }

  if (error) return { ok: false, message: error.message };

  // خلي المشروع يفتكر القالب المستخدم (لو مش متسجّل)
  await supabase
    .from("projects")
    .update({ discovery_template_id: templateId })
    .eq("id", projectId)
    .is("discovery_template_id", null);

  return { ok: true, formId: data?.id };
}

/** حفظ تلقائي كمسودّة — بدون قفل وبدون مزامنة Brain. */
export async function autosaveDiscoveryForm(
  projectId: string,
  templateId: string,
  answers: Record<string, unknown>
): Promise<SaveResult> {
  const result = await upsertTemplateForm(projectId, templateId, answers, "draft");
  return result;
}

/** تسليم نهائي — يقفل الفورم ويشغّل مزامنة Project Brain في الخلفية. */
export async function submitDiscoveryForm(
  projectId: string,
  templateId: string,
  answers: Record<string, unknown>
): Promise<SaveResult> {
  const result = await upsertTemplateForm(projectId, templateId, answers, "submitted");
  if (!result.ok) return result;

  revalidatePath(`/dashboard/projects/${projectId}`);

  after(async () => {
    const syncResult = await ProjectBrainSyncService.sync(projectId, "discovery_form_updated");
    if (syncResult.status === "error") {
      console.error(
        `[DiscoveryForm] Project Brain sync failed for project ${projectId}: ${syncResult.message}`
      );
    }
  });

  return result;
}
