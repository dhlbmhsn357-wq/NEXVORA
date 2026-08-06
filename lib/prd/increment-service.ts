import type { SupabaseClient } from "@supabase/supabase-js";
import { truncateForLog } from "@/lib/observability/safe-log";
import { createServiceClient } from "@/lib/supabase/service";
import { AITaskType } from "@/lib/ai/types";
import { friendlyAiErrorMessage } from "@/lib/ai/error-messages";
import { executeAIWithRateLimitWait } from "@/lib/ai/execute-with-rate-limit-wait";
import { buildPrdIncrementPrompt } from "@/lib/ai/prompts/prd-increment";
import {
  validatePrdIncrementSection,
  type PrdIncrementSectionData,
} from "@/lib/ai/validation/prd-increment";
import { setIncrementStatus, type ProjectIncrement } from "@/lib/increments/service";
import type { PRD } from "@/lib/types/database";

/**
 * توليد **قسم PRD مخصّص لزيادة واحدة**.
 *
 * الفرق عن `PRDGenerationEngine.runFullGenerationCore`: ده مابيلمسش صف
 * الـ `prd` خالص. بيكتب صف واحد في `prd_increment_sections` مربوط
 * بالزيادة، فالمستند الأصلي وكل نسخه بيفضلوا زي ما هم. ده اللي بيخلّي
 * اجتماع جديد يضيف "جزء خاص بيه" بدل ما يعيد توليد المستند كله.
 *
 * الجدول أُضيف في هجرة 0070 (بتتطبّق يدويًا)، فالقراءة متسامحة مع غيابه.
 */

const UNDEFINED_TABLE = "42P01";

function isMissingTable(error: { code?: string } | null): boolean {
  return error?.code === UNDEFINED_TABLE;
}

export type PrdIncrementSectionStatus = "pending" | "generating" | "ready" | "failed";

export interface PrdIncrementSection {
  id: string;
  project_id: string;
  increment_id: string;
  title: string;
  content: PrdIncrementSectionData | Record<string, never>;
  order_index: number;
  status: PrdIncrementSectionStatus;
  last_error: string | null;
  generated_from_brain_version: number | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type PrdIncrementResult =
  | { status: "started" }
  | { status: "already_generating" }
  | { status: "missing_data"; message: string };

/** أي قفل معلّق أقدم من كده يُعتبر Job مات — نفس نمط باقي المولّدات. */
const STALE_LOCK_MS = 6 * 60_000;

export async function listPrdIncrementSections(
  supabase: SupabaseClient,
  projectId: string
): Promise<PrdIncrementSection[]> {
  const { data, error } = await supabase
    .from("prd_increment_sections")
    .select("*")
    .eq("project_id", projectId)
    .order("order_index", { ascending: true });
  if (error) {
    if (!isMissingTable(error)) {
      console.error(`[PRDIncrement] تعذّر قراءة أقسام الزيادات للمشروع ${projectId}: ${error.message}`);
    }
    return [];
  }
  return (data ?? []) as PrdIncrementSection[];
}

async function getPrdOrNull(supabase: SupabaseClient, projectId: string): Promise<PRD | null> {
  const { data } = await supabase
    .from("prd")
    .select("*")
    .eq("project_id", projectId)
    .maybeSingle();
  return (data as PRD) ?? null;
}

async function getIncrement(
  supabase: SupabaseClient,
  incrementId: string
): Promise<ProjectIncrement | null> {
  const { data, error } = await supabase
    .from("project_increments")
    .select("*")
    .eq("id", incrementId)
    .maybeSingle();
  if (error || !data) return null;
  return data as ProjectIncrement;
}

async function releaseAsFailed(
  supabase: SupabaseClient,
  sectionId: string,
  message: string
): Promise<void> {
  await supabase
    .from("prd_increment_sections")
    .update({ status: "failed", last_error: message })
    .eq("id", sectionId);
}

export class PrdIncrementEngine {
  /**
   * يحجز القفل: بينشئ (أو يعيد استخدام) صف القسم وينقله لـ generating.
   * بيرجّع معرّف الصف لو الحجز نجح، و`null` لو فيه توليد شغّال بالفعل.
   */
  static async tryClaim(projectId: string, incrementId: string): Promise<string | null> {
    const supabase = createServiceClient();

    const { data: existing, error: readErr } = await supabase
      .from("prd_increment_sections")
      .select("id, status, updated_at, order_index")
      .eq("increment_id", incrementId)
      .maybeSingle();

    if (readErr && isMissingTable(readErr)) {
      console.warn(
        "[PRDIncrement] جدول prd_increment_sections غير موجود — طبّق هجرة 0070."
      );
      return null;
    }

    if (existing) {
      const isStale =
        existing.status === "generating" &&
        Date.now() - new Date(existing.updated_at as string).getTime() > STALE_LOCK_MS;
      if (existing.status === "generating" && !isStale) return null;

      const { error } = await supabase
        .from("prd_increment_sections")
        .update({ status: "generating", last_error: null })
        .eq("id", existing.id);
      if (error) return null;
      return existing.id as string;
    }

    // ترتيب القسم = عدد الأقسام الموجودة، فالزيادة الأحدث تظهر في الآخر.
    const { count } = await supabase
      .from("prd_increment_sections")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId);

