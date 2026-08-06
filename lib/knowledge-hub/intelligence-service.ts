import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { truncateForLog } from "@/lib/observability/safe-log";
import { AITaskType } from "@/lib/ai/types";
import { executeAIWithRateLimitWait } from "@/lib/ai/execute-with-rate-limit-wait";
import { hashInput } from "@/lib/ai-platform/cache/keys";
import { buildKnowledgeIntelligencePrompt } from "@/lib/ai/prompts/knowledge-intelligence";
import { validateKnowledgeIntelligence } from "@/lib/ai/validation/knowledge-intelligence";
import {
  computeIntelligenceScores,
  type IntelligenceScores,
  type IntelligenceSignals,
} from "./intelligence/scoring";
import {
  detectMissingCapabilities,
  type MissingCapability,
} from "./intelligence/domain-checklist";
import {
  insightDedupeKey,
  type Insight,
  type InsightSourceRef,
  type Severity,
} from "./intelligence/insight-model";
import { DOMAIN_PROFILES } from "@/lib/domain-intelligence/domain-profiles";
import type { ProjectDomain } from "@/lib/types/database";

/**
 * محرّك ذكاء المعرفة — الطبقة الاستشارية (الجزء الخامس).
 *
 * ## المكان في المنظومة
 *
 * بعد ما `processing-service` بيستخرج الكائنات المهيكلة، ده **بيُفكّر
 * فوقها**: بيجمع الصورة الكاملة، بيحسب القدرات الناقصة والدرجات
 * **حتميًا**، وبيشغّل نداءً استشاريًا واحدًا للرؤى التحليلية (معماري،
 * عمليات، تنبّؤ بالمخاطر).
 *
 * ## تقسيم العمل: حتمي مقابل ذكاء اصطناعي
 *
 * - **حتمي (بلا نموذج):** القدرات الناقصة (فحص قوائم)، التعارضات (موجودة
 *   بالفعل)، الدرجات (حساب). دي مضمونة ورخيصة ومتكرّرة.
 * - **ذكاء اصطناعي:** الرؤى اللي محتاجة تحليل — أنماط معمارية، أعناق
 *   زجاجة، مخاطر متوقَّعة. دي اللي فحص القوائم مايقدرش عليها.
 *
 * الفصل ده بيخلّي معظم القيمة تتولّد بلا تكلفة نموذج، والنموذج يركّز على
 * اللي هو وحده يقدر عليه.
 */

const UNDEFINED_TABLE = "42P01";

export interface IntelligenceOutcome {
  status: "ok" | "failed" | "unavailable";
  insightsWritten?: number;
  scores?: IntelligenceScores;
  message?: string;
}

/**
 * يشغّل جولة ذكاء كاملة على المشروع: يجمع، يحسب، يستشير، يكتب.
 */
export async function runIntelligence(
  projectId: string,
  actorId?: string | null
): Promise<IntelligenceOutcome> {
  const supabase = createServiceClient();

  let signals: GatheredKnowledge;
  try {
    signals = await gatherKnowledge(supabase, projectId);
  } catch (err) {
    // جداول ٠٠٧٧/٠٧٩ مش مطبَّقة → الطبقة الاستشارية غير متاحة بعد.
    if ((err as { code?: string })?.code === UNDEFINED_TABLE) {
      return { status: "unavailable", message: "جداول الذكاء غير مطبَّقة بعد (0077/0079)." };
    }
    throw err;
  }

  // --- 1) القدرات الناقصة (حتمي) ---
  const domainExpected = signals.domain ? DOMAIN_PROFILES[signals.domain]?.expectedItems ?? [] : [];
  const missing = detectMissingCapabilities(signals.presentCapabilities, domainExpected);

  // --- 2) الدرجات (حتمي) ---
  const scoreSignals: IntelligenceSignals = {
    qualityOverall: signals.qualityOverall,
    completenessOverall: signals.completenessOverall,
    counts: signals.counts,
    openConflicts: signals.openConflicts,
    openGaps: signals.openGaps,
    criticalRisks: signals.criticalRisks,
    decisionsWithRationale: signals.decisionsWithRationale,
    missingCapabilities: missing.length,
  };
  const scores = computeIntelligenceScores(scoreSignals);

  // --- 3) النداء الاستشاري (ذكاء اصطناعي) ---
  const aiInsights = await runAdvisoryPass(signals, missing, scores, actorId, projectId);

  // --- 4) الكتابة ---
  const deterministicInsights = [
    ...missingToInsights(missing),
    ...conflictsToInsights(signals.conflicts),
  ];
  const allInsights = [...deterministicInsights, ...aiInsights];

  const written = await writeInsights(supabase, projectId, allInsights, actorId);
  await writeScoreSnapshot(supabase, projectId, scores, signals);

  return { status: "ok", insightsWritten: written, scores };
}

