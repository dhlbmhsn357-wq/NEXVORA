import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { getBrainForDownstreamGeneration, formatBrainV2ForPrompt } from "@/lib/brain-v2/downstream-context";
import { AIService } from "@/lib/ai/service";
import { AITaskType } from "@/lib/ai/types";
import { buildKnowledgeExtractionPrompt } from "@/lib/ai/prompts/organizational-intelligence";
import { validateKnowledgeExtraction, type KnowledgeCandidate } from "@/lib/ai/validation/organizational-intelligence";
import { maskSecrets } from "@/lib/security-review/masking";
import { isDuplicateMatch, nextKnowledgeStatus } from "./knowledge-rules";
import { upsertProjectEmbeddingFromBrain } from "./project-embedding";
import type { KnowledgeExtractionJob, KnowledgeSourceType } from "@/lib/types/database";

const STALE_LOCK_MS = 10 * 60_000;
const MAX_SOURCE_CHARS = 6000;

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}\n[...تم اختصار الباقي...]` : text;
}

async function gatherSupportSummary(supabase: SupabaseClient, projectId: string): Promise<string | null> {
  const { data } = await supabase
    .from("support_requests")
    .select("request_type, structured_summary, resolution_status")
    .eq("project_id", projectId)
    .eq("resolution_status", "resolved")
    .limit(20);
  const rows = (data ?? []) as Array<{ request_type: string; structured_summary: { problem_description?: string } | null }>;
  if (rows.length === 0) return null;
  return rows.map((r) => `- [${r.request_type}] ${r.structured_summary?.problem_description ?? ""}`).join("\n");
}

async function gatherMonitoringSummary(supabase: SupabaseClient, projectId: string): Promise<string | null> {
  const { data } = await supabase
    .from("monitoring_incidents")
    .select("category, severity, title, root_cause")
    .eq("project_id", projectId)
    .eq("status", "resolved")
    .limit(20);
  const rows = (data ?? []) as Array<{ category: string; severity: string; title: string; root_cause: string }>;
  if (rows.length === 0) return null;
  return rows.map((r) => `- [${r.category}/${r.severity}] ${r.title} — السبب الجذري: ${r.root_cause}`).join("\n");
}

async function gatherEngineeringQaSummary(supabase: SupabaseClient, projectId: string): Promise<string | null> {
  const { data } = await supabase
    .from("engineering_certificates")
    .select("certification_status, overall_score")
    .eq("project_id", projectId)
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return `حالة الاعتماد النهائية: ${data.certification_status}، الدرجة الكلية: ${data.overall_score ?? "غير متاحة"}`;
}

async function gatherPrototypeReviewSummary(supabase: SupabaseClient, projectId: string): Promise<string | null> {
  const { data } = await supabase
    .from("prototype_review")
    .select("gap_report, completion_percentage, overall_status")
    .eq("project_id", projectId)
    .maybeSingle();
  if (!data || !data.overall_status) return null;
  return `الحالة: ${data.overall_status}، نسبة الاكتمال: ${data.completion_percentage}%، الفجوات: ${JSON.stringify(data.gap_report).slice(0, 800)}`;
}

async function gatherBrainReviewSummary(supabase: SupabaseClient, projectId: string): Promise<string | null> {
  const { data: brainDoc } = await supabase
    .from("project_brain_documents")
    .select("id")
    .eq("project_id", projectId)
    .eq("status", "approved")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!brainDoc) return null;

  const [{ data: objects }, { data: report }] = await Promise.all([
    supabase.from("brain_review_objects").select("section_key, item_title, state").eq("document_id", brainDoc.id).in("state", ["rejected", "needs_revision"]).limit(15),
    supabase.from("brain_review_validation_reports").select("issues").eq("document_id", brainDoc.id).order("generated_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  const parts: string[] = [];
  if (objects && objects.length > 0) {
    parts.push(objects.map((o) => `- [${o.section_key}] ${o.item_title} (${o.state})`).join("\n"));
  }
  const issues = (report?.issues as Array<{ type: string; severity: string; description: string }> | null) ?? [];
  const criticalIssues = issues.filter((i) => i.severity === "critical" || i.severity === "high");
  if (criticalIssues.length > 0) {
    parts.push(criticalIssues.map((i) => `- [${i.type}/${i.severity}] ${i.description}`).join("\n"));
  }
  return parts.length > 0 ? parts.join("\n") : null;
}

async function gatherFixPromptSummary(supabase: SupabaseClient, projectId: string): Promise<string | null> {
  const { data: reports } = await supabase
    .from("monitoring_review_reports")
    .select("verdicts, overall_fix_score")
    .eq("project_id", projectId)
    .order("generated_at", { ascending: false })
    .limit(5);
  if (!reports || reports.length === 0) return null;
  return reports
    .map((r) => {
      const verdicts = (r.verdicts as Array<{ verdict: string; explanation: string }>) ?? [];
      const solved = verdicts.filter((v) => v.verdict === "solved_completely").length;
      return `- درجة الإصلاح: ${r.overall_fix_score ?? "غير متاحة"}%، تم حل ${solved}/${verdicts.length} حادثة`;
    })
    .join("\n");
}

/**
 * محرك استخراج المعرفة التنظيمية — بيتشغّل مرة واحدة لكل مشروع عند
 * أرشفته (نقطة "خلص" المتفق عليها). خطوة واحدة بس (مش Multi-Stage زي
 * محركات المراجعة) لأن المصادر محدودة ومُجمّعة مسبقًا، فمفيش داعي
 * لتعقيد إضافي (Continuable Stage) هنا.
 */
export class KnowledgeExtractionEngine {
  static async startExtraction(projectId: string): Promise<{ status: "started"; jobId: string } | { status: "already_running" } | { status: "error"; message: string }> {
    const supabase = createServiceClient();

    const { data: existing } = await supabase
      .from("knowledge_extraction_jobs")
      .select("*")
      .eq("project_id", projectId)
      .maybeSingle();

    if (existing) {
      const job = existing as KnowledgeExtractionJob;
      const isStale = job.status === "running" && job.started_at && Date.now() - new Date(job.started_at).getTime() > STALE_LOCK_MS;
      if (job.status === "running" && !isStale) return { status: "already_running" };

      const { error } = await supabase
        .from("knowledge_extraction_jobs")
        .update({ status: "running", last_error: null, started_at: new Date().toISOString(), completed_at: null })
        .eq("id", job.id)
        .in("status", ["idle", "ready", "failed", "running"]);
      if (error) return { status: "error", message: error.message };
      return { status: "started", jobId: job.id };
    }

    const { data: created, error } = await supabase
      .from("knowledge_extraction_jobs")
      .insert({ project_id: projectId, status: "running", started_at: new Date().toISOString() })
      .select("id")
      .single();
    if (error || !created) return { status: "error", message: `فشل إنشاء مهمة الاستخراج: ${error?.message ?? "سبب غير معروف"}` };
    return { status: "started", jobId: created.id };
  }

  static async runExtractionCore(jobId: string): Promise<void> {
    const supabase = createServiceClient();

    try {
      const { data: jobRow } = await supabase.from("knowledge_extraction_jobs").select("*").eq("id", jobId).maybeSingle();
      if (!jobRow) return;
      const job = jobRow as KnowledgeExtractionJob;

      const brain = await getBrainForDownstreamGeneration(supabase, job.project_id);
      const brainSummary = brain ? truncate(formatBrainV2ForPrompt(brain.content), MAX_SOURCE_CHARS) : null;
      const [engineeringQaSummary, supportSummary, monitoringSummary, prototypeReviewSummary, brainReviewSummary, fixPromptSummary] = await Promise.all([
        gatherEngineeringQaSummary(supabase, job.project_id),
        gatherSupportSummary(supabase, job.project_id),
        gatherMonitoringSummary(supabase, job.project_id),
        gatherPrototypeReviewSummary(supabase, job.project_id),
        gatherBrainReviewSummary(supabase, job.project_id),
        gatherFixPromptSummary(supabase, job.project_id),
      ]);

      if (
        !brainSummary &&
        !engineeringQaSummary &&
        !supportSummary &&
        !monitoringSummary &&
        !prototypeReviewSummary &&
        !brainReviewSummary &&
        !fixPromptSummary
      ) {
        await supabase
          .from("knowledge_extraction_jobs")
          .update({ status: "ready", extracted_count: 0, linked_count: 0, completed_at: new Date().toISOString() })
          .eq("id", jobId);
        return;
      }

      // تحديث أخير للـ Embedding على مستوى المشروع (يُستخدم في Cross-
      // Project Similarity) — لو مفيش Brain معتمد، نتخطّاه بدل ما نمنع
      // استخراج المعرفة نفسها (مش شرط لبعضه).
      await upsertProjectEmbeddingFromBrain(supabase, job.project_id);

      const prompt = buildKnowledgeExtractionPrompt({
        brainSummary,
        engineeringQaSummary,
        supportSummary,
        monitoringSummary,
        prototypeReviewSummary,
        brainReviewSummary,
        fixPromptSummary,
      });
      const aiResponse = await AIService.execute(AITaskType.KNOWLEDGE_EXTRACTION, prompt, { projectId: job.project_id });
      if (!aiResponse.success) {
        await supabase
          .from("knowledge_extraction_jobs")
          .update({ status: "failed", last_error: aiResponse.error?.message ?? "فشل استدعاء AI" })
          .eq("id", jobId);
        return;
      }

      const validated = validateKnowledgeExtraction(aiResponse.output);
      if (!validated.ok) {
        await supabase.from("knowledge_extraction_jobs").update({ status: "failed", last_error: validated.reason }).eq("id", jobId);
        return;
      }

      const { data: projectRow } = await supabase.from("projects").select("domain").eq("id", job.project_id).maybeSingle();
      const projectDomain = (projectRow?.domain as string | null) ?? null;

      let extractedCount = 0;
      let linkedCount = 0;

      for (const candidate of validated.data.knowledge) {
        const wasNew = await upsertKnowledgeCandidate(supabase, job.project_id, candidate, projectDomain);
        if (wasNew) extractedCount++;
        linkedCount++;
      }

      for (const decision of validated.data.decisions) {
        await supabase.from("decision_memory").insert({
          project_id: job.project_id,
          decision_title: maskSecrets(decision.decision_title),
          question: maskSecrets(decision.question),
          rationale: maskSecrets(decision.rationale),
          outcome: decision.outcome,
          source_reference: "brain",
        });
      }

      await supabase
        .from("knowledge_extraction_jobs")
        .update({ status: "ready", extracted_count: extractedCount, linked_count: linkedCount, completed_at: new Date().toISOString() })
        .eq("id", jobId);
    } catch (err) {
      await supabase
        .from("knowledge_extraction_jobs")
        .update({ status: "failed", last_error: err instanceof Error ? err.message : "خطأ غير متوقع" })
        .eq("id", jobId);
    }
  }

  static async getState(projectId: string) {
    const supabase = createServiceClient();
    const { data } = await supabase.from("knowledge_extraction_jobs").select("*").eq("project_id", projectId).maybeSingle();
    return { job: (data as KnowledgeExtractionJob | null) ?? null };
  }
}

/**
 * يبحث عن معرفة مشابهة موجودة فعلًا (Cosine Similarity عبر pgvector).
 * لو لقى تطابق قوي: يزوّد occurrence_count + يربط المشروع كمصدر إضافي
 * (Dedup — نفس الدرس بعنوان مختلف مش هيتكرر كصف جديد). لو مفيش تطابق:
 * يُنشئ صف جديد بـ status='candidate'. يرجّع true لو الصف كان جديد كليًا.
 */
async function upsertKnowledgeCandidate(supabase: SupabaseClient, projectId: string, candidate: KnowledgeCandidate, projectDomain: string | null): Promise<boolean> {
  const embeddingText = `${candidate.title}\n${candidate.content}`;
  const embeddingResult = await AIService.embed(embeddingText, { projectId });
  const embedding = embeddingResult.success ? embeddingResult.embedding : null;

  let matchId: string | null = null;
  let matchOccurrence = 0;
  let matchStatus: "candidate" | "validated" | "approved" | "rejected" = "candidate";

  if (embedding) {
    const { data: matches } = await supabase.rpc("match_organizational_knowledge", {
      query_embedding: embedding,
      match_threshold: 0.5,
      match_count: 1,
    });
    const top = (matches as Array<{ id: string; similarity: number; occurrence_count: number; status: string }> | null)?.[0];
    if (top && isDuplicateMatch(top.similarity)) {
      matchId = top.id;
      matchOccurrence = top.occurrence_count;
      matchStatus = top.status as typeof matchStatus;
    }
  }

  const maskedTitle = maskSecrets(candidate.title);
  const maskedContent = maskSecrets(candidate.content);
  const evidence = candidate.evidence.map((e) => ({ source_type: e.source_type, detail: maskSecrets(e.detail) }));

  if (matchId) {
    const newOccurrence = matchOccurrence + 1;
    await supabase
      .from("organizational_knowledge")
      .update({ occurrence_count: newOccurrence, status: nextKnowledgeStatus(matchStatus, newOccurrence) })
      .eq("id", matchId);
    await linkKnowledgeSource(supabase, matchId, projectId, candidate.evidence[0]?.source_type ?? "brain");
    return false;
  }

  const { data: created, error } = await supabase
    .from("organizational_knowledge")
    .insert({
      category: candidate.category,
      title: maskedTitle,
      content: maskedContent,
      evidence,
      confidence_score: candidate.confidence_score,
      occurrence_count: 1,
      status: "candidate",
      embedding,
      domain: projectDomain,
      learned_weight: candidate.confidence_score,
    })
    .select("id")
    .single();
  if (error || !created) return false;

  await linkKnowledgeSource(supabase, created.id, projectId, candidate.evidence[0]?.source_type ?? "brain");
  return true;
}

async function linkKnowledgeSource(supabase: SupabaseClient, knowledgeId: string, projectId: string, sourceType: KnowledgeSourceType) {
  await supabase
    .from("organizational_knowledge_sources")
    .upsert({ knowledge_id: knowledgeId, project_id: projectId, source_type: sourceType }, { onConflict: "knowledge_id,project_id,source_type" });
}
