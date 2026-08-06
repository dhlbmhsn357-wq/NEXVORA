import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import {
  evaluateRetention,
  summarizeRetention,
  type GovernableObject,
  type RetentionDecision,
  type RetentionPolicy,
} from "./retention";

/**
 * خدمة حوكمة المعرفة — سياسات دورة الحياة (الجزء الثامن).
 *
 * التقييم **مقترَح افتراضيًا**: الخدمة بتقول «دول مرشّحون للأرشفة/الحذف
 * ولهذه الأسباب»، والتنفيذ الفعلي فعل منفصل ومحروس. الحذف الصامت
 * للمعرفة خطر لا رجعة فيه.
 */

const UNDEFINED_TABLE = "42P01";

export async function listGovernancePolicies(
  projectId: string,
  client?: SupabaseClient
): Promise<RetentionPolicy[]> {
  const db = client ?? createServiceClient();
  const { data, error } = await db
    .from("knowledge_governance_policies")
    .select("policy_type, scope, enabled, enforcement, config")
    .eq("project_id", projectId);

  if (error) {
    if (error.code !== UNDEFINED_TABLE) {
      console.error(`[Governance] تعذّر قراءة السياسات: ${error.message}`);
    }
    return [];
  }
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    policyType: r.policy_type as RetentionPolicy["policyType"],
    scope: (r.scope as string) ?? "all",
    enabled: Boolean(r.enabled),
    enforcement: (r.enforcement as RetentionPolicy["enforcement"]) ?? "suggest",
    config: (r.config as RetentionPolicy["config"]) ?? {},
  }));
}

export async function setGovernancePolicy(
  projectId: string,
  policy: RetentionPolicy,
  actorId?: string | null,
  client?: SupabaseClient
): Promise<{ ok: boolean; message?: string }> {
  const db = client ?? createServiceClient();
  const { error } = await db.from("knowledge_governance_policies").upsert(
    {
      project_id: projectId,
      policy_type: policy.policyType,
      scope: policy.scope,
      enabled: policy.enabled,
      enforcement: policy.enforcement,
      config: policy.config,
      updated_by: actorId ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "project_id,policy_type,scope" }
  );
  if (error) {
    if (error.code === UNDEFINED_TABLE) return { ok: false, message: "جدول الحوكمة غير مطبَّق بعد (0080)." };
    return { ok: false, message: error.message };
  }
  return { ok: true };
}

export interface RetentionPlan {
  decisions: RetentionDecision[];
  summary: ReturnType<typeof summarizeRetention>;
}

/**
 * يبني خطة الاحتفاظ (dry-run): يقرأ العناصر ويقيّمها مقابل السياسات.
 * لا ينفّذ شيئًا — للعرض والموافقة.
 */
export async function buildRetentionPlan(
  projectId: string,
  nowMs: number,
  client?: SupabaseClient
): Promise<RetentionPlan> {
  const db = client ?? createServiceClient();
  const policies = await listGovernancePolicies(projectId, db);
  if (policies.length === 0) {
    return { decisions: [], summary: summarizeRetention([]) };
  }

  const { data } = await db
    .from("knowledge_items")
    .select("id, status, confidence, created_at, updated_at")
    .eq("project_id", projectId)
    .limit(5000);

  const objects: GovernableObject[] = ((data ?? []) as Array<Record<string, string | number>>).map((r) => {
    const created = Date.parse(String(r.created_at));
    const updated = Date.parse(String(r.updated_at));
    return {
      id: String(r.id),
      status: String(r.status),
      confidence: Number(r.confidence) || 0,
      ageDays: Number.isFinite(created) ? Math.floor((nowMs - created) / 86_400_000) : 0,
      idleDays: Number.isFinite(updated) ? Math.floor((nowMs - updated) / 86_400_000) : 0,
    };
  });

  const decisions = evaluateRetention(objects, policies);
  return { decisions, summary: summarizeRetention(decisions) };
}

/**
 * ينفّذ خطة الاحتفاظ — **يُطلب صراحةً**، ويحترم `automatic` فقط ما لم
 * يُمرَّر `force`. الأرشفة تحوّل الحالة لـ archived؛ الحذف يحوّلها لـ
 * rejected (حذف ناعم — لا نمسح فعلًا، نحافظ على التدقيق).
 */
export async function applyRetentionPlan(
  projectId: string,
  nowMs: number,
  options: { includeManual?: boolean } = {},
  client?: SupabaseClient
): Promise<{ archived: number; softDeleted: number }> {
  const db = client ?? createServiceClient();
  const { decisions } = await buildRetentionPlan(projectId, nowMs, db);

  const eligible = decisions.filter((d) => d.automatic || options.includeManual);
  const toArchive = eligible.filter((d) => d.action === "archive").map((d) => d.objectId);
  const toDelete = eligible.filter((d) => d.action === "delete").map((d) => d.objectId);

  let archived = 0;
  let softDeleted = 0;

  if (toArchive.length > 0) {
    const { error } = await db.from("knowledge_items").update({ status: "archived" }).in("id", toArchive);
    if (!error) archived = toArchive.length;
  }
  if (toDelete.length > 0) {
    // حذف ناعم: نحوّل الحالة لا نمسح — التدقيق والتراجع يفضلوا ممكنين.
    const { error } = await db.from("knowledge_items").update({ status: "rejected" }).in("id", toDelete);
    if (!error) softDeleted = toDelete.length;
  }

  return { archived, softDeleted };
}
