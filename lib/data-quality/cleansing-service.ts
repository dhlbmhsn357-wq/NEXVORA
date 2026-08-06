import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { AIService } from "@/lib/ai/service";
import { AITaskType } from "@/lib/ai/types";
import { buildDataQualityPrompt } from "@/lib/ai/prompts/data-quality";
import { validateDataQuality } from "@/lib/ai/validation/data-quality";
import { parseDatasets } from "./dataset";
import { buildCleaningBlueprint, type CleaningBlueprint, type QualityIssue } from "./cleansing-engine";
import { needsReview } from "./confidence";

/**
 * خدمة التنظيف — تشغّل جودة البيانات على **الصفوف الفعلية** لمصدر:
 * محتوى → مجموعات → Cleaning Blueprint حتمي → تهذيب الذكاء الاصطناعي →
 * حفظ التشغيلة والمشاكل والتكرار ونسخة العمل (التصحيحات المقترَحة).
 *
 * **لا تعديل للأصل، لا تطبيق تلقائي.** الصفوف لا تُخزَّن — تُشتَقّ المشاكل
 * فقط. الثقة < ٩٥ → مراجعة المدير إلزامية.
 */

const UNDEFINED_TABLE = "42P01";
function isMissingTable(e: { code?: string } | null): boolean {
  return e?.code === UNDEFINED_TABLE;
}

export interface CleansingOutcome {
  ok: boolean;
  runId?: string;
  message?: string;
}

export async function runCleansing(
  sourceId: string,
  content: string,
  domain: string,
  actorId: string | null,
  client?: SupabaseClient
): Promise<CleansingOutcome> {
  const db = client ?? createServiceClient();

  const srcRes = await db.from("migration_sources").select("id, source_type, project_id, name").eq("id", sourceId).maybeSingle();
  if (srcRes.error && isMissingTable(srcRes.error)) return { ok: false, message: "جداول المرحلة ١ غير مطبَّقة (0083)." };
  if (!srcRes.data) return { ok: false, message: "المصدر غير موجود." };
  const source = srcRes.data as { id: string; source_type: string; project_id: string | null; name: string };

  const datasets = parseDatasets(source.source_type, content, source.name);
  const totalRows = Object.values(datasets).reduce((s, d) => s + d.rows.length, 0);
  if (totalRows === 0) return { ok: false, message: "لا صفوف قابلة للتحليل — ارفع ملف بيانات فعلية (CSV/JSON) لهذا المصدر." };

  const blueprint: CleaningBlueprint & { aiNote?: string } = buildCleaningBlueprint(datasets, domain || "generic");
  await applyAiRefinement(blueprint, db, actorId, source.project_id, domain || "generic");

  // إصدار تالٍ.
  const lastVer = await db.from("data_quality_runs").select("version").eq("source_id", sourceId).order("version", { ascending: false }).limit(1).maybeSingle();
  const version = ((lastVer.data as { version: number } | null)?.version ?? 0) + 1;

  const runRes = await db
    .from("data_quality_runs")
    .insert({
      source_id: sourceId,
      project_id: source.project_id,
      status: "completed",
      progress: 100,
      domain: domain || "generic",
      records: blueprint.stats.records,
      fields: blueprint.stats.fields,
      quality_score: blueprint.qualityScore,
      readiness_delta: blueprint.readinessDelta,
      report: { quality: blueprint.quality, ruleCounts: blueprint.ruleCounts, recommendations: blueprint.recommendations, stats: blueprint.stats },
      ai_summary: blueprint.aiNote ?? "",
      version,
      triggered_by: actorId,
    })
    .select("id")
    .maybeSingle();
  if (runRes.error || !runRes.data) {
    if (runRes.error && isMissingTable(runRes.error)) return { ok: false, message: "جداول المرحلة ٣ غير مطبَّقة (طبّق ترحيل 0085)." };
    return { ok: false, message: runRes.error?.message ?? "فشل إنشاء التشغيلة." };
  }
  const runId = (runRes.data as { id: string }).id;

  await persistBlueprint(runId, blueprint, db);
  await db.from("data_quality_versions").insert({ run_id: runId, version, action: "generated", snapshot: blueprint.stats, actor_id: actorId });

  return { ok: true, runId };
}

