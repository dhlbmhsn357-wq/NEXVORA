import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { AIService } from "@/lib/ai/service";
import { AITaskType } from "@/lib/ai/types";
import { getBrainForDownstreamGeneration, formatBrainV2ForPrompt } from "@/lib/brain-v2/downstream-context";
import { findSimilarProjects } from "@/lib/organizational-intelligence/similarity";
import { analyzeArchitecture } from "@/lib/domain-intelligence/module-catalog";
import { getActiveNodeTitles } from "@/lib/domain-intelligence/module-library-service";
import { buildArchitectureValidationPrompt, parseArchitectureValidation } from "./prompt";
import type { ProjectDomain, ArchitectureValidationReport, ArchitectureGaps } from "@/lib/types/database";

/**
 * محرّك التحقّق المعماري (Phase 6) — يجعل المنصة "تفكّر قبل توليد الـ PRD":
 * يدمج تحليلًا حتميًا عابرًا للوحدات (module-catalog) + إثراء AI للفئات
 * الدلالية + إعادة استخدام معرفة مشاريع سابقة مشابهة (الوحدات/الأخطاء
 * الشائعة/نتائج QA). يعيد استخدام كل البنية الموجودة (Knowledge Graph
 * nodes، similarity، Brain downstream context، AI Provider Layer) —
 * بدون تكرار منطق.
 */

/** تسميات فئات الفجوة الدلالية — نفس نص GAP_LABELS في architecture-intelligence-panel.tsx، مكرّرة هنا عمدًا لأن المكوّن عميل ولا يصح استيراده من مسار خادم. */
const GAP_LABELS: Record<keyof ArchitectureGaps, string> = {
  reports: "تقارير ناقصة",
  permissions: "صلاحيات ناقصة",
  roles: "أدوار ناقصة",
  integrations: "تكاملات ناقصة",
  workflows: "Workflows ناقصة",
  dashboards: "لوحات ناقصة",
  notifications: "إشعارات ناقصة",
  business_rules: "قواعد عمل ناقصة",
  audit_logs: "سجلات تدقيق ناقصة",
  security: "ميزات أمان ناقصة",
  apis: "APIs ناقصة",
  db_tables: "جداول قاعدة بيانات ناقصة",
};

/** أقصى عدد توصيات مولَّدة تلقائيًا من تقرير تحقّق واحد — حماية من فيضان القائمة لو تقرير AI رجّع مئات العناصر. لو اتقطع، بيتسجّل تحذير صريح (مفيش قطع صامت). */
const MAX_GENERATED_RECOMMENDATIONS_PER_RUN = 60;

function normalizeSourceKeyPart(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, "_").slice(0, 120);
}

interface GeneratedRecommendationInput {
  sourceRef: string;
  recommendation: string;
  rationale: string;
}

/**
 * يبني توصيات مرشّحة من نواقص التحقّق المعماري (وحدات ناقصة + مزايا
 * ناقصة + فجوات دلالية) — دالة نقية بلا وصول لقاعدة البيانات، عشان
 * تبقى قابلة للاختبار بمعزل عن Supabase.
 */
export function buildArchitectureGapRecommendations(
  report: Pick<ArchitectureValidationReport, "missing_modules" | "missing_features" | "gaps">
): GeneratedRecommendationInput[] {
  const items: GeneratedRecommendationInput[] = [];

  for (const m of report.missing_modules ?? []) {
    items.push({
      sourceRef: `architecture_gap:module:${normalizeSourceKeyPart(m.module_key)}`,
      recommendation: `إضافة الوحدة المعمارية الناقصة: ${m.name}`,
      rationale: m.reason?.trim() || `وحدة معمارية ناقصة اكتُشفت أثناء التحقّق المعماري (${m.module_key}).`,
    });
  }

  for (const f of report.missing_features ?? []) {
    items.push({
      sourceRef: `architecture_gap:feature:${normalizeSourceKeyPart(f.module_key)}:${normalizeSourceKeyPart(f.feature)}`,
      recommendation: `إضافة الميزة الناقصة: ${f.feature}`,
      rationale: `ميزة ناقصة ضمن الوحدة "${f.module_key}" اكتُشفت أثناء التحقّق المعماري.`,
    });
  }

  const gapEntries = Object.entries(report.gaps ?? {}) as [keyof ArchitectureGaps, string[] | undefined][];
  for (const [key, values] of gapEntries) {
    const label = GAP_LABELS[key];
    if (!label || !values) continue;
    for (const v of values) {
      if (!v?.trim()) continue;
      items.push({
        sourceRef: `architecture_gap:${key}:${normalizeSourceKeyPart(v)}`,
        recommendation: `${label}: ${v.trim()}`,
        rationale: `فجوة معمارية دلالية (${label}) اكتُشفت عبر إثراء الذكاء الاصطناعي أثناء التحقّق المعماري.`,
      });
    }
  }

  return items;
}

