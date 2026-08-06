import { after } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getBrainSettings } from "@/lib/brain-v2/review-service";
import { PRDGenerationEngine } from "@/lib/prd/generation-service";
import { PrototypePromptGenerationEngine } from "@/lib/prototype-prompt/generation-service";
import { ClientPresentationGenerationEngine } from "@/lib/presentation/generation-service";
import { DeveloperHandoffGenerationEngine } from "@/lib/developer-handoff/generation-service";
import { DOWNSTREAM_OF_BRAIN, type SyncArtifactKey } from "./graph";
import { syncKnowledgeGraphFromBrain } from "@/lib/knowledge-graph/sync-service";

export interface ResyncOutcome {
  /** المشتقات اللي اتحجز لها Lock وبدأ التوليد التلقائي في الخلفية. */
  triggered: SyncArtifactKey[];
  /** المشتقات اللي اتجوهلت، مع السبب (معطّل/مفيش محتوى/شغّال بالفعل/...). */
  skipped: { artifact: SyncArtifactKey; reason: string }[];
}

function skipAll(reason: string): ResyncOutcome {
  return { triggered: [], skipped: DOWNSTREAM_OF_BRAIN.map((artifact) => ({ artifact, reason })) };
}

/**
 * يُستدعى بعد أي تغيير فعلي في Project Brain v2 (Draft جديد من تحليل
 * اكتشاف، دمج بيانات اجتماع، أو اعتماد نسخة). لو "المزامنة التلقائية"
 * مفعّلة في إعدادات Brain، بيعيد توليد أي مشتق مباشر (PRD/Prototype
 * Prompt/Client Presentation/Developer Handoff) **عنده محتوى بالفعل**
 * (version > 0) — في الخلفية عبر after()، من غير ما يوقف الاستدعاء
 * الحالي أو يستهلك وقت الطلب.
 *
 * قرارات مقصودة (عشان التكلفة الحقيقية لطلبات AI):
 *  - افتراضيًا معطّلة (شوف brain_settings.auto_resync_downstream) — مفيش
 *    توليد تلقائي بصمت من غير ما الـ PM يفعّله بوعي من الإعدادات.
 *  - خطوة واحدة بس (Brain → مشتق مباشر) — مفيش تسلسل تلقائي غير محدود
 *    (زي PRD الناتج يشغّل Prototype Prompt تلقائيًا بعده). كل مشتق تاني
 *    بيفضل يظهر بادج "Outdated" العادي لحد ما الـ PM يعيد توليده بنفسه،
 *    أو يفعّل مزامنة تلقائية لمرحلة تانية بعدين.
 *  - مشتق لسه ما اتولّدش أول مرة (version = 0) بيتجاهل — التوليد الأول
 *    قرار الـ PM دايمًا، مش حاجة تلقائية.
 *  - Developer Handoff له فحص مبدئي خاص (لازم Review معتمد) — لو مش
 *    مستوفي بيتجاهل بهدوء بدل ما يفشل.
 */
