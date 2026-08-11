/**
 * NEXVORA Handoff — Source Resolvers (0110)
 * =========================================
 * كل resolver يُرجع محتوى العنصر من مصدره المعتمَد داخل المشروع.
 * لا يعتمد على AI ولا خدمات خارجية. Deterministic hash عبر crypto.
 */
import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getLatestApprovedBrain } from "@/lib/brain-v2/service";
import { listRequirements } from "@/lib/product-definition/service";
import { listStories, listAcceptanceCriteria } from "@/lib/user-stories/service";
import { listScenarios } from "@/lib/evaluation/service";
import { getOrCreatePrd } from "@/lib/prd/versioning";
import { createClient } from "@/lib/supabase/server";

export type ResolvedStatus = "ready" | "missing" | "draft_only" | "not_approved";

export interface ResolvedSource {
  itemKey: string;
  sourceType: string;
  sourceVersion: string | null;
  sourceHash: string | null;
  contentUrl: string | null;
  contentText: string;
  contentRefType: string | null;
  contentRefId: string | null;
  status: ResolvedStatus;
  reason: string;
}

function hashList(entries: { id: string; updatedAt: string }[]): string {
  const sorted = entries
    .map((e) => `${e.id}:${e.updatedAt}`)
    .sort()
    .join("|");
  return createHash("sha256").update(sorted).digest("hex").slice(0, 32);
}

function empty(itemKey: string, sourceType: string, status: ResolvedStatus, reason: string): ResolvedSource {
  return {
    itemKey, sourceType,
    sourceVersion: null, sourceHash: null,
    contentUrl: null, contentText: "",
    contentRefType: null, contentRefId: null,
    status, reason,
  };
}

// ---------------------------------------------------------------------------
// problem_brief — من آخر Brain معتمَد (Executive Summary)
// ---------------------------------------------------------------------------
export async function resolveProblemBrief(
  supabase: SupabaseClient, projectId: string,
): Promise<ResolvedSource> {
  try {
    const brain = await getLatestApprovedBrain(supabase, projectId);
    if (!brain) return empty("problem_brief", "brain", "not_approved", "لا يوجد Brain معتمَد.");
    const content = brain.content as unknown as Record<string, { value?: unknown }>;
    const exec = content?.executive_summary?.value;
    const scope = content?.project_scope?.value as Record<string, unknown> | undefined;
    let text = "";
    if (typeof exec === "string" && exec.trim()) text = exec.trim();
    if (!text && scope) {
      const inScope = Array.isArray(scope.in_scope) ? (scope.in_scope as string[]).join("\n- ") : "";
      if (inScope) text = inScope;
    }
    if (!text) return empty("problem_brief", "brain", "missing", "الملخّص التنفيذي في الـ Brain فارغ.");
    return {
      itemKey: "problem_brief",
      sourceType: "brain",
      sourceVersion: String(brain.version),
      sourceHash: createHash("sha256").update(text).digest("hex").slice(0, 32),
      contentUrl: null,
      contentText: text.slice(0, 2000),
      contentRefType: "brain_document",
      contentRefId: brain.id,
      status: "ready",
      reason: `Brain v${brain.version} معتمَد.`,
    };
  } catch (e) {
    return empty("problem_brief", "brain", "missing", e instanceof Error ? e.message : "تعذّر الوصول للـ Brain.");
  }
}

// ---------------------------------------------------------------------------
// scope_mvp — Requirements ذات priority='must'
// ---------------------------------------------------------------------------
export async function resolveScopeMvp(
  _supabase: SupabaseClient, projectId: string,
): Promise<ResolvedSource> {
  try {
    const reqs = await listRequirements(projectId);
    const must = reqs.filter((r) => r.priority === "must");
    if (must.length === 0) {
      return empty("scope_mvp", "requirements", "missing", "لا يوجد متطلبات priority=must.");
    }
    const bullets = must.map((r) => `- ${r.code ?? ""} ${r.title}`.trim()).join("\n");
    const hash = hashList(must.map((r) => ({ id: r.id, updatedAt: r.updatedAt })));
    return {
      itemKey: "scope_mvp",
      sourceType: "requirements",
      sourceVersion: `listhash:${hash}`,
      sourceHash: hash,
      contentUrl: null,
      contentText: bullets.slice(0, 4000),
      contentRefType: "requirements_list",
      contentRefId: null,
      status: "ready",
      reason: `${must.length} متطلب MVP.`,
    };
  } catch (e) {
    return empty("scope_mvp", "requirements", "missing", e instanceof Error ? e.message : "تعذّر تحميل المتطلبات.");
  }
}