// ============================================================
// الجمع
// ============================================================

interface GatheredKnowledge {
  projectName: string;
  domain: ProjectDomain | null;
  counts: IntelligenceSignals["counts"];
  presentCapabilities: string[];
  qualityOverall: number;
  completenessOverall: number;
  openConflicts: number;
  openGaps: number;
  criticalRisks: number;
  decisionsWithRationale: number;
  conflicts: Array<{ leftLabel: string; rightLabel: string; leftStatement: string; rightStatement: string; severity: string }>;
  knowledgeSummary: string;
  conflictsSummary: string;
  gapsSummary: string;
}

async function gatherKnowledge(
  supabase: SupabaseClient,
  projectId: string
): Promise<GatheredKnowledge> {
  const project = await supabase.from("projects").select("name, domain").eq("id", projectId).maybeSingle();
  if (project.error && project.error.code === UNDEFINED_TABLE) throw project.error;

  const [entities, rules, workflows, requirements, decisions, risks, relCount, conflicts, gaps, completeness] =
    await Promise.all([
      supabase.from("knowledge_entities").select("name, entity_type, description").eq("project_id", projectId).eq("status", "active").limit(1000),
      supabase.from("knowledge_business_rules").select("name, condition, action, scope").eq("project_id", projectId).eq("status", "active").limit(1000),
      supabase.from("knowledge_workflows").select("name, description").eq("project_id", projectId).eq("status", "active").limit(500),
      supabase.from("knowledge_requirements").select("statement, requirement_type, module").eq("project_id", projectId).eq("status", "active").limit(1000),
      supabase.from("knowledge_decisions").select("decision, rationale").eq("project_id", projectId).eq("status", "active").limit(500),
      supabase.from("knowledge_risks").select("description, risk_type, likelihood, severity").eq("project_id", projectId).eq("status", "active").limit(500),
      supabase.from("knowledge_entity_relations").select("id", { count: "exact", head: true }).eq("project_id", projectId),
      supabase.from("knowledge_conflicts").select("left_label, right_label, left_statement, right_statement, severity").eq("project_id", projectId).eq("status", "open").limit(50),
      supabase.from("knowledge_gaps").select("description, why_it_matters, priority").eq("project_id", projectId).eq("status", "open").limit(50),
      supabase.from("knowledge_domain_completeness").select("domain, completeness, computed_at").eq("project_id", projectId).order("computed_at", { ascending: false }).limit(50),
    ]);

  // لو الجدول الأساسي غير موجود، نرفع كود الجدول المفقود لأعلى.
  if (entities.error && entities.error.code === UNDEFINED_TABLE) throw entities.error;

  const entityRows = (entities.data ?? []) as Array<{ name: string; entity_type: string; description: string }>;
  const ruleRows = (rules.data ?? []) as Array<{ name: string; condition: string; action: string; scope: string | null }>;
  const workflowRows = (workflows.data ?? []) as Array<{ name: string; description: string }>;
  const reqRows = (requirements.data ?? []) as Array<{ statement: string; requirement_type: string; module: string | null }>;
  const decisionRows = (decisions.data ?? []) as Array<{ decision: string; rationale: string | null }>;
  const riskRows = (risks.data ?? []) as Array<{ description: string; risk_type: string; likelihood: string; severity: string }>;
  const conflictRows = (conflicts.data ?? []) as Array<{ left_label: string; right_label: string; left_statement: string; right_statement: string; severity: string }>;
  const gapRows = (gaps.data ?? []) as Array<{ description: string; why_it_matters: string; priority: string }>;

  // القدرات الحاضرة — لفحص النقص.
  const presentCapabilities = [
    ...entityRows.map((e) => e.name),
    ...ruleRows.map((r) => r.scope ?? "").filter(Boolean),
    ...workflowRows.map((w) => w.name),
    ...reqRows.map((r) => r.module ?? "").filter(Boolean),
    ...reqRows.map((r) => r.statement),
  ];

  // الجودة تقدير من متوسط ثقة الكائنات (بديل خفيف عن computeQuality الثقيل).
  const qualityOverall = estimateQuality(entityRows.length, ruleRows.length, workflowRows.length, reqRows.length, decisionRows.length);

  // الاكتمال: متوسط أحدث لقطة لكل مجال.
  const completenessOverall = averageCompleteness((completeness.data ?? []) as Array<{ domain: string; completeness: number; computed_at: string }>);

  const criticalRisks = riskRows.filter((r) => r.likelihood === "high" && r.severity === "critical").length;
  const decisionsWithRationale = decisionRows.filter((d) => (d.rationale ?? "").trim().length > 0).length;

  return {
    projectName: (project.data?.name as string) ?? "المشروع",
    domain: ((project.data?.domain as ProjectDomain | null) ?? null),
    counts: {
      entities: entityRows.length,
      relations: relCount.count ?? 0,
      rules: ruleRows.length,
      workflows: workflowRows.length,
      requirements: reqRows.length,
      decisions: decisionRows.length,
      risks: riskRows.length,
      items: entityRows.length + ruleRows.length + reqRows.length,
    },
    presentCapabilities,
    qualityOverall,
    completenessOverall,
    openConflicts: conflictRows.length,
    openGaps: gapRows.length,
    criticalRisks,
    decisionsWithRationale,
    conflicts: conflictRows.map((c) => ({
      leftLabel: c.left_label, rightLabel: c.right_label,
      leftStatement: c.left_statement, rightStatement: c.right_statement, severity: c.severity,
    })),
    knowledgeSummary: buildKnowledgeSummary(entityRows, ruleRows, workflowRows, reqRows, decisionRows, riskRows),
    conflictsSummary: conflictRows.map((c) => `- ${c.left_label} ⟷ ${c.right_label}: «${c.left_statement}» مقابل «${c.right_statement}»`).join("\n"),
    gapsSummary: gapRows.map((g) => `- ${g.description} (${g.priority})`).join("\n"),
  };
}

