/**
 * NEXVORA Sector Standards — Client Variant Clone Service (0123، المرحلة أ)
 * =============================================================================
 * جوهر المرحلة أ: استنساخ عميق (لقطة، مش وراثة حيّة) لبيانات منتج مشروع
 * Sector Standard إلى مشروع Client Variant جديد. كل نطاق بيانات (Personas/
 * Flows/Requirements/Business Rules/System Messages/Stories/AC/State
 * Machines/PRD/Evaluation Scenarios) بيتم استنساخه عبر دوال create*
 * الموجودة فعلًا لكل نطاق (مش نسخ SQL خام) — نفس الضمانات (توليد code،
 * defaults، إلخ) اللي بتنطبق على أي إدخال يدوي عادي.
 *
 * ضمان أساسي: كل مرجع FK-شكل (linkedPersonaId، linkedFlowId، userStoryId،
 * linkedRequirementId، linkedStoryId...) بيتحوّل عبر خريطة
 * old-id → new-id مبنية أثناء الاستنساخ نفسه — الصفوف المستنسخة بتشاور
 * بعضها البعض في المشروع الجديد، مش المشروع المصدر أبدًا.
 *
 * ترتيب الاستنساخ (تبعية): Personas → Flows → Requirements → Stories →
 * (Acceptance Criteria / Business Rules / System Messages / State Machines
 * / Evaluation Scenarios) → PRD.
 *
 * مرونة الفشل الجزئي: نفس نمط `rebuildProjectKnowledge`
 * (lib/project-assistant/knowledge-ingestion.ts) بالضبط — فشل نطاق واحد
 * ما بيوقفش الباقي، ومفيش معاملة قاعدة بيانات واحدة تلف كل الخطوات (قرار
 * معماري مقصود — راجع التقرير النهائي لتفاصيل السبب).
 */
import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { ensureProjectWorkspace } from "@/lib/portfolio/service";

import { listPersonas, createPersona, listFlows, createFlow, listRequirements, createRequirement } from "@/lib/product-definition/service";
import { listBusinessRules, createBusinessRule } from "@/lib/product-definition/business-rules-service";
import { listSystemMessages, createSystemMessage } from "@/lib/product-definition/system-messages-service";
import { listStateMachines, createStateMachine } from "@/lib/product-definition/state-machine-service";
import { listStories, createStory, listAcceptanceCriteria, createAc } from "@/lib/user-stories/service";
import { listScenarios, createScenario } from "@/lib/evaluation/service";