    const { data: created, error: insertErr } = await supabase
      .from("prd_increment_sections")
      .insert({
        project_id: projectId,
        increment_id: incrementId,
        order_index: count ?? 0,
        status: "generating",
      })
      .select("id")
      .single();
    if (insertErr || !created) return null;
    return created.id as string;
  }

  /**
   * جوهر التوليد — بيفترض إن القفل محجوز. بيتشغّل في الخلفية عبر after()،
   * والواجهة بتتابع الحالة بالـ Polling زي باقي المولّدات.
   */
  static async runCore(
    projectId: string,
    incrementId: string,
    sectionId: string,
    actorId?: string
  ): Promise<void> {
    const supabase = createServiceClient();

    try {
      const increment = await getIncrement(supabase, incrementId);
      if (!increment) {
        await releaseAsFailed(supabase, sectionId, "الزيادة غير موجودة.");
        return;
      }

      const prd = await getPrdOrNull(supabase, projectId);
      if (!prd || !prd.overview.trim()) {
        await releaseAsFailed(
          supabase,
          sectionId,
          "لا يوجد PRD أساسي لهذا المشروع — ولّد المستند الأساسي أولاً، بعدها الزيادات تتضاف عليه."
        );
        return;
      }

      const { data: projectRow } = await supabase
        .from("projects")
        .select("name")
        .eq("id", projectId)
        .maybeSingle();

      const prompt = buildPrdIncrementPrompt({
        projectName: (projectRow?.name as string | undefined) ?? "المشروع",
        incrementTitle: increment.title,
        incrementSummary: increment.summary,
        sourceLabel: SOURCE_LABELS[increment.source_type] ?? increment.source_type,
        delta: increment.delta,
        existingPrd: prd,
      });

      const response = await executeAIWithRateLimitWait(AITaskType.PRD_INCREMENT_SECTION, prompt, {
        actorId,
        projectId,
      });

      if (!response.success) {
        const friendly =
          response.error?.code === "RATE_LIMIT"
            ? friendlyAiErrorMessage("RATE_LIMIT", response.error?.message ?? "")
            : response.error?.message ?? "فشل توليد قسم الزيادة.";
        await releaseAsFailed(supabase, sectionId, friendly);
        return;
      }

      const validation = validatePrdIncrementSection(response.output);
      if (!validation.ok) {
        console.error(
          `[PRDIncrement] Validation failed for increment ${incrementId}: ${truncateForLog(validation.reason)}`
        );
        await releaseAsFailed(supabase, sectionId, "لم نتمكن من فهم نتيجة التوليد.");
        return;
      }

      await supabase
        .from("prd_increment_sections")
        .update({
          title: increment.title,
          content: validation.data,
          status: "ready",
          last_error: null,
          generated_from_brain_version: increment.brain_version,
          created_by: actorId ?? null,
        })
        .eq("id", sectionId);

      await setIncrementStatus(incrementId, "prd_drafted");
    } catch (err) {
      console.error(`[PRDIncrement] Unexpected failure for increment ${incrementId}:`, err);
      await releaseAsFailed(
        supabase,
        sectionId,
        err instanceof Error ? err.message : "حدث خطأ غير متوقع أثناء التوليد."
      );
    }
  }
}

const SOURCE_LABELS: Record<string, string> = {
  discovery_session: "جلسة اكتشاف جديدة",
  meeting: "اجتماع جديد",
  decision: "قرار جديد",
  file: "ملف مرفوع",
  recommendation: "توصية معتمدة",
  manual: "إدخال يدوي",
};
