import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { AIService } from "@/lib/ai/service";
import { hashInput } from "@/lib/ai-platform/cache/keys";
import type { KnowledgeEntryDraft, SourceDomain } from "./types";
import { DOMAIN_OBJECT_TYPE } from "./types";
import {
  buildKnowledgeEntryForDiscoveryAnalysis,
  buildKnowledgeEntryForMeeting,
  buildKnowledgeEntryForBrainEntry,
  buildKnowledgeEntryForPersona,
  buildKnowledgeEntryForUserFlow,
  buildKnowledgeEntryForRequirement,
  buildKnowledgeEntryForBusinessRule,
  buildKnowledgeEntryForUserStory,
  buildKnowledgeEntryForAcceptanceCriterion,
  buildKnowledgeEntryForMarketResearchEvidence,
  buildKnowledgeEntryForProblemValidationEvidence,
  buildKnowledgeEntryForDecisionMemory,
  buildKnowledgeEntryForMeetingDecision,
  buildKnowledgeEntryForKnowledgeDecision,
  buildKnowledgeEntryForRisk,
  buildKnowledgeEntryForPrd,
  buildKnowledgeEntryForEvaluationScenario,
  buildKnowledgeEntryForPrototypeReview,
  buildKnowledgeEntryForClientApproval,
  buildKnowledgeEntryForHandoffItem,
  buildKnowledgeEntryForProposal,
  buildKnowledgeEntryForContract,
  buildKnowledgeEntryForTask,
  buildKnowledgeEntryForMeetingQuestion,
  buildKnowledgeEntryForSystemMessage,
} from "./mappers";

/**
 * مزامنة المعرفة لمساعد المشروع (Phase A) — تغذية `knowledge_memory`
 * من كل مصادر المشروع المهيكلة.
 *
 * ## المكان في المنظومة
 *
 * موازٍ لـ `lib/knowledge-hub/memory-service.ts` (اللي بيفهرس كائنات
 * knowledge_* المستخرجة بالـ AI): ده بيفهرس مصادر "المُؤلَّفة يدويًا/
 * المُنتَجة من الأدوات" (Discovery/Meetings/Brain/Personas/Flows/...)
 * بنفس الفهرس الموحّد (`knowledge_memory`)، عشان الاسترجاع (Phase B)
 * يقدر يدوّر عبر كل الأنواع مرة واحدة.
 *
 * **مصادر مؤجّلة (خارج Phase A):**
 *   - `discovery_questions` (0020): الجدول مالوش project_id مباشر
 *     (مرتبط عبر template_id → discovery_form_templates → مشاريع
 *     متعددة محتملة). يحتاج قرار حاسم إزاي نحل project_id قبل الفهرسة —
 *     مؤجّل لـ Phase B عشان ما نخمّنش.
 *   - Brain v2 (`brain_review_objects`) بنسخها الكاملة (`brain_review_object_versions`):
 *     نظام إصدارات معقّد بذاته. Phase A بتفهرس `project_brain_entries`
 *     البسيط (ملاحظات/قرارات/روابط/مخاطر/أسئلة يدوية) كنقطة بداية آمنة؛
 *     ربط brain_review_objects الكامل مؤجّل لـ Phase C (الأثر على سياق
 *     توليد PRD/العروض محتاج تصميم أدق لأولوية المصدر).
 */

/** الحالات اللي بتعني "استُبدل هذا الصف" لكل مصدر بيدعم استبدال. */
const SUPERSEDED_STATUS_BY_DOMAIN: Partial<Record<SourceDomain, Set<string>>> = {
  meeting_decision: new Set(["superseded"]),
  knowledge_decision: new Set(["superseded", "reversed"]),
  proposal: new Set(["superseded"]),
};

export type SyncOutcome = "indexed" | "skipped" | "not_found" | "failed";

interface FetchResult {
  draft: KnowledgeEntryDraft;
  /** لو المصدر عنده حالة "استُبدل"، الـ id للصف الأحدث لو معروف (meeting_decision فقط). */
  supersededByDomainId?: string | null;
}

