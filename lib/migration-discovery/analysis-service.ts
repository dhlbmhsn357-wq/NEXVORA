import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { AIService } from "@/lib/ai/service";
import { AITaskType } from "@/lib/ai/types";
import { buildMigrationSourceAnalysisPrompt } from "@/lib/ai/prompts/migration-source-analysis";
import { validateMigrationSourceAnalysis } from "@/lib/ai/validation/migration-source-analysis";
import { sourceTypeLabel } from "./source-types";
import { parseSourceContent } from "./connectors";
import { analyzeSchema, summarizeForPrompt } from "./analysis-engine";
import type { AnalysisOutcome, MigrationSourceRow } from "./types";

/**
 * خدمة التحليل — تُنسّق تشغيلة اكتشاف كاملة لمصدر:
 * محتوى → بنية مُطبَّعة → تحليل حتمي (كيانات/علاقات/جودة/مخاطر/جاهزية) →
 * حفظ اللقطة والكيانات والعلاقات → تهذيب الذكاء الاصطناعي (اختياري) → تقرير.
 *
 * **لا ترحيل بيانات إطلاقًا** — تبني معرفة مرجعية فقط. رشيقة: أي فشل يُسجَّل
 * على اللقطة والواجهة تقرأه بالـPolling، بلا كسر.
 */

const UNDEFINED_TABLE = "42P01";

function isMissingTable(error: { code?: string } | null): boolean {
  return error?.code === UNDEFINED_TABLE;
}