export interface CloneOutcome {
  clientProjectId: string;
  cloned: { domain: string; count: number }[];
  failed: { domain: string; error: string }[];
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** ينفّذ نطاق استنساخ واحد بمرونة — فشله لا يوقف باقي النطاقات (نفس نمط rebuildProjectKnowledge). */
async function runDomain(
  domain: string,
  fn: () => Promise<number>,
  cloned: { domain: string; count: number }[],
  failed: { domain: string; error: string }[]
): Promise<void> {
  try {
    const count = await fn();
    cloned.push({ domain, count });
  } catch (err) {
    console.error(`[SectorStandards] فشل استنساخ نطاق ${domain}:`, err);
    failed.push({ domain, error: errMsg(err) });
  }
}

/**
 * ينشئ مشروع Client Variant جديد عن طريق استنساخ عميق لمشروع Sector
 * Standard. يرمي خطأ واضح لو المصدر مش Standard فعلي أو مش عليه رقم
 * إصدار — كل ما بعد ذلك (بيانات المنتج) مرن جزئيًا: صف المشروع + رابط
 * الاستنساخ لازم ينجحوا، أي نطاق بيانات تاني ممكن يفشل بدون ما يمنع
 * باقي النطاقات ولا يترك المشروع في حالة نصف مكسورة غير قابلة للاستخدام.
 */
export async function createClientVariant(
  standardProjectId: string,
  clientId: string | null,
  clientProjectName: string,
  actorId: string | null
): Promise<CloneOutcome> {
  const svc = createServiceClient();

  // ---------- 1) التحقق من المصدر ----------
  const { data: standard, error: standardErr } = await svc
    .from("projects")
    .select("id, project_type, is_sector_standard, standard_version")
    .eq("id", standardProjectId)
    .maybeSingle();
  if (standardErr) throw standardErr;
  if (!standard) throw new Error("مشروع الـ Standard المصدر غير موجود.");
  if (!standard.is_sector_standard) {
    throw new Error("المشروع المحدد ليس Sector Standard — لازم يكون معلَّم is_sector_standard = true أولًا.");
  }
  if (!standard.standard_version || !String(standard.standard_version).trim()) {
    throw new Error("الـ Standard المصدر لازم يكون له رقم إصدار (standard_version) قبل استنساخه.");
  }
  const standardVersionSnapshot = String(standard.standard_version).trim();

  const trimmedName = clientProjectName.trim();
  if (!trimmedName) throw new Error("اسم مشروع العميل مطلوب.");

  // ---------- 2) إنشاء صف المشروع الجديد ----------
  // نورّث project_type فقط (نوع المنتج — website/mobile_app/... — مفهوم
  // ينتقل بمعنى حقيقي لأن الـ Client Variant غالبًا نفس نوع منتج الـ
  // Standard). باقي أعمدة projects (stage/owner/price/mode...) تبدأ
  // بقيمها الافتراضية العادية — المشروع الجديد مستقل تمامًا، مش لقطة كاملة
  // من صف projects نفسه، بس من بيانات المنتج المرتبطة بيه.
  const { data: newProject, error: newProjectErr } = await svc
    .from("projects")
    .insert({
      client_id: clientId,
      name: trimmedName,
      project_type: standard.project_type,
      workflow_mode: "standard_based",
      is_sector_standard: false,
      owner_id: actorId,
    })
    .select("id")
    .single();
  if (newProjectErr || !newProject) {
    throw new Error(`فشل إنشاء مشروع Client Variant: ${newProjectErr?.message ?? "سبب غير معروف"}`);
  }
  const clientProjectId = newProject.id as string;

  // ---------- 3) لقطة رابط الاستنساخ ----------
  const { error: linkErr } = await svc.from("project_standard_links").insert({
    client_project_id: clientProjectId,
    standard_project_id: standardProjectId,
    standard_version_snapshot: standardVersionSnapshot,
    created_by: actorId,
  });
  if (linkErr) {
    throw new Error(`فشل إنشاء رابط الاستنساخ: ${linkErr.message}`);
  }

  // ---------- 4) تهيئة مساحة عمل المشروع (best-effort، نفس نمط convert-lead-action) ----------
  try {
    await ensureProjectWorkspace(clientProjectId, actorId);
  } catch (err) {
    console.error("[SectorStandards] ensureProjectWorkspace فشل:", errMsg(err));
  }

  // ---------- 5) استنساخ بيانات المنتج (best-effort لكل نطاق) ----------
  const cloned: { domain: string; count: number }[] = [];
  const failed: { domain: string; error: string }[] = [];

  const personaIdMap = new Map<string, string>();
  const flowIdMap = new Map<string, string>();
  const requirementIdMap = new Map<string, string>();
  const storyIdMap = new Map<string, string>();

  const mappedPersona = (id: string | null) => (id ? personaIdMap.get(id) ?? null : null);
  const mappedFlow = (id: string | null) => (id ? flowIdMap.get(id) ?? null : null);

  await runDomain(
    "personas",
    async () => {
      const source = await listPersonas(standardProjectId);
      for (const p of source) {
        const created = await createPersona(
          clientProjectId,
          {
            name: p.name,
            role: p.role,
            segment: p.segment,
            jobsToBeDone: p.jobsToBeDone,
            goals: p.goals,
            pains: p.pains,
            channels: p.channels,
            techSavviness: p.techSavviness,
            notes: p.notes,
            isPrimary: p.isPrimary,
            sourceBrainItemKey: null,
          },
          actorId
        );
        personaIdMap.set(p.id, created.id);
      }
      return source.length;
    },
    cloned,
    failed
  );

  await runDomain(
    "user_flows",
    async () => {
      const source = await listFlows(standardProjectId);
      for (const f of source) {
        const created = await createFlow(
          clientProjectId,
          {
            personaId: mappedPersona(f.personaId),
            name: f.name,
            description: f.description,
            flowType: f.flowType,
            triggerEvent: f.triggerEvent,
            successOutcome: f.successOutcome,
            steps: f.steps,
            notes: f.notes,
          },
          actorId
        );
        flowIdMap.set(f.id, created.id);
      }
      return source.length;
    },
    cloned,
    failed
  );

  await runDomain(
    "product_requirements",
    async () => {
      const source = await listRequirements(standardProjectId);
      for (const r of source) {
        const created = await createRequirement(
          clientProjectId,
          {
            code: r.code,
            title: r.title,
            description: r.description,
            requirementType: r.requirementType,
            priority: r.priority,
            status: r.status,
            rationale: r.rationale,
            acceptanceHint: r.acceptanceHint,
            effortEstimate: r.effortEstimate,
            linkedPersonaId: mappedPersona(r.linkedPersonaId),
            linkedFlowId: mappedFlow(r.linkedFlowId),
            tags: r.tags,
            sourceBrainItemKey: null,
          },
          actorId
        );
        requirementIdMap.set(r.id, created.id);
      }
      return source.length;
    },
    cloned,
    failed
  );

  await runDomain(
    "user_stories",
    async () => {
      const source = await listStories(standardProjectId);
      for (const s of source) {
        const created = await createStory(
          clientProjectId,
          {
            code: s.code,
            title: s.title,
            asA: s.asA,
            iWant: s.iWant,
            soThat: s.soThat,
            narrativeExtra: s.narrativeExtra,
            status: s.status,
            storyPoints: s.storyPoints,
            businessValue: s.businessValue,
            riskLevel: s.riskLevel,
            linkedPersonaId: mappedPersona(s.linkedPersonaId),
            linkedFlowId: mappedFlow(s.linkedFlowId),
            linkedRequirementId: s.linkedRequirementId ? requirementIdMap.get(s.linkedRequirementId) ?? null : null,
            tags: s.tags,
          },
          actorId
        );
        storyIdMap.set(s.id, created.id);
      }
      return source.length;
    },
    cloned,
    failed
  );

  await runDomain(
    "acceptance_criteria",
    async () => {
      const source = await listAcceptanceCriteria(standardProjectId);
      let count = 0;
      for (const ac of source) {
        const newUserStoryId = storyIdMap.get(ac.userStoryId);
        if (!newUserStoryId) {
          // القصة الأم فشل استنساخها (أو مش موجودة) — تخطّي المعيار ده
          // بدل ما يكسر باقي المعايير التابعة لقصص نجحت.
          continue;
        }
        await createAc(
          clientProjectId,
          {
            userStoryId: newUserStoryId,
            code: ac.code,
            orderIndex: ac.orderIndex,
            title: ac.title,
            givenClause: ac.givenClause,
            whenClause: ac.whenClause,
            thenClause: ac.thenClause,
            andConditions: ac.andConditions,
            status: ac.status,
            notes: ac.notes,
          },
          actorId
        );
        count += 1;
      }
      return count;
    },
    cloned,
    failed
  );

  await runDomain(
    "business_rules",
    async () => {
      const source = await listBusinessRules(standardProjectId);
      for (const r of source) {
        await createBusinessRule(
          clientProjectId,
          {
            title: r.title,
            triggerCondition: r.triggerCondition,
            thresholdValue: r.thresholdValue,
            onViolation: r.onViolation,
            enforcementPoint: r.enforcementPoint,
            linkedFlowId: mappedFlow(r.linkedFlowId),
            linkedPersonaId: mappedPersona(r.linkedPersonaId),
            notes: r.notes,
          },
          actorId
        );
      }
      return source.length;
    },
    cloned,
    failed
  );

  await runDomain(
    "system_messages",
    async () => {
      const source = await listSystemMessages(standardProjectId);
      for (const m of source) {
        await createSystemMessage(
          clientProjectId,
          {
            eventName: m.eventName,
            messageType: m.messageType,
            messageText: m.messageText,
            linkedFlowId: mappedFlow(m.linkedFlowId),
            linkedPersonaId: mappedPersona(m.linkedPersonaId),
            notes: m.notes,
          },
          actorId
        );
      }
      return source.length;
    },
    cloned,
    failed
  );

  await runDomain(
    "state_machines",
    async () => {
      const source = await listStateMachines(standardProjectId);
      for (const sm of source) {
        await createStateMachine(
          clientProjectId,
          {
            name: sm.name,
            description: sm.description,
            states: sm.states,
            transitions: sm.transitions,
            linkedPersonaId: mappedPersona(sm.linkedPersonaId),
            linkedFlowId: mappedFlow(sm.linkedFlowId),
            notes: sm.notes,
          },
          actorId
        );
      }
      return source.length;
    },
    cloned,
    failed
  );

  await runDomain(
    "evaluation_scenarios",
    async () => {
      const source = await listScenarios(standardProjectId);
      for (const sc of source) {
        await createScenario(
          clientProjectId,
          {
            code: sc.code,
            title: sc.title,
            description: sc.description,
            category: sc.category,
            severity: sc.severity,
            preconditions: sc.preconditions,
            steps: sc.steps,
            expectedResult: sc.expectedResult,
            linkedStoryId: sc.linkedStoryId ? storyIdMap.get(sc.linkedStoryId) ?? null : null,
            linkedFlowId: mappedFlow(sc.linkedFlowId),
            tags: sc.tags,
          },
          actorId
        );
      }
      return source.length;
    },
    cloned,
    failed
  );

  // ---------- 6) PRD — لقطة نقطة بداية للعميل (لو الـ Standard عنده واحد) ----------
  await runDomain(
    "prd",
    async () => {
      const { data: sourcePrd, error: prdErr } = await svc
        .from("prd")
        .select("*")
        .eq("project_id", standardProjectId)
        .maybeSingle();
      if (prdErr) throw prdErr;
      if (!sourcePrd) return 0; // الـ Standard لسه ماعندوش PRD — مش خطأ، تخطّي نظيف.

      const { error: insertErr } = await svc.from("prd").insert({
        project_id: clientProjectId,
        overview: sourcePrd.overview,
        problem_statement: sourcePrd.problem_statement,
        goals: sourcePrd.goals,
        out_of_scope: sourcePrd.out_of_scope,
        target_users: sourcePrd.target_users,
        user_stories: sourcePrd.user_stories,
        acceptance_criteria: sourcePrd.acceptance_criteria,
        functional_requirements: sourcePrd.functional_requirements,
        non_functional_requirements: sourcePrd.non_functional_requirements,
        risks_assumptions: sourcePrd.risks_assumptions,
        success_metrics: sourcePrd.success_metrics,
        business_rules_detail: sourcePrd.business_rules_detail,
        system_messages_detail: sourcePrd.system_messages_detail,
        flow_specifications: sourcePrd.flow_specifications,
        persona_modules: sourcePrd.persona_modules,
        state_machines_detail: sourcePrd.state_machines_detail,
        // نسخة جديدة تمامًا لمشروع جديد — النسخة تبدأ من 1، الحالة 'draft'
        // (قرار حكم: نقطة بداية تحتاج مراجعة/اعتماد من جديد لمشروع العميل،
        // مش "معتمدة" تلقائيًا لمجرد إنها منسوخة من Standard معتمد).
        version: 1,
        status: "draft",
        generated_from_brain_version: null,
        sync_status: "idle",
        last_error: null,
        created_by: actorId,
      });
      if (insertErr) throw insertErr;
      return 1;
    },
    cloned,
    failed
  );

  return { clientProjectId, cloned, failed };
}