async function fetchAndBuild(
  supabase: SupabaseClient,
  projectId: string,
  domain: SourceDomain,
  objectId: string
): Promise<FetchResult | null> {
  switch (domain) {
    case "discovery_analysis": {
      const { data } = await supabase
        .from("discovery_analyses")
        .select("id, project_id, status, output, version")
        .eq("project_id", projectId)
        .eq("id", objectId)
        .maybeSingle();
      if (!data) return null;
      return { draft: buildKnowledgeEntryForDiscoveryAnalysis(data) };
    }
    case "meeting": {
      const { data } = await supabase
        .from("meetings")
        .select("id, project_id, title, meeting_date, status")
        .eq("project_id", projectId)
        .eq("id", objectId)
        .maybeSingle();
      if (!data) return null;
      return { draft: buildKnowledgeEntryForMeeting(data) };
    }
    case "brain_entry": {
      const { data } = await supabase
        .from("project_brain_entries")
        .select("id, project_id, entry_type, content")
        .eq("project_id", projectId)
        .eq("id", objectId)
        .maybeSingle();
      if (!data) return null;
      return { draft: buildKnowledgeEntryForBrainEntry(data) };
    }
    case "persona": {
      const { data } = await supabase
        .from("product_personas")
        .select("id, project_id, name, role, segment, jobs_to_be_done, goals, pains, is_primary")
        .eq("project_id", projectId)
        .eq("id", objectId)
        .maybeSingle();
      if (!data) return null;
      return { draft: buildKnowledgeEntryForPersona(data) };
    }
    case "user_flow": {
      const { data } = await supabase
        .from("user_flows")
        .select("id, project_id, name, description, flow_type, trigger_event, success_outcome")
        .eq("project_id", projectId)
        .eq("id", objectId)
        .maybeSingle();
      if (!data) return null;
      return { draft: buildKnowledgeEntryForUserFlow(data) };
    }
    case "product_requirement": {
      const { data } = await supabase
        .from("product_requirements")
        .select("id, project_id, code, title, description, requirement_type, priority, status, rationale")
        .eq("project_id", projectId)
        .eq("id", objectId)
        .maybeSingle();
      if (!data) return null;
      return { draft: buildKnowledgeEntryForRequirement(data) };
    }
    case "business_rule": {
      const { data } = await supabase
        .from("business_rules")
        .select("id, project_id, title, trigger_condition, threshold_value, on_violation, enforcement_point")
        .eq("project_id", projectId)
        .eq("id", objectId)
        .maybeSingle();
      if (!data) return null;
      return { draft: buildKnowledgeEntryForBusinessRule(data) };
    }
    case "user_story": {
      const { data } = await supabase
        .from("user_stories")
        .select("id, project_id, code, title, as_a, i_want, so_that, status")
        .eq("project_id", projectId)
        .eq("id", objectId)
        .maybeSingle();
      if (!data) return null;
      return { draft: buildKnowledgeEntryForUserStory(data) };
    }
    case "acceptance_criteria": {
      const { data } = await supabase
        .from("acceptance_criteria")
        .select("id, project_id, user_story_id, title, given_clause, when_clause, then_clause, status")
        .eq("project_id", projectId)
        .eq("id", objectId)
        .maybeSingle();
      if (!data) return null;
      return { draft: buildKnowledgeEntryForAcceptanceCriterion(data) };
    }
    case "market_research_evidence": {
      const { data } = await supabase
        .from("market_research_items")
        .select("id, project_id, item_type, title, summary, information_class, confidentiality")
        .eq("project_id", projectId)
        .eq("id", objectId)
        .maybeSingle();
      if (!data) return null;
      return { draft: buildKnowledgeEntryForMarketResearchEvidence(data) };
    }
    case "problem_validation_evidence": {
      const { data } = await supabase
        .from("problem_validation_items")
        .select("id, project_id, evidence_type, title, pain_point, quote, information_class, confidentiality")
        .eq("project_id", projectId)
        .eq("id", objectId)
        .maybeSingle();
      if (!data) return null;
      return { draft: buildKnowledgeEntryForProblemValidationEvidence(data) };
    }
    case "decision_memory": {
      const { data } = await supabase
        .from("decision_memory")
        .select("id, project_id, decision_title, question, rationale, outcome")
        .eq("project_id", projectId)
        .eq("id", objectId)
        .maybeSingle();
      if (!data) return null;
      return { draft: buildKnowledgeEntryForDecisionMemory(data) };
    }
    case "meeting_decision": {
      const { data } = await supabase
        .from("meeting_decisions")
        .select("id, project_id, meeting_id, text, status, superseded_by_id, change_reason")
        .eq("project_id", projectId)
        .eq("id", objectId)
        .maybeSingle();
      if (!data) return null;
      return { draft: buildKnowledgeEntryForMeetingDecision(data), supersededByDomainId: data.superseded_by_id };
    }
    case "knowledge_decision": {
      const { data } = await supabase
        .from("knowledge_decisions")
        .select("id, project_id, decision, rationale, decision_maker, impact, status")
        .eq("project_id", projectId)
        .eq("id", objectId)
        .maybeSingle();
      if (!data) return null;
      return { draft: buildKnowledgeEntryForKnowledgeDecision(data) };
    }
    case "knowledge_risk": {
      const { data } = await supabase
        .from("knowledge_risks")
        .select("id, project_id, description, risk_type, likelihood, severity, mitigation, affected_area, status")
        .eq("project_id", projectId)
        .eq("id", objectId)
        .maybeSingle();
      if (!data) return null;
      return { draft: buildKnowledgeEntryForRisk(data) };
    }
    case "prd": {
      const { data } = await supabase
        .from("prd")
        .select("id, project_id, overview, problem_statement, version, status")
        .eq("project_id", projectId)
        .eq("id", objectId)
        .maybeSingle();
      if (!data) return null;
      return { draft: buildKnowledgeEntryForPrd(data) };
    }
    case "evaluation_scenario": {
      const { data } = await supabase
        .from("evaluation_scenarios")
        .select("id, project_id, code, title, description, category, severity, expected_result")
        .eq("project_id", projectId)
        .eq("id", objectId)
        .maybeSingle();
      if (!data) return null;
      return { draft: buildKnowledgeEntryForEvaluationScenario(data) };
    }
    case "prototype_review": {
      const { data } = await supabase
        .from("prototype_review")
        .select("id, project_id, repo_url, completion_percentage, overall_status, version")
        .eq("project_id", projectId)
        .eq("id", objectId)
        .maybeSingle();
      if (!data) return null;
      return { draft: buildKnowledgeEntryForPrototypeReview(data) };
    }
    case "client_approval": {
      const { data } = await supabase
        .from("client_approvals")
        .select("id, project_id, target_type, title, status, decision, decision_note")
        .eq("project_id", projectId)
        .eq("id", objectId)
        .maybeSingle();
      if (!data) return null;
      return { draft: buildKnowledgeEntryForClientApproval(data) };
    }
    case "handoff_item": {
      const { data } = await supabase
        .from("handoff_items")
        .select("id, project_id, item_key, status, content_text, notes")
        .eq("project_id", projectId)
        .eq("id", objectId)
        .maybeSingle();
      if (!data) return null;
      return { draft: buildKnowledgeEntryForHandoffItem(data) };
    }
    case "proposal": {
      const { data } = await supabase
        .from("proposals")
        .select("id, project_id, title, status, total_amount, currency, version")
        .eq("project_id", projectId)
        .eq("id", objectId)
        .maybeSingle();
      if (!data) return null;
      return { draft: buildKnowledgeEntryForProposal(data) };
    }
    case "contract": {
      const { data } = await supabase
        .from("contracts")
        .select("id, project_id, title, status, total_amount, currency")
        .eq("project_id", projectId)
        .eq("id", objectId)
        .maybeSingle();
      if (!data) return null;
      return { draft: buildKnowledgeEntryForContract(data) };
    }
    case "workspace_task": {
      const { data } = await supabase
        .from("workspace_tasks")
        .select("id, project_id, title, description, status, priority")
        .eq("project_id", projectId)
        .eq("id", objectId)
        .maybeSingle();
      if (!data) return null;
      return { draft: buildKnowledgeEntryForTask(data) };
    }
    case "meeting_question": {
      const { data } = await supabase
        .from("meeting_questions")
        .select("id, project_id, meeting_id, text, status, answer")
        .eq("project_id", projectId)
        .eq("id", objectId)
        .maybeSingle();
      if (!data) return null;
      return { draft: buildKnowledgeEntryForMeetingQuestion(data) };
    }
    case "system_message": {
      const { data } = await supabase
        .from("system_messages")
        .select("id, project_id, event_name, message_type, message_text")
        .eq("project_id", projectId)
        .eq("id", objectId)
        .maybeSingle();
      if (!data) return null;
      return { draft: buildKnowledgeEntryForSystemMessage(data) };
    }
    default:
      return null;
  }
}