export async function runSourceAnalysis(
  sourceId: string,
  content: string,
  actorId: string | null,
  client?: SupabaseClient
): Promise<AnalysisOutcome> {
  const db = client ?? createServiceClient();

  const srcRes = await db.from("migration_sources").select("*").eq("id", sourceId).maybeSingle();
  if (srcRes.error && isMissingTable(srcRes.error)) {
    return { ok: false, message: "جدول المصادر غير مطبَّق بعد (طبّق ترحيل 0083)." };
  }
  if (!srcRes.data) return { ok: false, message: "المصدر غير موجود." };
  const source = srcRes.data as MigrationSourceRow;

  // 1) بنية مُطبَّعة من المحتوى.
  const parsed = parseSourceContent(source.source_type, source.connection_mode, content, source.name);
  if (!parsed.ok || parsed.schema.objects.length === 0) {
    await db.from("migration_sources").update({ status: "failed" }).eq("id", sourceId);
    return { ok: false, message: parsed.issues[0] ?? "تعذّر استخراج البنية من المحتوى." };
  }

  // 2) لقطة جديدة (إصدار تالٍ).
  const lastVer = await db
    .from("migration_snapshots")
    .select("version")
    .eq("source_id", sourceId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  const version = ((lastVer.data as { version: number } | null)?.version ?? 0) + 1;

  const analysis = analyzeSchema(parsed.schema);

  const snapRes = await db
    .from("migration_snapshots")
    .insert({
      source_id: sourceId,
      project_id: source.project_id,
      version,
      status: "analyzing",
      progress: 60,
      raw_schema: parsed.schema,
      stats: analysis.stats,
      triggered_by: actorId,
    })
    .select("id")
    .maybeSingle();
  if (snapRes.error || !snapRes.data) {
    await db.from("migration_sources").update({ status: "failed" }).eq("id", sourceId);
    return { ok: false, message: snapRes.error?.message ?? "فشل إنشاء اللقطة." };
  }
  const snapshotId = (snapRes.data as { id: string }).id;

  // 3) حفظ الكيانات والعلاقات.
  const entityRows = analysis.entities.map((e) => ({
    snapshot_id: snapshotId,
    source_id: sourceId,
    canonical_entity: e.entity,
    display_name: e.displayName,
    data_class: e.dataClass,
    source_objects: e.sourceObjects,
    confidence: e.confidence,
  }));
  if (entityRows.length > 0) await db.from("migration_entities").insert(entityRows);

  const relRows = analysis.dependencies.relationships.map((r) => ({
    snapshot_id: snapshotId,
    source_id: sourceId,
    from_object: r.from,
    to_object: r.to,
    kind: r.kind,
    via_columns: r.viaColumns,
    confidence: r.confidence,
  }));
  if (relRows.length > 0) await db.from("migration_relationships").insert(relRows);

  // 4) تهذيب الذكاء الاصطناعي (اختياري — رشيق لو فشل).
  let aiSummary = "";
  let systemType = analysis.domains.systemType;
  let humanReview = analysis.readiness.humanReviewNeeded;
  try {
    const prompt = buildMigrationSourceAnalysisPrompt(summarizeForPrompt(analysis), source.name, sourceTypeLabel(source.source_type));
    const resp = await AIService.execute(AITaskType.MIGRATION_SOURCE_ANALYSIS, prompt, { actorId: actorId ?? undefined, projectId: source.project_id ?? undefined });
    if (resp.success) {
      const v = validateMigrationSourceAnalysis(resp.output);
      if (v.ok) {
        systemType = v.data.system_type || systemType;
        humanReview = v.data.human_review_items.length > 0 ? v.data.human_review_items : humanReview;
        aiSummary = [
          `نوع النظام: ${v.data.system_type}`,
          v.data.key_modules.length > 0 ? `أهم الوحدات: ${v.data.key_modules.join("، ")}` : "",
          v.data.risk_narrative,
          v.data.migration_readiness_note,
        ]
          .filter(Boolean)
          .join("\n\n");
      }
    }
  } catch {
    /* التحليل الحتمي كافٍ وحده — الذكاء الاصطناعي تحسين لا شرط */
  }

  // 5) التقرير.
  const reportDetail = {
    quality: analysis.quality,
    risks: analysis.risks,
    businessFlows: analysis.businessFlows,
    coreEntities: analysis.dependencies.coreEntities,
    criticalTables: analysis.dependencies.criticalTables,
    unusedTables: analysis.dependencies.unusedTables,
    deadTables: analysis.dependencies.deadTables,
    circularChains: analysis.dependencies.circularChains,
    complexity: analysis.complexity,
    domainScores: analysis.domains.scores,
    humanReviewNeeded: humanReview,
    readinessExplanation: analysis.readiness.explanation,
  };

  const reportRes = await db
    .from("migration_reports")
    .insert({
      snapshot_id: snapshotId,
      source_id: sourceId,
      project_id: source.project_id,
      detected_domains: analysis.domains.domains,
      system_type: systemType,
      quality_score: analysis.quality.overall,
      risk_score: analysis.readiness.riskScore,
      readiness_score: analysis.readiness.score,
      detail: reportDetail,
      ai_summary: aiSummary,
    })
    .select("id")
    .maybeSingle();

  await db.from("migration_snapshots").update({ status: "completed", progress: 100 }).eq("id", snapshotId);
  await db.from("migration_sources").update({ status: "analyzed" }).eq("id", sourceId);

  return { ok: true, snapshotId, reportId: (reportRes.data as { id: string } | null)?.id };
}

/** أحدث تقرير لمصدر — للعرض في صفحة التفاصيل. */
export async function getLatestReport(sourceId: string, client?: SupabaseClient) {
  const db = client ?? createServiceClient();
  const { data, error } = await db
    .from("migration_reports")
    .select("*")
    .eq("source_id", sourceId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return data;
}

/** كيانات وعلاقات لقطة — للعرض. */
export async function getSnapshotDetail(snapshotId: string, client?: SupabaseClient) {
  const db = client ?? createServiceClient();
  const [entities, relationships] = await Promise.all([
    db.from("migration_entities").select("*").eq("snapshot_id", snapshotId).order("confidence", { ascending: false }),
    db.from("migration_relationships").select("*").eq("snapshot_id", snapshotId),
  ]);
  return {
    entities: (entities.data ?? []) as unknown[],
    relationships: (relationships.data ?? []) as unknown[],
  };
}