function estimateQuality(entities: number, rules: number, workflows: number, reqs: number, decisions: number): number {
  // كثافة الأنواع مؤشّر خام على نضج المعرفة — نطبّعها لـ٠–١٠٠.
  const sat = (n: number, t: number) => Math.min(1, n / t);
  const score = (sat(entities, 8) + sat(rules, 4) + sat(workflows, 2) + sat(reqs, 5) + sat(decisions, 3)) / 5;
  return Math.round(score * 100);
}

function averageCompleteness(rows: Array<{ domain: string; completeness: number; computed_at: string }>): number {
  const latestByDomain = new Map<string, number>();
  for (const r of rows) {
    if (!latestByDomain.has(r.domain)) latestByDomain.set(r.domain, r.completeness); // مرتّبة تنازليًا فالأول أحدث
  }
  const vals = [...latestByDomain.values()];
  if (vals.length === 0) return 0;
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
}

function buildKnowledgeSummary(
  entities: Array<{ name: string; entity_type: string }>,
  rules: Array<{ name: string; condition: string; action: string }>,
  workflows: Array<{ name: string; description: string }>,
  reqs: Array<{ statement: string; requirement_type: string }>,
  decisions: Array<{ decision: string; rationale: string | null }>,
  risks: Array<{ description: string; risk_type: string; likelihood: string; severity: string }>
): string {
  const sections: string[] = [];
  if (entities.length) sections.push(`### الكيانات (${entities.length})\n${entities.slice(0, 40).map((e) => `- ${e.name} [${e.entity_type}]`).join("\n")}`);
  if (rules.length) sections.push(`### قواعد العمل (${rules.length})\n${rules.slice(0, 30).map((r) => `- ${r.condition} ⇐ ${r.action}`).join("\n")}`);
  if (workflows.length) sections.push(`### سير العمل (${workflows.length})\n${workflows.slice(0, 20).map((w) => `- ${w.name}: ${w.description}`).join("\n")}`);
  if (reqs.length) sections.push(`### المتطلبات (${reqs.length})\n${reqs.slice(0, 40).map((r) => `- [${r.requirement_type}] ${r.statement}`).join("\n")}`);
  if (decisions.length) sections.push(`### القرارات (${decisions.length})\n${decisions.slice(0, 20).map((d) => `- ${d.decision}${d.rationale ? ` (السبب: ${d.rationale})` : ""}`).join("\n")}`);
  if (risks.length) sections.push(`### المخاطر (${risks.length})\n${risks.slice(0, 20).map((r) => `- [${r.risk_type}] ${r.description} (${r.likelihood}/${r.severity})`).join("\n")}`);
  return sections.join("\n\n") || "لا توجد معرفة مهيكلة بعد.";
}