export async function notifyBrainChanged(
  projectId: string,
  actorId: string | null
): Promise<ResyncOutcome> {
  const supabase = createServiceClient();

  // Knowledge Graph (Phase 3) — يفضل يتزامن مع أي تغيير حقيقي في Brain
  // دايمًا، بغض النظر عن إعداد "المزامنة التلقائية للمشتقات" تحت —
  // ده فهرس أغنى فوق Brain نفسه، مش توليد لمشتق تاني بتكلفة AI، فمفيش
  // سبب لتعطيله بنفس المفتاح. غير معطّل للـ Pipeline الحالي أبدًا.
  after(async () => {
    try {
      await syncKnowledgeGraphFromBrain(projectId, actorId);
    } catch (err) {
      console.error(`[KnowledgeSync] Knowledge Graph sync failed for project ${projectId}:`, err);
    }
  });

  const settings = await getBrainSettings(supabase);
  if (!settings.auto_resync_downstream) {
    return skipAll("المزامنة التلقائية معطّلة من إعدادات Project Brain.");
  }

  const [{ data: prd }, { data: prompt }, { data: presentation }, { data: handoff }, { data: project }] =
    await Promise.all([
      supabase.from("prd").select("version, sync_status").eq("project_id", projectId).maybeSingle(),
      supabase
        .from("prototype_prompt")
        .select("version, sync_status, target_tool")
        .eq("project_id", projectId)
        .maybeSingle(),
      supabase
        .from("client_presentations")
        .select("version, status")
        .eq("project_id", projectId)
        .maybeSingle(),
      supabase.from("developer_handoff").select("version, sync_status").eq("project_id", projectId).maybeSingle(),
      supabase.from("projects").select("name").eq("id", projectId).maybeSingle(),
    ]);

  const outcome: ResyncOutcome = { triggered: [], skipped: [] };

  // --- PRD ---
  if (!prd || prd.version === 0) {
    outcome.skipped.push({ artifact: "prd", reason: "لسه مالوش محتوى — التوليد الأول قرار PM." });
  } else if (prd.sync_status === "generating") {
    outcome.skipped.push({ artifact: "prd", reason: "توليد شغّال بالفعل." });
  } else {
    const claimed = await PRDGenerationEngine.tryClaimLock(projectId);
    if (claimed) {
      after(async () => {
        try {
          await PRDGenerationEngine.runFullGenerationCore(projectId, "auto_resync", actorId ?? undefined);
        } catch (err) {
          console.error(`[KnowledgeSync] PRD auto-resync failed for project ${projectId}:`, err);
        }
      });
      outcome.triggered.push("prd");
    } else {
      outcome.skipped.push({ artifact: "prd", reason: "توليد شغّال بالفعل." });
    }
  }

  // --- Prototype Prompt ---
  if (!prompt || prompt.version === 0) {
    outcome.skipped.push({ artifact: "prototype_prompt", reason: "لسه مالوش محتوى — التوليد الأول قرار PM." });
  } else if (prompt.sync_status === "generating") {
    outcome.skipped.push({ artifact: "prototype_prompt", reason: "توليد شغّال بالفعل." });
  } else {
    const claimed = await PrototypePromptGenerationEngine.tryClaimLock(projectId);
    if (claimed) {
      const targetTool = prompt.target_tool ?? "general";
      after(async () => {
        try {
          await PrototypePromptGenerationEngine.runFullGenerationCore(
            projectId,
            targetTool,
            "auto_resync",
            actorId ?? undefined
          );
        } catch (err) {
          console.error(`[KnowledgeSync] Prototype Prompt auto-resync failed for project ${projectId}:`, err);
        }
      });
      outcome.triggered.push("prototype_prompt");
    } else {
      outcome.skipped.push({ artifact: "prototype_prompt", reason: "توليد شغّال بالفعل." });
    }
  }

  // --- Client Presentation ---
  if (!presentation || presentation.version === 0) {
    outcome.skipped.push({ artifact: "client_presentation", reason: "لسه مالوش محتوى — التوليد الأول قرار PM." });
  } else if (presentation.status === "generating") {
    outcome.skipped.push({ artifact: "client_presentation", reason: "توليد شغّال بالفعل." });
  } else if (!project?.name) {
    outcome.skipped.push({ artifact: "client_presentation", reason: "تعذّر تحديد اسم المشروع." });
  } else {
    const claimed = await ClientPresentationGenerationEngine.tryClaimLock(projectId);
    if (claimed) {
      const projectName = project.name;
      after(async () => {
        try {
          await ClientPresentationGenerationEngine.runFullGenerationCore(
            projectId,
            projectName,
            actorId ?? undefined,
            "auto_resync"
          );
        } catch (err) {
          console.error(`[KnowledgeSync] Client Presentation auto-resync failed for project ${projectId}:`, err);
        }
      });
      outcome.triggered.push("client_presentation");
    } else {
      outcome.skipped.push({ artifact: "client_presentation", reason: "توليد شغّال بالفعل." });
    }
  }

  // --- Developer Handoff (فحص مبدئي إضافي: لازم Review معتمد) ---
  if (!handoff || handoff.version === 0) {
    outcome.skipped.push({ artifact: "developer_handoff", reason: "لسه مالوش محتوى — التوليد الأول قرار PM." });
  } else if (handoff.sync_status === "generating") {
    outcome.skipped.push({ artifact: "developer_handoff", reason: "توليد شغّال بالفعل." });
  } else {
    const pre = await DeveloperHandoffGenerationEngine.precheck(projectId);
    if (!pre.ok) {
      const reason = "message" in pre.result ? pre.result.message : "شرط أساسي غير مستوفى.";
      outcome.skipped.push({ artifact: "developer_handoff", reason });
    } else {
      const claimed = await DeveloperHandoffGenerationEngine.tryClaimLock(projectId);
      if (claimed) {
        after(async () => {
          try {
            await DeveloperHandoffGenerationEngine.runFullGenerationCore(
              projectId,
              actorId ?? undefined,
              "auto_resync"
            );
          } catch (err) {
            console.error(`[KnowledgeSync] Developer Handoff auto-resync failed for project ${projectId}:`, err);
          }
        });
        outcome.triggered.push("developer_handoff");
      } else {
        outcome.skipped.push({ artifact: "developer_handoff", reason: "توليد شغّال بالفعل." });
      }
    }
  }

  return outcome;
}