/**
 * يحوّل نواقص تقرير التحقّق المعماري (وحدات/مزايا ناقصة + فجوات دلالية)
 * لصفوف project_recommendations — عشان يفضل لها مسار قبول/رفض حقيقي
 * زي أي توصية تانية (خطوة 3 من المعالج)، بدل ما تفضل قراءة فقط في
 * لوحة الجاهزية المعمارية بلا أي أثر على الـ Brain.
 *
 * محسوب للتكرار عبر source_ref (مفتاح ثابت لكل عنصر نقص) — تشغيل
 * "إعادة التحقّق" أكتر من مرة ما بيضيفش نفس التوصية تاني. best-effort:
 * فشلها ما بيوقفش حفظ تقرير التحقّق نفسه (اللي أهم).
 */
export async function syncArchitectureGapsToRecommendations(
  supabase: ReturnType<typeof createServiceClient>,
  projectId: string,
  report: Pick<ArchitectureValidationReport, "missing_modules" | "missing_features" | "gaps">
): Promise<void> {
  try {
    const items = buildArchitectureGapRecommendations(report);
    if (items.length === 0) return;

    let toGenerate = items;
    if (items.length > MAX_GENERATED_RECOMMENDATIONS_PER_RUN) {
      console.warn(
        `[architecture-validation] تقليم توليد التوصيات المعمارية للمشروع ${projectId}: ${items.length} عنصر نقص مكتشف، اتولّد منهم بس أول ${MAX_GENERATED_RECOMMENDATIONS_PER_RUN} (باقي التقرير كامل ومعروض في لوحة الجاهزية المعمارية كالمعتاد).`
      );
      toGenerate = items.slice(0, MAX_GENERATED_RECOMMENDATIONS_PER_RUN);
    }

    const { data: existingRaw } = await supabase
      .from("project_recommendations")
      .select("source_ref")
      .eq("project_id", projectId)
      .not("source_ref", "is", null);
    const existingRefs = new Set(((existingRaw ?? []) as { source_ref: string | null }[]).map((r) => r.source_ref));

    const rows = toGenerate
      .filter((it) => !existingRefs.has(it.sourceRef))
      .map((it) => ({
        project_id: projectId,
        category: "architecture",
        recommendation: it.recommendation,
        rationale: it.rationale,
        confidence_score: 70,
        status: "suggested",
        evidence_source: "knowledge_graph",
        source_ref: it.sourceRef,
      }));

    if (rows.length > 0) {
      const { error } = await supabase.from("project_recommendations").insert(rows);
      if (error) {
        console.warn(`[architecture-validation] فشل حفظ توصيات النواقص المعمارية للمشروع ${projectId}: ${error.message}`);
      }
    }
  } catch (err) {
    // best-effort — التقرير نفسه اتخزّن بالفعل، ما نكسرش المسار الأساسي.
    console.warn(
      `[architecture-validation] فشل مزامنة نواقص التحقّق المعماري لتوصيات للمشروع ${projectId}: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

/** إعادة استخدام معرفة مشاريع سابقة مشابهة (الوحدات + الأخطاء + QA). */
async function gatherReusedInsights(
  supabase: ReturnType<typeof createServiceClient>,
  projectId: string
): Promise<ArchitectureValidationReport["reused_insights"]> {
  const similar = await findSimilarProjects(supabase, projectId);
  if (similar.length === 0) return [];

  const out: ArchitectureValidationReport["reused_insights"] = [];
  for (const s of similar.slice(0, 3)) {
    const { data: detections } = await supabase
      .from("project_module_detections")
      .select("module_key")
      .eq("project_id", s.project_id)
      .eq("present", true);
    const moduleKeys = ((detections ?? []) as { module_key: string }[]).map((d) => d.module_key);

    let mistakes: string[] = [];
    let qa: string[] = [];
    if (moduleKeys.length) {
      const { data: mods } = await supabase
        .from("business_modules")
        .select("common_mistakes, qa_findings")
        .in("module_key", moduleKeys);
      for (const m of (mods ?? []) as { common_mistakes: string[]; qa_findings: string[] }[]) {
        mistakes.push(...(m.common_mistakes ?? []));
        qa.push(...(m.qa_findings ?? []));
      }
    }
    mistakes = [...new Set(mistakes)].slice(0, 8);
    qa = [...new Set(qa)].slice(0, 8);
    out.push({ project_id: s.project_id, name: s.project_name, modules: moduleKeys, mistakes, qa });
  }
  return out;
}

/**
 * يشغّل التحقّق المعماري لمشروع ويخزّن التقرير (upsert صف واحد لكل مشروع).
 * best-effort على AI — لو فشل الإثراء، التقرير الحتمي بيتخزّن كامل.
 */
export async function runArchitectureValidation(projectId: string, actorId: string | null = null): Promise<{ ok: boolean; message?: string }> {
  const supabase = createServiceClient();

  await supabase.from("architecture_validation_reports").upsert(
    { project_id: projectId, status: "generating", requested_by: actorId, generated_at: new Date().toISOString() },
    { onConflict: "project_id" }
  );

  try {
    const [{ data: proj }, titles] = await Promise.all([
      supabase.from("projects").select("domain").eq("id", projectId).maybeSingle(),
      getActiveNodeTitles(projectId),
    ]);
    const domain = ((proj as { domain?: ProjectDomain } | null)?.domain ?? "generic") as ProjectDomain;
    const deterministic = analyzeArchitecture(domain, titles);

    const brain = await getBrainForDownstreamGeneration(supabase, projectId);
    const brainSummary = brain ? formatBrainV2ForPrompt(brain.content) : "";

    // إثراء AI للفئات الدلالية (best-effort)
    let gaps: ArchitectureValidationReport["gaps"] = {};
    let aiSummary = "";
    if (brainSummary) {
      const prompt = buildArchitectureValidationPrompt({ domain, brainSummary, deterministic });
      const res = await AIService.execute(AITaskType.ARCHITECTURE_VALIDATION, prompt, { projectId, actorId: actorId ?? undefined });
      if (res.success) {
        const parsed = parseArchitectureValidation(res.output);
        gaps = parsed.gaps;
        aiSummary = parsed.summary;
      }
    }

    const reusedInsights = await gatherReusedInsights(supabase, projectId);

    await supabase.from("architecture_validation_reports").upsert(
      {
        project_id: projectId,
        status: "ready",
        domain,
        missing_modules: deterministic.missingModules,
        missing_features: deterministic.missingFeatures,
        gaps,
        reused_insights: reusedInsights,
        readiness_score: deterministic.readinessScore,
        ai_summary: aiSummary || null,
        last_error: null,
        generated_from_brain_version: brain?.version ?? null,
        requested_by: actorId,
        generated_at: new Date().toISOString(),
      },
      { onConflict: "project_id" }
    );

    // بعد ما التقرير اتخزّن بنجاح — النواقص بتتحوّل لتوصيات حقيقية قابلة
    // للقبول/الرفض في خطوة "قرارات التوصيات" (best-effort، مش حرج).
    await syncArchitectureGapsToRecommendations(supabase, projectId, {
      missing_modules: deterministic.missingModules,
      missing_features: deterministic.missingFeatures,
      gaps,
    });

    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "فشل التحقّق المعماري.";
    await supabase.from("architecture_validation_reports").upsert(
      { project_id: projectId, status: "failed", last_error: message, generated_at: new Date().toISOString() },
      { onConflict: "project_id" }
    );
    return { ok: false, message };
  }
}

export async function getArchitectureReport(projectId: string): Promise<ArchitectureValidationReport | null> {
  const supabase = createServiceClient();
  const { data } = await supabase.from("architecture_validation_reports").select("*").eq("project_id", projectId).maybeSingle();
  return (data as ArchitectureValidationReport | null) ?? null;
}