// ============================================================
// النداء الاستشاري
// ============================================================

async function runAdvisoryPass(
  signals: GatheredKnowledge,
  missing: MissingCapability[],
  scores: IntelligenceScores,
  actorId: string | null | undefined,
  projectId: string
): Promise<Insight[]> {
  // معرفة ضئيلة جدًا → نتخطّى النموذج، الحتمي وحده يكفي.
  if (signals.counts.entities + signals.counts.requirements + signals.counts.rules < 2) {
    return [];
  }

  const prompt = buildKnowledgeIntelligencePrompt({
    projectName: signals.projectName,
    declaredDomain: signals.domain,
    knowledgeSummary: signals.knowledgeSummary,
    conflictsSummary: signals.conflictsSummary,
    gapsSummary: signals.gapsSummary,
    missingCapabilities: missing.map((m) => m.label),
    scoresLine: `النضج ${scores.maturity}٪ · جاهزية المشروع ${scores.projectReadiness}٪ · جاهزية المعمار ${scores.architectureReadiness}٪`,
  });

  const response = await executeAIWithRateLimitWait(AITaskType.KNOWLEDGE_INTELLIGENCE, prompt, {
    actorId: actorId ?? undefined,
    projectId,
  });

  if (!response.success) {
    console.error(`[KnowledgeIntel] فشل النداء الاستشاري للمشروع ${projectId}: ${response.error?.message}`);
    return [];
  }

  const validation = validateKnowledgeIntelligence(response.output);
  if (!validation.ok) {
    console.error(`[KnowledgeIntel] تعذّر فهم الرؤى للمشروع ${projectId}: ${truncateForLog(validation.reason)}`);
    return [];
  }
  if (validation.data.dropped > 0) {
    console.warn(`[KnowledgeIntel] أُسقط ${validation.data.dropped} رأي غير مؤسَّس في المشروع ${projectId}.`);
  }
  return validation.data.insights;
}

// ============================================================
// تحويل الحتمي لرؤى
// ============================================================

