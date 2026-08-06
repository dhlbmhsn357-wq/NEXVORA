import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { fuseKnowledge, formatFusedContextForPrompt, type FusionResult, type KnowledgeFragment } from "./fusion-model";
import { listProjectPackages } from "../selection-service";

/**
 * محرّك الدمج — **طبقة المعرفة الموحّدة** (الجزء الموسّع).
 *
 * ## المكان في المنظومة
 *
 * ده الطبقة اللي المراحل التالية (Project Brain، PRD، Recommendations،
 * Architecture...) المفروض تقرأ منها بدل معرفة المشروع وحدها. بيجمع:
 *
 * - **معرفة المشروع**: قواعد عمل، متطلبات، قرارات، مخاطر (من ٠٠٧٧)
 * - **معرفة المجال**: بنود الحزم المختارة للمشروع (من ٠٠٨١)
 * - **الأوزان**: من `knowledge_fusion_weights` (تجاوزات الافتراضي)
 *
 * ويرجّع نموذجًا واحدًا مرجَّحًا + التعارضات المعروضة (لا المستبدَلة).
 */

const UNDEFINED_TABLE = "42P01";

export interface FusedContext extends FusionResult {
  /** إحصاءات للعرض — الطبقات الثلاث. */
  stats: {
    projectFragments: number;
    domainFragments: number;
    orgFragments: number;
    conflicts: number;
  };
}

export async function buildFusedContext(
  projectId: string,
  client?: SupabaseClient
): Promise<FusedContext> {
  const db = client ?? createServiceClient();

  const overrides = await loadWeightOverrides(db);
  const fragments: KnowledgeFragment[] = [];

  // --- معرفة المشروع (أوزان عالية: قواعد عمل، قرارات) ---
  let projectCount = 0;
  try {
    const [rules, requirements, decisions] = await Promise.all([
      db.from("knowledge_business_rules").select("name, condition, action").eq("project_id", projectId).eq("status", "active").limit(500),
      db.from("knowledge_requirements").select("statement, module").eq("project_id", projectId).eq("status", "active").limit(500),
      db.from("knowledge_decisions").select("decision, affected_modules").eq("project_id", projectId).eq("status", "active").limit(300),
    ]);
    for (const r of (rules.data ?? []) as Array<{ name: string; condition: string; action: string }>) {
      fragments.push({ key: r.name || r.condition, statement: `${r.condition} ⇐ ${r.action}`, source: "business_rule", kind: "business_rule" });
      projectCount += 1;
    }
    for (const q of (requirements.data ?? []) as Array<{ statement: string; module: string | null }>) {
      fragments.push({ key: q.module || q.statement.slice(0, 40), statement: q.statement, source: "document", kind: "requirement" });
      projectCount += 1;
    }
    for (const d of (decisions.data ?? []) as Array<{ decision: string; affected_modules: string[] }>) {
      fragments.push({ key: d.decision.slice(0, 40), statement: d.decision, source: "client_decision", kind: "decision" });
      projectCount += 1;
    }
  } catch {
    /* جداول المشروع قد تكون غير مطبَّقة */
  }

  // --- معرفة المجال (وزن domain_standard / best_practice) ---
  let domainCount = 0;
  const projectPackages = await listProjectPackages(projectId, db);
  if (projectPackages.length > 0) {
    const packageIds = projectPackages.map((p) => p.package_id);
    const { data: items, error } = await db
      .from("domain_package_items")
      .select("item_type, title, content")
      .in("package_id", packageIds)
      .limit(2000);
    if (!error) {
      for (const it of (items ?? []) as Array<{ item_type: string; title: string; content: string }>) {
        const source = it.item_type === "best_practice" ? "best_practice" : "domain_standard";
        fragments.push({ key: it.title, statement: it.content || it.title, source, kind: it.item_type });
        domainCount += 1;
      }
    }
  }

  // --- الذاكرة المؤسسية (الطبقة الثالثة، وزن org_memory) ---
  //
  // قراءة مباشرة لجدول الخبرات (٠٨٢) لا استيراد وحدة — الطبقة الأعلى لا
  // تُستورَد هنا لتفادي دورة طبقات. رشيق لو الجدول غير مطبَّق.
  let orgCount = 0;
  try {
    const project = await db.from("projects").select("domain").eq("id", projectId).maybeSingle();
    const domain = ((project.data?.domain as string | null) ?? "generic").trim() || "generic";
    // الخبرات المناسبة: نفس المجال + العامة + العابرة للمجالات.
    const { data: experiences, error } = await db
      .from("org_experiences")
      .select("title, content, experience_type, source_project_ids")
      .eq("status", "published")
      .in("domain", [domain, "general", "cross_domain"])
      .order("confidence", { ascending: false })
      .limit(200);
    if (!error) {
      for (const e of (experiences ?? []) as Array<{ title: string; content: string; experience_type: string; source_project_ids: string[] }>) {
        fragments.push({ key: e.title, statement: e.content || e.title, source: "org_memory", kind: e.experience_type });
        orgCount += 1;
      }
    }
  } catch {
    /* جدول الذاكرة المؤسسية غير مطبَّق بعد */
  }

  const result = fuseKnowledge(fragments, overrides);

  return {
    ...result,
    stats: {
      projectFragments: projectCount,
      domainFragments: domainCount,
      orgFragments: orgCount,
      conflicts: result.conflicts.length,
    },
  };
}