// ---------------------------------------------------------------------------
// user_stories — status IN (approved,in_dev,done)
// ---------------------------------------------------------------------------
export async function resolveUserStories(
  _supabase: SupabaseClient, projectId: string,
): Promise<ResolvedSource> {
  try {
    const all = await listStories(projectId);
    const approved = all.filter((s) => s.status === "approved" || s.status === "in_dev" || s.status === "done");
    if (approved.length === 0) {
      const draftCount = all.filter((s) => s.status === "draft" || s.status === "in_review").length;
      return empty(
        "user_stories", "stories",
        draftCount > 0 ? "draft_only" : "missing",
        draftCount > 0 ? `${draftCount} قصّة مسودّة/قيد المراجعة فقط.` : "لا توجد قصص مستخدم.",
      );
    }
    const bullets = approved.map((s) => `- ${s.code ?? ""} ${s.title}`.trim()).join("\n");
    const hash = hashList(approved.map((s) => ({ id: s.id, updatedAt: s.updatedAt })));
    return {
      itemKey: "user_stories",
      sourceType: "stories",
      sourceVersion: `listhash:${hash}`,
      sourceHash: hash,
      contentUrl: null,
      contentText: `${approved.length} قصّة معتمَدة:\n${bullets}`.slice(0, 4000),
      contentRefType: "stories_list",
      contentRefId: null,
      status: "ready",
      reason: `${approved.length} قصّة معتمَدة.`,
    };
  } catch (e) {
    return empty("user_stories", "stories", "missing", e instanceof Error ? e.message : "تعذّر تحميل القصص.");
  }
}

// ---------------------------------------------------------------------------
// acceptance_criteria — status IN (approved, verified)
// ---------------------------------------------------------------------------
export async function resolveAcceptanceCriteria(
  _supabase: SupabaseClient, projectId: string,
): Promise<ResolvedSource> {
  try {
    const all = await listAcceptanceCriteria(projectId);
    const approved = all.filter((a) => a.status === "approved" || a.status === "verified");
    if (approved.length === 0) {
      const draftCount = all.filter((a) => a.status === "draft").length;
      return empty(
        "acceptance_criteria", "ac",
        draftCount > 0 ? "draft_only" : "missing",
        draftCount > 0 ? `${draftCount} AC مسودّة فقط.` : "لا توجد AC.",
      );
    }
    const bullets = approved.map((a) => `- ${a.code ?? ""} ${a.title || `${a.givenClause} / ${a.whenClause} / ${a.thenClause}`}`.trim()).join("\n");
    const hash = hashList(approved.map((a) => ({ id: a.id, updatedAt: a.updatedAt })));
    return {
      itemKey: "acceptance_criteria",
      sourceType: "ac",
      sourceVersion: `listhash:${hash}`,
      sourceHash: hash,
      contentUrl: null,
      contentText: `${approved.length} معيار معتمَد:\n${bullets}`.slice(0, 4000),
      contentRefType: "ac_list",
      contentRefId: null,
      status: "ready",
      reason: `${approved.length} AC معتمَد.`,
    };
  } catch (e) {
    return empty("acceptance_criteria", "ac", "missing", e instanceof Error ? e.message : "تعذّر تحميل AC.");
  }
}

// ---------------------------------------------------------------------------
// prototype_link — projects.staging_url
// ---------------------------------------------------------------------------
export async function resolvePrototypeLink(
  supabase: SupabaseClient, projectId: string,
): Promise<ResolvedSource> {
  try {
    const { data } = await supabase.from("projects").select("staging_url").eq("id", projectId).maybeSingle();
    const url = (data?.staging_url as string | null | undefined)?.trim();
    if (!url) return empty("prototype_link", "staging_url", "missing", "لا يوجد staging_url على المشروع.");
    return {
      itemKey: "prototype_link",
      sourceType: "staging_url",
      sourceVersion: null,
      sourceHash: createHash("sha256").update(url).digest("hex").slice(0, 32),
      contentUrl: url,
      contentText: "",
      contentRefType: "project",
      contentRefId: projectId,
      status: "ready",
      reason: "رابط Prototype/Staging مضبوط.",
    };
  } catch (e) {
    return empty("prototype_link", "staging_url", "missing", e instanceof Error ? e.message : "تعذّر قراءة المشروع.");
  }
}