function missingToInsights(missing: MissingCapability[]): Insight[] {
  return missing.map((m) => ({
    insightType: "missing_capability" as const,
    title: `قدرة ناقصة: ${m.label}`,
    detail: `النظام لا يحتوي على «${m.label}» ضمن المعرفة المستخرَجة.`,
    rationale: m.why,
    impact: m.severity === "critical" ? "غيابها مخاطرة أمنية أو امتثالية مباشرة." : "غيابها يترك ثغرة وظيفية تحتاج معالجة.",
    module: m.label,
    severity: m.severity,
    effort: m.severity === "critical" ? 60 : 40,
    confidence: 90,
    sourceRefs: [{ type: m.origin === "domain" ? "domain_checklist" : "enterprise_checklist" }] as InsightSourceRef[],
  }));
}

function conflictsToInsights(
  conflicts: GatheredKnowledge["conflicts"]
): Insight[] {
  return conflicts.map((c) => ({
    insightType: "contradiction" as const,
    title: `تعارض: ${c.leftLabel} ⟷ ${c.rightLabel}`,
    detail: `«${c.leftStatement}» يتعارض مع «${c.rightStatement}».`,
    rationale: "مصدران يقولان أشياء متناقضة — لا يُبنى على معرفة متضاربة.",
    impact: "التعارض غير المحسوم يتسرّب لكل مرحلة لاحقة (Brain، PRD).",
    module: null,
    severity: (["critical", "high", "medium", "low"].includes(c.severity) ? c.severity : "high") as Severity,
    effort: 30,
    confidence: 100,
    sourceRefs: [{ type: "conflict", quote: c.leftStatement }, { type: "conflict", quote: c.rightStatement }],
  }));
}

// ============================================================
// الكتابة
// ============================================================

async function writeInsights(
  supabase: SupabaseClient,
  projectId: string,
  insights: Insight[],
  actorId: string | null | undefined
): Promise<number> {
  if (insights.length === 0) return 0;

  const rows = insights.map((i) => ({
    project_id: projectId,
    insight_type: i.insightType,
    title: i.title,
    detail: i.detail,
    rationale: i.rationale,
    impact: i.impact,
    module: i.module,
    severity: i.severity,
    effort: i.effort,
    confidence: i.confidence,
    source_refs: i.sourceRefs,
    dedupe_hash: hashInput(insightDedupeKey(i)),
  }));

  // Upsert على (project_id, dedupe_hash): التوليد المتكرّر يحدّث لا
  // يضاعف. الرؤى المقبولة/المرفوضة يدويًا لا تُدهس — نتخطّاها بعدم
  // تحديث الحالة (نحدّث المحتوى فقط عبر ignoreDuplicates=false مع
  // onConflict، لكن الحالة عمود منفصل مش في الصف). عشان نحمي القرار
  // البشري: نستخدم ignoreDuplicates لو الرأي مقبول/مرفوض بالفعل.
  const { error } = await supabase
    .from("knowledge_insights")
    .upsert(rows, { onConflict: "project_id,dedupe_hash", ignoreDuplicates: true });

  if (error) {
    console.error(`[KnowledgeIntel] تعذّر كتابة الرؤى: ${error.message}`);
    return 0;
  }
  void actorId;
  return rows.length;
}

async function writeScoreSnapshot(
  supabase: SupabaseClient,
  projectId: string,
  scores: IntelligenceScores,
  signals: GatheredKnowledge
): Promise<void> {
  const { error } = await supabase.from("knowledge_intelligence_scores").insert({
    project_id: projectId,
    maturity_score: scores.maturity,
    project_readiness: scores.projectReadiness,
    architecture_readiness: scores.architectureReadiness,
    requirement_coverage: scores.requirementCoverage,
    breakdown: scores.breakdown,
    open_conflicts: signals.openConflicts,
    open_gaps: signals.openGaps,
  });
  if (error) console.error(`[KnowledgeIntel] تعذّر كتابة لقطة الدرجات: ${error.message}`);
}
