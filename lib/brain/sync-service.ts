import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { AIService } from "@/lib/ai/service";
import { AITaskType } from "@/lib/ai/types";
import { aggregateProjectData } from "./aggregation";
import { buildProjectBrainSyncPrompt } from "@/lib/ai/prompts/project-brain-sync";
import { buildFusedKnowledgeBlock } from "@/lib/domain-library/fusion/fusion-service";
import { validateProjectBrainSync } from "@/lib/ai/validation/project-brain-sync";
import { applyAiSyncResult } from "./versioning";
import type { ProjectBrainVersionReason } from "@/lib/types/database";

export type SyncTriggerReason = Extract<
  ProjectBrainVersionReason,
  "meeting_processed" | "discovery_form_updated" | "manual_resync"
>;

export type SyncResult =
  | { status: "success" }
  | { status: "insufficient_data"; message: string }
  | { status: "already_syncing" }
  | { status: "error"; message: string; code: string };

/**
 * يحاول يحجز قفل المزامنة بشكل ذري (UPDATE ... WHERE sync_status != 'syncing').
 * لو رجّع صف واحد يبقى نجح الحجز، لو صفر يبقى فيه مزامنة شغالة بالفعل.
 */
async function claimSyncLock(supabase: SupabaseClient, projectId: string): Promise<boolean> {
  await supabase
    .from("project_brain")
    .upsert({ project_id: projectId }, { onConflict: "project_id", ignoreDuplicates: true });

  const { data, error } = await supabase
    .from("project_brain")
    .update({ sync_status: "syncing" })
    .eq("project_id", projectId)
    .neq("sync_status", "syncing")
    .select("project_id");

  if (error) return false;
  return (data?.length ?? 0) > 0;
}

/**
 * المدخل الوحيد لتشغيل مزامنة Project Brain. يحجز القفل، يجمّع البيانات
 * (Aggregation Engine)، يستدعي AIService بس (task_type = PROJECT_BRAIN_SYNC)،
 * يتحقق من الرد، ثم يطبّق النتيجة عبر طبقة الـ Versioning.
 */
export class ProjectBrainSyncService {
  static async sync(
    projectId: string,
    reason: SyncTriggerReason,
    actorId?: string
  ): Promise<SyncResult> {
    const supabase = createServiceClient();

    const locked = await claimSyncLock(supabase, projectId);
    if (!locked) {
      return { status: "already_syncing" };
    }

    try {
      const aggregation = await aggregateProjectData(supabase, projectId);

      if (!aggregation.hasEnoughData || !aggregation.data) {
        await supabase
          .from("project_brain")
          .update({ sync_status: "idle" })
          .eq("project_id", projectId);
        return {
          status: "insufficient_data",
          message:
            "بيانات المشروع غير كافية لبناء Project Brain — أضف بيانات في نموذج الاكتشاف أو الاجتماعات أولاً.",
        };
      }

      const fused = await buildFusedKnowledgeBlock(projectId, supabase);
      const prompt = buildProjectBrainSyncPrompt(aggregation.data, fused.text);
      const response = await AIService.execute(AITaskType.PROJECT_BRAIN_SYNC, prompt, {
        actorId,
        projectId,
      });

      if (!response.success) {
        await supabase
          .from("project_brain")
          .update({
            sync_status: "failed",
            last_sync_error: response.error?.message ?? "خطأ غير معروف",
          })
          .eq("project_id", projectId);
        return {
          status: "error",
          message: response.error?.message ?? "فشلت مزامنة Project Brain.",
          code: response.error?.code ?? "UNKNOWN",
        };
      }

      const validation = validateProjectBrainSync(response.output);
      if (!validation.ok) {
        console.error(
          `[ProjectBrainSync] Validation failed for project ${projectId}: ${validation.reason}`
        );
        await supabase
          .from("project_brain")
          .update({ sync_status: "failed", last_sync_error: validation.reason })
          .eq("project_id", projectId);
        return { status: "error", message: "لم نتمكن من فهم نتيجة المزامنة.", code: "INVALID_RESPONSE" };
      }

      await applyAiSyncResult(supabase, projectId, validation.data, reason);
      return { status: "success" };
    } catch (err) {
      console.error(`[ProjectBrainSync] Unexpected failure for project ${projectId}:`, err);
      await supabase
        .from("project_brain")
        .update({
          sync_status: "failed",
          last_sync_error: err instanceof Error ? err.message : "خطأ غير متوقع",
        })
        .eq("project_id", projectId);
      return { status: "error", message: "حدث خطأ غير متوقع أثناء المزامنة.", code: "UNEXPECTED" };
    }
  }
}
