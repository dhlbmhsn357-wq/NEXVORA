/**
 * NEXVORA Sector Standards — Prototype Change Prompt Generation
 * Data Access + Orchestration (0125، المرحلة ج)
 * ============================================================================
 * Server-only. القراءة عبر authenticated client (RLS SELECT). الكتابة عبر
 * service client (RBAC مطبّق في server actions). نفس نمط
 * change-request-service.ts بالضبط.
 *
 * **الضمانة الأساسية (غير قابلة للتفاوض)**: الدالة الرئيسية هنا
 * (generatePrototypeChangePrompt) أبدًا ما بتكتبش على أي جدول بيانات
 * منتج حقيقي. بتقرأ فقط change_impacts بحالة 'applied'، وبتكتب حصريًا
 * على prototype_change_prompts (جدول عرضي، مش "حقيقة المنتج").
 */
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { AIService } from "@/lib/ai/service";
import { AITaskType } from "@/lib/ai/types";
import { buildPrototypeChangePromptGenerationPrompt } from "@/lib/ai/prompts/prototype-change-prompt-generation";
import { validatePrototypeChangePromptGeneration } from "@/lib/ai/validation/prototype-change-prompt-generation";
import { truncateForLog } from "@/lib/observability/safe-log";
import { getChangeRequest, listChangeImpacts } from "./change-request-service";
import type { PrototypeChangePromptRow } from "./prototype-prompt-types";

type DbPrototypeChangePrompt = {
  id: string;
  change_request_id: string;
  prompt_text: string;
  prototype_tool: string | null;
  generated_at: string;
  generated_by: string | null;
};

function mapRow(r: DbPrototypeChangePrompt): PrototypeChangePromptRow {
  return {
    id: r.id,
    changeRequestId: r.change_request_id,
    promptText: r.prompt_text,
    prototypeTool: r.prototype_tool,
    generatedAt: r.generated_at,
    generatedBy: r.generated_by,
  };
}

export type GeneratePrototypeChangePromptResult =
  | { ok: true; prompt: PrototypeChangePromptRow }
  | { ok: false; message: string };

/**
 * يولّد Prompt جديد لتغيير الـ Prototype، مبني حصريًا على change_impacts
 * بحالة 'applied' فعليًا لطلب التغيير ده. لو مفيش ولا أثر مُطبَّق بعد
 * (مفيش حاجة اتوافق عليها وطُبّقت فعليًا)، بيرفض التوليد برسالة واضحة —
 * مفيش حاجة تُبنى عليها الـ Prompt أصلًا.
 */
export async function generatePrototypeChangePrompt(
  changeRequestId: string,
  actorId: string | null,
  prototypeTool?: string
): Promise<GeneratePrototypeChangePromptResult> {
  const changeRequest = await getChangeRequest(changeRequestId);
  if (!changeRequest) {
    return { ok: false, message: "طلب التغيير غير موجود." };
  }

  const allImpacts = await listChangeImpacts(changeRequestId);
  const appliedImpacts = allImpacts.filter((i) => i.status === "applied");
  if (appliedImpacts.length === 0) {
    return {
      ok: false,
      message: "لا يوجد أي أثر مُطبَّق فعليًا بعد لطلب التغيير ده — اعتمِد وطبّق التغييرات المطلوبة أولًا قبل توليد Prompt للـ Prototype.",
    };
  }

  const trimmedTool = prototypeTool?.trim() || null;
  const prompt = buildPrototypeChangePromptGenerationPrompt(changeRequest, appliedImpacts, trimmedTool);

  const response = await AIService.execute(AITaskType.PROTOTYPE_CHANGE_PROMPT_GENERATION, prompt, {
    projectId: changeRequest.projectId,
  });

  if (!response.success) {
    console.error(
      `[PrototypePrompt] فشل نداء AI لطلب التغيير ${changeRequestId}: ${response.error?.code} — ${truncateForLog(response.error?.message ?? "")}`
    );
    return { ok: false, message: "تعذّر توليد Prompt للـ Prototype حاليًا — حاول مرة أخرى." };
  }

  const validation = validatePrototypeChangePromptGeneration(response.output);
  if (!validation.ok) {
    console.error(`[PrototypePrompt] فشل التحقق من رد التوليد لطلب التغيير ${changeRequestId}: ${truncateForLog(validation.reason)}`);
    return { ok: false, message: "لم نتمكن من فهم Prompt الـ Prototype الناتج." };
  }

  const svc = createServiceClient();
  const { data, error } = await svc
    .from("prototype_change_prompts")
    .insert({
      change_request_id: changeRequestId,
      prompt_text: validation.promptText,
      prototype_tool: trimmedTool,
      generated_by: actorId,
    })
    .select("*")
    .single();
  if (error) throw error;

  return { ok: true, prompt: mapRow(data as DbPrototypeChangePrompt) };
}

export async function listPrototypeChangePrompts(changeRequestId: string): Promise<PrototypeChangePromptRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("prototype_change_prompts")
    .select("*")
    .eq("change_request_id", changeRequestId)
    .order("generated_at", { ascending: false });
  if (error) throw error;
  return (data as DbPrototypeChangePrompt[]).map(mapRow);
}