async function persistBlueprint(runId: string, bp: CleaningBlueprint, db: SupabaseClient): Promise<void> {
  // المشاكل (بلا مجموعات التكرار — تُحفَظ منفصلة).
  const issueRows = bp.issues
    .filter((i) => i.type !== "duplicate")
    .map((i) => ({
      run_id: runId,
      issue_type: i.type,
      object: i.object,
      field: i.field,
      row_index: i.rowIndex,
      value: i.value.slice(0, 500),
      detail: i.detail,
      suggestion: i.suggestion,
      confidence: i.confidence,
      status: "pending",
    }));
  for (let k = 0; k < issueRows.length; k += 500) await db.from("data_quality_issues").insert(issueRows.slice(k, k + 500));

  // التصحيحات المقترَحة (نسخة العمل) — من المشاكل التي لها اقتراح.
  const changeRows = bp.issues
    .filter((i) => i.suggestion && i.type !== "duplicate")
    .map((i) => ({
      run_id: runId,
      object: i.object,
      field: i.field,
      row_index: i.rowIndex,
      old_value: i.value.slice(0, 500),
      new_value: (i.suggestion ?? "").slice(0, 500),
      reason: i.detail,
      confidence: i.confidence,
      source: i.confidence >= 88 ? "deterministic" : "ai",
      status: "pending",
    }));
  for (let k = 0; k < changeRows.length; k += 500) await db.from("data_quality_changeset").insert(changeRows.slice(k, k + 500));

  // مجموعات التكرار.
  const dupRows = bp.duplicates.map((g) => ({
    run_id: runId,
    object: bp.profiles[0]?.name ?? "",
    key_field: g.keyField,
    members: g.members,
    match_method: g.matchMethod,
    similarity: g.similarity,
    suggested_action: g.suggestedAction,
    status: "pending",
  }));
  for (let k = 0; k < dupRows.length; k += 500) await db.from("data_quality_duplicates").insert(dupRows.slice(k, k + 500));
}

async function applyAiRefinement(
  bp: CleaningBlueprint & { aiNote?: string },
  db: SupabaseClient,
  actorId: string | null,
  projectId: string | null,
  domain: string
): Promise<void> {
  const lowConf = bp.issues.filter((i) => (i.type === "invalid" || i.type === "missing") && needsReview(i.confidence)).slice(0, 60);
  if (lowConf.length === 0) return;
  try {
    const qualitySummary = `الجودة ${bp.qualityScore}%؛ ناقص ${bp.stats.missing}، غير صالح ${bp.stats.invalid}، تكرار ${bp.stats.duplicateGroups}، سلامة ${bp.stats.businessIssues}. المجال: ${domain}.`;
    const sampleIssues = lowConf.map((i) => `[${i.object}.${i.field}#${i.rowIndex}] «${i.value}» — ${i.detail}${i.suggestion ? ` (اقتراح حتمي: ${i.suggestion})` : ""}`).join("\n");
    const prompt = buildDataQualityPrompt(qualitySummary, sampleIssues, "");
    const resp = await AIService.execute(AITaskType.DATA_QUALITY_ANALYSIS, prompt, { actorId: actorId ?? undefined, projectId: projectId ?? undefined });
    if (!resp.success) return;
    const v = validateDataQuality(resp.output);
    if (!v.ok) return;
    bp.aiNote = v.data.overall_note;
    const byKey = new Map<string, QualityIssue>();
    for (const i of bp.issues) byKey.set(`${i.object}::${i.field}::${i.rowIndex}`, i);
    for (const s of v.data.suggestions) {
      const issue = byKey.get(`${s.object}::${s.field}::${s.row_index}`);
      if (issue && s.corrected_value && s.confidence > issue.confidence) {
        issue.suggestion = s.corrected_value;
        issue.confidence = s.confidence;
        issue.needsReview = needsReview(s.confidence);
        issue.detail = `${issue.detail} — ${s.reason} (تهذيب الذكاء الاصطناعي)`;
      }
    }
  } catch {
    /* التهذيب تحسين لا شرط */
  }
}

/** أحدث تشغيلة لمصدر + تفاصيلها — للعرض. */
export async function getRunDetail(sourceId: string, client?: SupabaseClient) {
  const db = client ?? createServiceClient();
  const run = await db.from("data_quality_runs").select("*").eq("source_id", sourceId).order("version", { ascending: false }).limit(1).maybeSingle();
  if (run.error || !run.data) return null;
  const runId = (run.data as { id: string }).id;
  const [issues, duplicates, changeset] = await Promise.all([
    db.from("data_quality_issues").select("*").eq("run_id", runId).order("confidence", { ascending: true }).limit(500),
    db.from("data_quality_duplicates").select("*").eq("run_id", runId).order("similarity", { ascending: false }).limit(200),
    db.from("data_quality_changeset").select("*").eq("run_id", runId).eq("status", "pending").limit(500),
  ]);
  return { run: run.data, issues: issues.data ?? [], duplicates: duplicates.data ?? [], changeset: changeset.data ?? [] };
}
