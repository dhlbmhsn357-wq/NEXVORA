"use server";

import { requireRole } from "@/lib/auth/rbac";
import { createServiceClient } from "@/lib/supabase/service";
import { processNextDomain } from "@/lib/knowledge-hub/processing-service";
import { retrieveContext, syncMemoryBatch, type RetrievalResult } from "@/lib/knowledge-hub/memory-service";
import { analyzeImpact, type ImpactReport } from "@/lib/knowledge-hub/impact-service";
import { runIntelligence } from "@/lib/knowledge-hub/intelligence-service";
import { priorityQuadrant, type PriorityQuadrant } from "@/lib/knowledge-hub/intelligence/insight-model";
import {
  listEffectivePolicies,
  setUpdatePolicy,
} from "@/lib/knowledge-hub/incremental/policy-service";
import type { ModuleKey, UpdatePolicy } from "@/lib/knowledge-hub/incremental/plan-update";
import type { TraversalDirection } from "@/lib/knowledge-hub/retrieval/impact-graph";

/**
 * واجهة السياق الذكي — الجزء الرابع.
 *
 * دي **الباب الوحيد** اللي الواجهة بتكلّم بيه محرّكات المعالجة والذاكرة
 * والأثر. كلها بتتحقّق من الصلاحية الأول، وكلها لكل مشروع (المعرفة
 * معزولة بالمشروع من ٠٠٧١).
 *
 * التشغيل **مباشر لا عبر الطابور** هنا: الأزرار دي تفاعلية والمستخدم
 * مستنّي النتيجة. العامل (`knowledge.processing`) بيخدم التشغيل الخلفي
 * واسع النطاق؛ ده للتشغيل اليدوي المحدود.
 */

const ALLOWED = ["owner", "admin", "supervisor"] as const;

/**
 * يشغّل جولة معالجة واحدة (مجال واحد) على المشروع.
 *
 * التشغيل بمجال لكل نداء يحافظ على الاستجابة سريعة؛ الواجهة بتنادي
 * تاني لو `remainingDomains > 0`.
 */
export async function runKnowledgeProcessing(
  projectId: string
): Promise<{ ok: boolean; message?: string; domain?: string; remaining?: number; completeness?: number }> {
  const auth = await requireRole([...ALLOWED]);
  if (!auth.ok) return { ok: false, message: auth.message };
  if (!projectId) return { ok: false, message: "المشروع مطلوب." };

  const outcome = await processNextDomain(projectId, auth.userId ?? null);

  if (outcome.status === "idle") {
    return { ok: true, message: "لا توجد معرفة جديدة للمعالجة.", remaining: 0 };
  }
  if (outcome.status === "failed") {
    return { ok: false, message: outcome.message ?? "فشلت المعالجة." };
  }
  return {
    ok: true,
    domain: outcome.domain,
    remaining: outcome.remainingDomains,
    completeness: outcome.completeness,
  };
}

/**
 * يفهرس دفعة من الكائنات دلاليًا. الواجهة بتنادي تاني لو `remaining > 0`.
 */
export async function runMemorySync(
  projectId: string
): Promise<{ ok: boolean; message?: string; embedded?: number; remaining?: number }> {
  const auth = await requireRole([...ALLOWED]);
  if (!auth.ok) return { ok: false, message: auth.message };
  if (!projectId) return { ok: false, message: "المشروع مطلوب." };

  const outcome = await syncMemoryBatch(projectId);
  if (outcome.status === "idle") {
    return { ok: true, message: "لا توجد كائنات للفهرسة.", remaining: 0 };
  }
  return { ok: true, embedded: outcome.embedded, remaining: outcome.remaining };
}

/**
 * يسترجع سياقًا دلاليًا مرتَّبًا مضغوطًا لسؤال — قلب واجهة السياق.
 */
export async function getKnowledgeContext(
  projectId: string,
  query: string
): Promise<{ ok: boolean; message?: string; result?: RetrievalResult }> {
  const auth = await requireRole([...ALLOWED]);
  if (!auth.ok) return { ok: false, message: auth.message };
  if (!projectId) return { ok: false, message: "المشروع مطلوب." };

  const result = await retrieveContext(projectId, query);
  if (!result.ok) return { ok: false, message: result.message };
  return { ok: true, result };
}

/**
 * يحلّل أثر (downstream) أو اعتماد (upstream) عقدة.
 */
export async function getImpactAnalysis(
  projectId: string,
  node: { type: string; id: string },
  direction: TraversalDirection = "downstream"
): Promise<{ ok: boolean; message?: string; report?: ImpactReport }> {
  const auth = await requireRole([...ALLOWED]);
  if (!auth.ok) return { ok: false, message: auth.message };
  if (!projectId || !node?.id) return { ok: false, message: "المشروع والعقدة مطلوبان." };

  const report = await analyzeImpact(projectId, node, { direction });
  return { ok: true, report };
}

// ============================================================
// الطبقة الاستشارية (الجزء الخامس)
// ============================================================

/**
 * يشغّل جولة ذكاء كاملة: قدرات ناقصة + درجات + رؤى استشارية.
 */