// ---------------------------------------------------------------------------
// prd_final — PRD.status='approved'
// ---------------------------------------------------------------------------
export async function resolvePrdFinal(
  supabase: SupabaseClient, projectId: string,
): Promise<ResolvedSource> {
  try {
    const prd = await getOrCreatePrd(supabase, projectId);
    if (prd.status !== "approved") {
      return empty(
        "prd_final", "prd",
        prd.status === "draft" ? "draft_only" : "not_approved",
        `PRD حالته: ${prd.status || "draft"}.`,
      );
    }
    const printUrl = `/prd-print/${projectId}`;
    return {
      itemKey: "prd_final",
      sourceType: "prd",
      sourceVersion: String(prd.version),
      sourceHash: createHash("sha256").update(`prd:${prd.id}:v${prd.version}`).digest("hex").slice(0, 32),
      contentUrl: printUrl,
      contentText: `PRD v${prd.version} — معتمَد.`,
      contentRefType: "prd",
      contentRefId: prd.id,
      status: "ready",
      reason: `PRD v${prd.version} معتمَد.`,
    };
  } catch (e) {
    return empty("prd_final", "prd", "missing", e instanceof Error ? e.message : "تعذّر تحميل الـ PRD.");
  }
}

// ---------------------------------------------------------------------------
// product_evaluation_guide — evaluation_scenarios count>=1 (proxy)
// ---------------------------------------------------------------------------
export async function resolveProductEvaluationGuide(
  _supabase: SupabaseClient, projectId: string,
): Promise<ResolvedSource> {
  try {
    const scenarios = await listScenarios(projectId);
    if (scenarios.length === 0) {
      return empty("product_evaluation_guide", "evaluation", "missing", "لا توجد سيناريوهات تقييم.");
    }
    const bullets = scenarios.map((s) => `- ${s.code ?? ""} ${s.title}`.trim()).join("\n");
    const hash = hashList(scenarios.map((s) => ({ id: s.id, updatedAt: s.updatedAt })));
    return {
      itemKey: "product_evaluation_guide",
      sourceType: "evaluation",
      sourceVersion: `listhash:${hash}`,
      sourceHash: hash,
      contentUrl: null,
      contentText: `${scenarios.length} سيناريو تقييم:\n${bullets}`.slice(0, 4000),
      contentRefType: "evaluation_scenarios",
      contentRefId: null,
      status: "ready",
      reason: `${scenarios.length} سيناريو.`,
    };
  } catch (e) {
    return empty("product_evaluation_guide", "evaluation", "missing", e instanceof Error ? e.message : "تعذّر تحميل السيناريوهات.");
  }
}

// ---------------------------------------------------------------------------
// resolveAllSources — resolves all 7 mandatory items in parallel
// ---------------------------------------------------------------------------
export async function resolveAllSources(
  supabase: SupabaseClient, projectId: string,
): Promise<ResolvedSource[]> {
  const [pb, sm, us, ac, pl, pf, eg] = await Promise.all([
    resolveProblemBrief(supabase, projectId),
    resolveScopeMvp(supabase, projectId),
    resolveUserStories(supabase, projectId),
    resolveAcceptanceCriteria(supabase, projectId),
    resolvePrototypeLink(supabase, projectId),
    resolvePrdFinal(supabase, projectId),
    resolveProductEvaluationGuide(supabase, projectId),
  ]);
  return [pb, sm, us, ac, pl, pf, eg];
}

/** Helper — creates a supabase server client and resolves for callers that don't have one. */
export async function resolveAllSourcesForProject(projectId: string): Promise<ResolvedSource[]> {
  const supabase = await createClient();
  return resolveAllSources(supabase as unknown as SupabaseClient, projectId);
}