/**
 * ينفّذ مزامنة كائن واحد فعليًا — بيرجّع النتيجة (indexed/skipped/...)
 * عشان `rebuildProjectKnowledge` يقدر يجمّع عدّادات دقيقة. `syncKnowledgeEntry`
 * العام غلاف رقيق فوقه (بيرجّع void بس، زي التوقيع المطلوب).
 */
async function syncOne(
  supabase: SupabaseClient,
  projectId: string,
  domain: SourceDomain,
  objectId: string
): Promise<SyncOutcome> {
  const fetched = await fetchAndBuild(supabase, projectId, domain, objectId);
  if (!fetched) return "not_found";

  const { draft, supersededByDomainId } = fetched;
  const objectType = DOMAIN_OBJECT_TYPE[domain];
  const newHash = hashInput(draft.content);

  const { data: existing } = await supabase
    .from("knowledge_memory")
    .select("id, content_hash")
    .eq("object_type", objectType)
    .eq("object_id", draft.objectId)
    .maybeSingle();

  const supersededStatuses = SUPERSEDED_STATUS_BY_DOMAIN[domain];
  const isSuperseded = !!(supersededStatuses && draft.status && supersededStatuses.has(draft.status));

  // النص ما اتغيّرش — نتخطّى الـ embedding، لكن لسه لازم نحدّث علم
  // "استُبدل" لو الحالة تغيّرت من active لـ superseded من غير ما النصّ يتغيّر.
  if (existing && existing.content_hash === newHash) {
    if (isSuperseded) {
      await markSuperseded(supabase, existing.id, domain, supersededByDomainId, projectId);
    }
    return "skipped";
  }

  const embeddingResult = await AIService.embed(
    draft.title ? `${draft.title}\n${draft.content}` : draft.content,
    { projectId }
  );
  if (!embeddingResult.success || !embeddingResult.embedding) {
    console.error(
      `[ProjectAssistant] فشل embedding للمصدر ${domain}:${objectId}: ${embeddingResult.error?.message}`
    );
    return "failed";
  }

  const { data: upserted, error } = await supabase
    .from("knowledge_memory")
    .upsert(
      {
        project_id: projectId,
        object_type: objectType,
        object_id: draft.objectId,
        title: draft.title,
        source_title: draft.sourceTitle || draft.title,
        content: draft.content,
        embedding: embeddingResult.embedding,
        domain: draft.domain,
        content_hash: newHash,
        classification: draft.classification,
        confidentiality: draft.confidentiality,
        status: draft.status,
        version: draft.version,
        metadata: draft.metadata,
        is_current: !isSuperseded,
        is_superseded: isSuperseded,
        indexed_at: new Date().toISOString(),
      },
      { onConflict: "object_type,object_id" }
    )
    .select("id")
    .maybeSingle();

  if (error || !upserted) {
    console.error(`[ProjectAssistant] فشل upsert للمصدر ${domain}:${objectId}: ${error?.message}`);
    return "failed";
  }

  if (isSuperseded) {
    await markSuperseded(supabase, upserted.id, domain, supersededByDomainId, projectId);
  }

  return "indexed";
}