/**
 * كتلة السياق المدمج الجاهزة للإدراج في برومبتات التوليد (PRD، Project
 * Brain، ...) — **نقطة الوصل الوحيدة بين طبقة الدمج والمولّدات**. رشيقة
 * تمامًا: أي فشل (جداول غير مطبَّقة، مشروع بلا معرفة) يرجّع نصًّا فارغًا
 * فالمولّد يتصرّف كما قبل التوصيل بالضبط — لا يكسر توليدًا قائمًا أبدًا.
 */
export async function buildFusedKnowledgeBlock(
  projectId: string,
  client?: SupabaseClient
): Promise<{ text: string; stats: FusedContext["stats"] }> {
  try {
    const ctx = await buildFusedContext(projectId, client);
    return { text: formatFusedContextForPrompt(ctx), stats: ctx.stats };
  } catch (err) {
    console.error(`[Fusion] buildFusedKnowledgeBlock failed for project ${projectId}:`, err instanceof Error ? err.message : err);
    return { text: "", stats: { projectFragments: 0, domainFragments: 0, orgFragments: 0, conflicts: 0 } };
  }
}

async function loadWeightOverrides(db: SupabaseClient): Promise<Partial<Record<string, number>>> {
  try {
    const { data, error } = await db.from("knowledge_fusion_weights").select("source_type, weight");
    if (error) return {};
    const map: Partial<Record<string, number>> = {};
    for (const r of (data ?? []) as Array<{ source_type: string; weight: number }>) {
      map[r.source_type] = r.weight;
    }
    return map;
  } catch {
    return {};
  }
}

/** أوزان الدمج الحالية — للعرض والتعديل. */
export async function getFusionWeights(
  client?: SupabaseClient
): Promise<Array<{ source_type: string; weight: number }>> {
  const db = client ?? createServiceClient();
  const { data, error } = await db.from("knowledge_fusion_weights").select("source_type, weight").order("weight", { ascending: false });
  if (error) return [];
  return (data ?? []) as Array<{ source_type: string; weight: number }>;
}

export async function setFusionWeight(
  sourceType: string,
  weight: number,
  actorId: string | null,
  client?: SupabaseClient
): Promise<{ ok: boolean; message?: string }> {
  const db = client ?? createServiceClient();
  const { error } = await db.from("knowledge_fusion_weights").upsert(
    { source_type: sourceType, weight: Math.max(0, Math.min(100, Math.round(weight))), updated_by: actorId, updated_at: new Date().toISOString() },
    { onConflict: "source_type" }
  );
  if (error) {
    if (error.code === UNDEFINED_TABLE) return { ok: false, message: "جدول الأوزان غير مطبَّق بعد (0081)." };
    return { ok: false, message: error.message };
  }
  return { ok: true };
}