export async function runKnowledgeIntelligence(
  projectId: string
): Promise<{ ok: boolean; message?: string; insights?: number; unavailable?: boolean }> {
  const auth = await requireRole([...ALLOWED]);
  if (!auth.ok) return { ok: false, message: auth.message };
  if (!projectId) return { ok: false, message: "المشروع مطلوب." };

  const outcome = await runIntelligence(projectId, auth.userId ?? null);
  if (outcome.status === "unavailable") {
    return { ok: true, unavailable: true, message: outcome.message };
  }
  if (outcome.status === "failed") {
    return { ok: false, message: outcome.message ?? "فشل التحليل." };
  }
  return { ok: true, insights: outcome.insightsWritten ?? 0 };
}

export interface InsightRow {
  id: string;
  insight_type: string;
  title: string;
  detail: string;
  rationale: string;
  impact: string;
  module: string | null;
  severity: string;
  effort: number;
  confidence: number;
  status: string;
  quadrant: PriorityQuadrant;
}

export interface IntelligenceView {
  insights: InsightRow[];
  scores: {
    maturity: number;
    projectReadiness: number;
    architectureReadiness: number;
    requirementCoverage: number;
    computedAt: string;
  } | null;
}

/**
 * يقرأ الرؤى المفتوحة وأحدث درجات — مع تصنيف كل رأي في ربع الأولوية.
 */
export async function getKnowledgeIntelligence(
  projectId: string
): Promise<{ ok: boolean; message?: string; data?: IntelligenceView }> {
  const auth = await requireRole([...ALLOWED]);
  if (!auth.ok) return { ok: false, message: auth.message };
  if (!projectId) return { ok: false, message: "المشروع مطلوب." };

  const db = createServiceClient();
  const [insightsRes, scoresRes] = await Promise.all([
    db.from("knowledge_insights").select("*").eq("project_id", projectId).eq("status", "open").order("severity").limit(200),
    db.from("knowledge_intelligence_scores").select("*").eq("project_id", projectId).order("computed_at", { ascending: false }).limit(1),
  ]);

  // الجدول غير مطبَّق → نرجّع فارغًا بلا فشل.
  if (insightsRes.error && insightsRes.error.code === "42P01") {
    return { ok: true, data: { insights: [], scores: null } };
  }

  const insights: InsightRow[] = (
    (insightsRes.data ?? []) as Array<Record<string, unknown>>
  ).map((r) => ({
    id: r.id as string,
    insight_type: r.insight_type as string,
    title: r.title as string,
    detail: r.detail as string,
    rationale: r.rationale as string,
    impact: r.impact as string,
    module: (r.module as string | null) ?? null,
    severity: r.severity as string,
    effort: (r.effort as number) ?? 50,
    confidence: (r.confidence as number) ?? 60,
    status: r.status as string,
    quadrant: priorityQuadrant((r.severity as never) ?? "medium", (r.effort as number) ?? 50),
  }));

  const scoreRow = (scoresRes.data ?? [])[0] as Record<string, unknown> | undefined;
  const scores = scoreRow
    ? {
        maturity: scoreRow.maturity_score as number,
        projectReadiness: scoreRow.project_readiness as number,
        architectureReadiness: scoreRow.architecture_readiness as number,
        requirementCoverage: scoreRow.requirement_coverage as number,
        computedAt: scoreRow.computed_at as string,
      }
    : null;

  return { ok: true, data: { insights, scores } };
}

/**
 * موافقة/رفض/حسم رأي — قرار بشري (Explainability لا يلغي حكم الإنسان).
 */
export async function setInsightStatus(
  insightId: string,
  status: "accepted" | "dismissed" | "resolved",
  reason?: string
): Promise<{ ok: boolean; message?: string }> {
  const auth = await requireRole([...ALLOWED]);
  if (!auth.ok) return { ok: false, message: auth.message };
  if (!insightId) return { ok: false, message: "الرأي مطلوب." };

  const db = createServiceClient();
  const { error } = await db
    .from("knowledge_insights")
    .update({
      status,
      decided_by: auth.userId ?? null,
      decided_at: new Date().toISOString(),
      decision_reason: reason ?? null,
    })
    .eq("id", insightId);

  if (error) return { ok: false, message: error.message };
  return { ok: true };
}

// ============================================================
// سياسات التحديث لكل موديول (الجزء السادس)
// ============================================================

export async function getUpdatePoliciesView(
  projectId: string
): Promise<{ ok: boolean; message?: string; policies?: Array<{ module: ModuleKey; policy: UpdatePolicy; isDefault: boolean }> }> {
  const auth = await requireRole([...ALLOWED]);
  if (!auth.ok) return { ok: false, message: auth.message };
  if (!projectId) return { ok: false, message: "المشروع مطلوب." };

  const policies = await listEffectivePolicies(projectId);
  return { ok: true, policies };
}

export async function updateModulePolicy(
  projectId: string,
  moduleKey: ModuleKey,
  policy: UpdatePolicy
): Promise<{ ok: boolean; message?: string }> {
  const auth = await requireRole([...ALLOWED]);
  if (!auth.ok) return { ok: false, message: auth.message };
  if (!projectId) return { ok: false, message: "المشروع مطلوب." };

  return setUpdatePolicy(projectId, moduleKey, policy, auth.userId ?? null);
}