/** يعلّم صفّ ذاكرة كـ "مُستبدَل" — ولو المصدر عارف مين استبدله، بيربط `superseded_by`. */
async function markSuperseded(
  supabase: SupabaseClient,
  knowledgeMemoryId: string,
  domain: SourceDomain,
  supersededByDomainId: string | null | undefined,
  projectId: string
): Promise<void> {
  let supersededByMemoryId: string | null = null;

  if (domain === "meeting_decision" && supersededByDomainId) {
    const { data: newer } = await supabase
      .from("knowledge_memory")
      .select("id")
      .eq("object_type", "decision")
      .eq("object_id", supersededByDomainId)
      .eq("project_id", projectId)
      .maybeSingle();
    supersededByMemoryId = newer?.id ?? null;
  }

  await supabase
    .from("knowledge_memory")
    .update({ is_current: false, is_superseded: true, superseded_by: supersededByMemoryId })
    .eq("id", knowledgeMemoryId);
}

/**
 * نقطة الدخول العامة لمزامنة كائن مصدر واحد. بترجّع void (زي ما هو
 * مطلوب) — استخدم `rebuildProjectKnowledge` لو محتاج عدّادات مجمَّعة.
 */
export async function syncKnowledgeEntry(
  supabase: SupabaseClient,
  projectId: string,
  domain: SourceDomain,
  objectId: string
): Promise<void> {
  await syncOne(supabase, projectId, domain, objectId);
}

// ============================================================
// إعادة بناء كاملة — الحل الآمن "أصلح الفهرس من غير ما تلمس المصدر"
// ============================================================

export interface RebuildOutcome {
  indexed: number;
  skipped: number;
  failed: number;
}

/** كل المصادر اللي بتتفهرس، وكيف نجيب كل الـ ids بتاعتها لمشروع معيّن. */
const DOMAIN_LISTERS: Record<SourceDomain, (supabase: SupabaseClient, projectId: string) => Promise<string[]>> = {
  discovery_analysis: async (s, p) => listIds(s, "discovery_analyses", p),
  meeting: async (s, p) => listIds(s, "meetings", p),
  brain_entry: async (s, p) => listIds(s, "project_brain_entries", p),
  persona: async (s, p) => listIds(s, "product_personas", p),
  user_flow: async (s, p) => listIds(s, "user_flows", p),
  product_requirement: async (s, p) => listIds(s, "product_requirements", p),
  business_rule: async (s, p) => listIds(s, "business_rules", p),
  user_story: async (s, p) => listIds(s, "user_stories", p),
  acceptance_criteria: async (s, p) => listIds(s, "acceptance_criteria", p),
  market_research_evidence: async (s, p) => listIds(s, "market_research_items", p),
  problem_validation_evidence: async (s, p) => listIds(s, "problem_validation_items", p),
  decision_memory: async (s, p) => listIds(s, "decision_memory", p),
  meeting_decision: async (s, p) => listIds(s, "meeting_decisions", p),
  knowledge_decision: async (s, p) => listIds(s, "knowledge_decisions", p),
  knowledge_risk: async (s, p) => listIds(s, "knowledge_risks", p),
  prd: async (s, p) => listIds(s, "prd", p),
  evaluation_scenario: async (s, p) => listIds(s, "evaluation_scenarios", p),
  prototype_review: async (s, p) => listIds(s, "prototype_review", p),
  client_approval: async (s, p) => listIds(s, "client_approvals", p),
  handoff_item: async (s, p) => listIds(s, "handoff_items", p),
  proposal: async (s, p) => listIds(s, "proposals", p),
  contract: async (s, p) => listIds(s, "contracts", p),
  workspace_task: async (s, p) => listIds(s, "workspace_tasks", p),
  meeting_question: async (s, p) => listIds(s, "meeting_questions", p),
  system_message: async (s, p) => listIds(s, "system_messages", p),
};

async function listIds(supabase: SupabaseClient, table: string, projectId: string): Promise<string[]> {
  const { data, error } = await supabase.from(table).select("id").eq("project_id", projectId).limit(5000);
  if (error || !data) return [];
  return (data as Array<{ id: string }>).map((r) => r.id);
}

/**
 * يعيد بناء فهرس المعرفة لمشروع بالكامل — عبر كل المصادر. Idempotent
 * وآمن لإعادة التشغيل في أي وقت (الحل الاحتياطي: "أصلح الفهرس من غير ما
 * تلمس المصدر"). فشل مصدر واحد أو صفّ واحد ما بيوقّفش الباقي — best-effort
 * زي نمط `mergeMeetingIntoBrain` في lib/meetings/pipeline.ts.
 */
export async function rebuildProjectKnowledge(projectId: string): Promise<RebuildOutcome> {
  const supabase = createServiceClient();
  const outcome: RebuildOutcome = { indexed: 0, skipped: 0, failed: 0 };

  for (const domain of Object.keys(DOMAIN_LISTERS) as SourceDomain[]) {
    let ids: string[] = [];
    try {
      ids = await DOMAIN_LISTERS[domain](supabase, projectId);
    } catch (err) {
      console.error(`[ProjectAssistant] فشل جلب قائمة المصدر ${domain} للمشروع ${projectId}:`, err);
      continue; // مصدر واحد فشل ما بيوقّفش باقي المصادر
    }

    for (const id of ids) {
      try {
        const result = await syncOne(supabase, projectId, domain, id);
        if (result === "indexed") outcome.indexed += 1;
        else if (result === "skipped") outcome.skipped += 1;
        else if (result === "failed") outcome.failed += 1;
        // "not_found" نادرة (race condition: الصف اتمسح بين الجلب والمزامنة) — تُتجاهل بصمت.
      } catch (err) {
        console.error(`[ProjectAssistant] فشل مزامنة ${domain}:${id}:`, err);
        outcome.failed += 1;
      }
    }
  }

  return outcome;
}
