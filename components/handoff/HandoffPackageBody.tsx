import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  HANDOFF_ITEM_REGISTRY,
  HANDOFF_ITEM_STATUS_LABELS,
  HANDOFF_PACKAGE_STATUS_LABELS,
  HANDOFF_QUESTION_STATUS_LABELS,
  HANDOFF_QUESTION_PRIORITY_LABELS,
  HANDOFF_DELIVERY_STATUS_LABELS,
  type HandoffItemDef,
  type HandoffItemRow,
  type HandoffPackageRow,
  type HandoffQuestionRow,
  type HandoffDeliveryRow,
  type HandoffPackageStatus,
  type HandoffItemStatus,
  type HandoffQuestionStatus,
  type HandoffQuestionPriority,
  type HandoffDeliveryStatus,
} from "@/lib/handoff/types";
import {
  MOSCOW_LABELS,
  REQUIREMENT_STATUS_LABELS,
  type RequirementRow,
  type MoscowPriority,
  type RequirementStatus,
} from "@/lib/product-definition/types";
import {
  STORY_STATUS_LABELS,
  RISK_LABELS,
  AC_STATUS_LABELS,
  type UserStoryRow,
  type AcceptanceCriterionRow,
  type StoryStatus,
  type RiskLevel,
  type AcStatus,
} from "@/lib/user-stories/types";
import {
  EVAL_CATEGORY_LABELS,
  EVAL_SEVERITY_LABELS,
  type EvaluationScenarioRow,
  type EvalCategory,
  type EvalSeverity,
} from "@/lib/evaluation/types";
import type {
  PRD, PRDBusinessRuleDetail, PRDSystemMessageDetail, PRDFlowSpecification,
  PRDPersonaModule, PRDStateMachineDetail,
} from "@/lib/types/database";
import { SYSTEM_MESSAGE_TYPE_LABELS } from "@/lib/product-definition/business-rules-types";
import { groupFlowSpecificationsByFlow } from "@/lib/product-definition/flow-step-detail";
import { stateChainString } from "@/lib/product-definition/state-machine-chain";

/**
 * Self-loading server component that renders the full handoff-package body.
 * Used by BOTH the authenticated print page (/handoff-print/[projectId])
 * and the public share page (/handoff-share/[token]).
 *
 * All reads go through the service client — the page-level wrappers are
 * responsible for authorization (login guard for print; HMAC token for share).
 */
interface Props {
  projectId: string;
  /** إن مُمِرَّر، تُحمَّل هذه الحزمة بالتحديد؛ وإلا آخر حزمة. */
  packageId?: string;
  /** إن true، تُعرَض جميع العناصر بغض النظر عن الحالة. */
  includeAll?: boolean;
}

export default async function HandoffPackageBody({ projectId, packageId, includeAll = false }: Props) {
  const supabase = createServiceClient() as unknown as SupabaseClient;

  const { data: project } = await supabase
    .from("projects")
    .select("name, mode")
    .eq("id", projectId)
    .maybeSingle<{ name: string; mode: string | null }>();
  if (!project) {
    return <EmptyPage>المشروع غير موجود.</EmptyPage>;
  }

  const pkg = await loadPackage(supabase, projectId, packageId);
  if (!pkg) return <EmptyPage>لا توجد حزمة تسليم.</EmptyPage>;

  const [items, questions, deliveries] = await Promise.all([
    loadItems(supabase, pkg.id),
    loadQuestions(supabase, pkg.id),
    loadDeliveries(supabase, pkg.id),
  ]);
  const itemsByKey = new Map(items.map((i) => [i.itemKey, i]));

  const [
    problemBrief,
    requirements,
    stories,
    acs,
    prd,
    scenarios,
    scenarioStatusById,
  ] = await Promise.all([
    loadProblemBrief(supabase, projectId, itemsByKey.get("problem_brief")),
    loadRequirements(supabase, projectId),
    loadStories(supabase, projectId),
    loadAcs(supabase, projectId),
    loadPrd(supabase, projectId),
    loadScenarios(supabase, projectId),
    loadScenarioStatuses(supabase, projectId),
  ]);

  const CATEGORY_LABELS: Record<HandoffItemDef["category"], string> = {
    docs: "وثائق",
    code: "كود",
    ops: "تشغيل",
    handover: "تسليم",
    compliance: "امتثال",
  };
  const categories = Array.from(new Set(HANDOFF_ITEM_REGISTRY.map((d) => d.category)));

  const approvedMvpReqs = requirements
    .filter((r) => r.priority === "must" && r.status === "approved");
  const approvedStories = stories.filter((s) => ["approved", "in_dev", "done"].includes(s.status));
  const approvedAcs = acs.filter((a) => a.status === "approved" || a.status === "verified");
  const acsByStory = new Map<string, AcceptanceCriterionRow[]>();
  for (const a of approvedAcs) {
    const list = acsByStory.get(a.userStoryId) ?? [];
    list.push(a);
    acsByStory.set(a.userStoryId, list);
  }
  const approvedScenarios = scenarios.filter((s) => {
    const st = scenarioStatusById.get(s.id) ?? "draft";
    return st === "approved";
  });

  const prototypeItem = itemsByKey.get("prototype_link");
  const prototypeUrl = prototypeItem?.contentUrl && /^https?:\/\//i.test(prototypeItem.contentUrl)
    ? prototypeItem.contentUrl : null;

  /**
   * تحديد أي «قسم عنصر» من الـ 7 الإلزامية يُعرض:
   * - includeAll: كلها.
   * - غير ذلك: فقط اللي حالته completed (لكن الأقسام الإلزامية عادةً بتكون
   *   ذات محتوى مباشر حتى قبل تمييزها completed، فنعرضها لو فيها محتوى
   *   موثَّق حتى لو الحالة pending — عشان الـ PDF المشترك يكون مفيدًا).
   */
  const showSection = (key: string, hasBodyContent: boolean): boolean => {
    if (includeAll) return true;
    const row = itemsByKey.get(key);
    if (row?.status === "completed") return true;
    // Skip pending items that also have no upstream content.
    return hasBodyContent;
  };

  const isTest = project.mode === "test";

  return (
    <div className={`min-h-screen bg-white ${isTest ? "test-project-watermark" : ""}`}>
      <div className="mx-auto max-w-3xl px-8 py-10 text-[#0A1735]" dir="rtl">
        <header className="border-b-2 border-[#3D5CFF] pb-3">
          <h1 className="font-display text-3xl">
            {pkg.title || "حزمة التسليم"} — {project.name}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            v{pkg.version} · الحالة: {HANDOFF_PACKAGE_STATUS_LABELS[pkg.status]}
            {pkg.finalizedAt ? ` · مُسلَّمة في ${new Date(pkg.finalizedAt).toLocaleDateString("ar-EG")}` : ""}
          </p>
          {pkg.notes && <p className="mt-2 text-xs text-slate-600">{pkg.notes}</p>}
        </header>

        {showSection("problem_brief", !!problemBrief) && (
          <ItemSection title="1) صياغة المشكلة (Problem Brief)" row={itemsByKey.get("problem_brief")}>
            {problemBrief ? (
              <div className="space-y-2">
                {problemBrief.title && <p className="font-semibold">{problemBrief.title}</p>}
                {problemBrief.body && (
                  <p className="whitespace-pre-wrap text-[13px] leading-relaxed">{problemBrief.body}</p>
                )}
                {problemBrief.quote && (
                  <blockquote className="border-r-4 border-[#3D5CFF] bg-slate-50 pr-3 py-1 text-[12px] italic text-slate-700">
                    «{problemBrief.quote}»
                  </blockquote>
                )}
                {problemBrief.meta && (
                  <p className="text-[11px] text-slate-500">{problemBrief.meta}</p>
                )}
              </div>
            ) : (
              <EmptyNote>لا يوجد Problem Brief معتمَد.</EmptyNote>
            )}
          </ItemSection>
        )}

        {showSection("scope_mvp", approvedMvpReqs.length > 0) && (
          <ItemSection title="2) نطاق MVP (Requirements)" row={itemsByKey.get("scope_mvp")}>
            {approvedMvpReqs.length === 0 ? (
              <EmptyNote>لا توجد متطلبات MVP (priority=must) معتمَدة.</EmptyNote>
            ) : (
              <ul className="space-y-2">
                {approvedMvpReqs.map((r) => (
                  <li key={r.id} className="break-inside-avoid rounded border border-slate-200 p-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-mono">{r.code ?? "REQ"}</span>
                      <span className="text-[13px] font-semibold">{r.title}</span>
                      <span className="text-[10px] text-slate-500">
                        · {MOSCOW_LABELS[r.priority]} · {REQUIREMENT_STATUS_LABELS[r.status]}
                      </span>
                    </div>
                    {r.description && (
                      <p className="mt-1 whitespace-pre-wrap text-[12px] leading-relaxed text-slate-700">
                        {r.description.length > 500 ? r.description.slice(0, 500) + "…" : r.description}
                      </p>
                    )}
                    {(r.acceptanceHint || r.rationale) && (
                      <p className="mt-1 text-[11px] text-slate-500">
                        {r.rationale && <>مبرِّر: {r.rationale}</>}
                        {r.rationale && r.acceptanceHint && " · "}
                        {r.acceptanceHint && <>معيار قبول مقترح: {r.acceptanceHint}</>}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </ItemSection>
        )}

        {showSection("user_stories", approvedStories.length > 0) && (
          <ItemSection title="3) قصص المستخدم (User Stories)" row={itemsByKey.get("user_stories")}>
            {approvedStories.length === 0 ? (
              <EmptyNote>لا توجد قصص مستخدم معتمَدة.</EmptyNote>
            ) : (
              <ul className="space-y-2">
                {approvedStories.map((s) => (
                  <li key={s.id} className="break-inside-avoid rounded border border-slate-200 p-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-mono">{s.code ?? "US"}</span>
                      <span className="text-[13px] font-semibold">{s.title}</span>
                      <span className="text-[10px] text-slate-500">
                        · {STORY_STATUS_LABELS[s.status]}
                        {s.storyPoints != null ? ` · ${s.storyPoints} نقطة` : ""}
                        {" · مخاطرة: "}{RISK_LABELS[s.riskLevel]}
                      </span>
                    </div>
                    <p className="mt-1 text-[12px] leading-relaxed text-slate-700">
                      <strong>بصفتي</strong> {s.asA || "—"}، <strong>أريد</strong> {s.iWant || "—"}، <strong>لكي</strong> {s.soThat || "—"}.
                    </p>
                    {s.narrativeExtra && (
                      <p className="mt-1 whitespace-pre-wrap text-[11px] text-slate-600">{s.narrativeExtra}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </ItemSection>
        )}

        {showSection("acceptance_criteria", approvedAcs.length > 0) && (
          <ItemSection title="4) معايير القبول (Acceptance Criteria)" row={itemsByKey.get("acceptance_criteria")}>
            {approvedAcs.length === 0 ? (
              <EmptyNote>لا توجد معايير قبول معتمَدة.</EmptyNote>
            ) : (
              <ul className="space-y-3">
                {Array.from(acsByStory.entries()).map(([storyId, list]) => {
                  const story = approvedStories.find((s) => s.id === storyId);
                  return (
                    <li key={storyId} className="break-inside-avoid">
                      <p className="mb-1 text-[12px] font-semibold text-slate-800">
                        {story ? `${story.code ?? "US"} · ${story.title}` : `القصّة ${storyId.slice(0, 8)}`}
                      </p>
                      <ul className="space-y-1.5 pr-3">
                        {list.map((a) => (
                          <li key={a.id} className="rounded border border-slate-200 p-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-mono">{a.code ?? "AC"}</span>
                              {a.title && <span className="text-[12px] font-semibold">{a.title}</span>}
                              <span className="text-[10px] text-slate-500">· {AC_STATUS_LABELS[a.status]}</span>
                            </div>
                            <div className="mt-1 space-y-0.5 text-[12px] leading-relaxed text-slate-700">
                              <p><strong>Given</strong> {a.givenClause || "—"}</p>
                              <p><strong>When</strong> {a.whenClause || "—"}</p>
                              <p><strong>Then</strong> {a.thenClause || "—"}</p>
                              {a.andConditions?.length > 0 && (
                                <ul className="mt-0.5 list-disc pr-5 text-[11px] text-slate-600">
                                  {a.andConditions.map((c, i) => (
                                    <li key={i}><strong>And</strong> {c}</li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </li>
                  );
                })}
                {approvedAcs.filter((a) => !acsByStory.has(a.userStoryId)).map((a) => (
                  <li key={a.id} className="break-inside-avoid rounded border border-slate-200 p-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-mono">{a.code ?? "AC"}</span>
                      {a.title && <span className="text-[12px] font-semibold">{a.title}</span>}
                    </div>
                    <div className="mt-1 space-y-0.5 text-[12px] leading-relaxed text-slate-700">
                      <p><strong>Given</strong> {a.givenClause || "—"}</p>
                      <p><strong>When</strong> {a.whenClause || "—"}</p>
                      <p><strong>Then</strong> {a.thenClause || "—"}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </ItemSection>
        )}

        {showSection("prd_final", !!prd && prd.status === "approved") && (
          <ItemSection title="5) مستند المنتج النهائي (PRD)" row={itemsByKey.get("prd_final")}>
            {!prd || prd.status !== "approved" ? (
              <EmptyNote>
                PRD غير معتمَد بعد{prd ? ` (الحالة: ${prd.status}).` : "."}
              </EmptyNote>
            ) : (
              <div className="space-y-3">
                <p className="text-[11px] text-slate-500">
                  PRD v{prd.version} · تم الاعتماد على Brain v{prd.generated_from_brain_version ?? "—"}
                </p>
                <PrdSection title="نظرة عامة (Overview)" text={prd.overview} />
                <PrdSection title="بيان المشكلة (Problem Statement)" text={prd.problem_statement} />
                <PrdList title="الأهداف (Goals)" items={prd.goals} />
                <PrdList title="خارج النطاق (Out of Scope)" items={prd.out_of_scope} />
                <PrdList title="الفئات المستهدفة (Target Users)" items={prd.target_users} />
                {/*
                  User stories + AC omitted from PRD section on purpose —
                  they have their own dedicated sections (3 قصص المستخدم
                  و 4 معايير القبول) with full source-of-truth content
                  (title + status + points + AC per story). Duplicating
                  them here made the PDF longer and confused readers when
                  the PRD subsection sometimes rendered empty placeholders.
                */}
                {((prd.user_stories?.length ?? 0) > 0 || (prd.acceptance_criteria?.length ?? 0) > 0) && (
                  <p className="rounded border border-dashed border-slate-300 bg-slate-50 p-2 text-[11px] text-slate-600">
                    قصص المستخدم ومعايير القبول موجودة بالكامل في القسمين
                    <strong> «3) قصص المستخدم» </strong>و<strong> «4) معايير القبول» </strong>
                    أعلاه — تم تجنّب التكرار.
                  </p>
                )}
                <PrdList title="متطلبات وظيفية (Functional)" items={prd.functional_requirements} />
                <PrdList title="متطلبات غير وظيفية (Non-Functional)" items={prd.non_functional_requirements} />
                <PrdList title="مؤشّرات النجاح (Success Metrics)" items={prd.success_metrics} />
                <PrdList title="المخاطر والافتراضات (Risks & Assumptions)" items={prd.risks_assumptions} />
                <PrdBusinessRules title="قواعد العمل والحالات الخاصة (Business Rules)" items={prd.business_rules_detail} />
                <PrdSystemMessages title="رسائل النظام الموحدة (System Messages)" items={prd.system_messages_detail} />
                <PrdFlowSpecifications title="مواصفات التدفقات التفصيلية (Flow Specifications)" items={prd.flow_specifications} />
                <PrdStateMachines title="آلات الحالة (State Machines)" items={prd.state_machines_detail} />
                <PrdPersonaModules title="تقسيم حسب الشخصيات/الموديولات (Persona Modules)" items={prd.persona_modules} />
              </div>
            )}
          </ItemSection>
        )}

        {showSection("product_evaluation_guide", approvedScenarios.length > 0) && (
          <ItemSection title="6) دليل تقييم المنتج (Evaluation Scenarios)" row={itemsByKey.get("product_evaluation_guide")}>
            {approvedScenarios.length === 0 ? (
              <EmptyNote>لا توجد سيناريوهات تقييم معتمَدة.</EmptyNote>
            ) : (
              <ul className="space-y-2">
                {approvedScenarios.map((s) => (
                  <li key={s.id} className="break-inside-avoid rounded border border-slate-200 p-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-mono">{s.code ?? "SC"}</span>
                      <span className="text-[13px] font-semibold">{s.title}</span>
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">
                        {EVAL_CATEGORY_LABELS[s.category]}
                      </span>
                      <span className="text-[10px] text-slate-500">· شدّة: {EVAL_SEVERITY_LABELS[s.severity]}</span>
                    </div>
                    {s.description && (
                      <p className="mt-1 whitespace-pre-wrap text-[12px] text-slate-700">{s.description}</p>
                    )}
                    {s.preconditions && (
                      <p className="mt-1 text-[11px] text-slate-600">
                        <strong>الشروط المسبقة:</strong> {s.preconditions}
                      </p>
                    )}
                    {s.steps && s.steps.length > 0 && (
                      <ol className="mt-1 list-decimal pr-5 text-[12px] text-slate-700">
                        {[...s.steps].sort((a, b) => a.order - b.order).map((st) => (
                          <li key={st.order}>{st.action}</li>
                        ))}
                      </ol>
                    )}
                    {s.expectedResult && (
                      <p className="mt-1 text-[12px] text-slate-800">
                        <strong>النتيجة المتوقّعة:</strong> {s.expectedResult}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </ItemSection>
        )}

        {showSection("prototype_link", !!prototypeUrl) && (
          <ItemSection title="7) رابط النموذج (Prototype)" row={itemsByKey.get("prototype_link")}>
            {prototypeUrl ? (
              <p className="text-[13px]">
                الرابط:{" "}
                <a href={prototypeUrl} className="break-all text-[#3D5CFF] underline">{prototypeUrl}</a>
              </p>
            ) : (
              <EmptyNote>
                لا يوجد رابط Prototype خارجي بعد. أضف Staging/Production URL من:
                <br />
                <span className="font-mono text-[11px]">Prototype Studio → إعدادات النموذج → رابط النموذج للعميل</span>
              </EmptyNote>
            )}
          </ItemSection>
        )}

        {/* Category summary — only render categories that have at least one visible row. */}
        {categories.map((cat) => {
          const defs = HANDOFF_ITEM_REGISTRY.filter((d) => d.category === cat);
          const visibleDefs = includeAll
            ? defs
            : defs.filter((d) => itemsByKey.get(d.key)?.status === "completed");
          if (visibleDefs.length === 0) return null;
          return (
            <Section key={cat} title={`ملخّص الحالة — ${CATEGORY_LABELS[cat]}`}>
              <div className="space-y-2">
                {visibleDefs.map((def) => {
                  const row = itemsByKey.get(def.key);
                  return <ItemRow key={def.key} def={def} row={row} />;
                })}
              </div>
            </Section>
          );
        })}

        {questions.length > 0 && (
          <Section title={`أسئلة الشريك (${questions.length})`}>
            <ul className="space-y-2">
              {questions.map((q) => (
                <li key={q.id} className="rounded border border-slate-200 p-2">
                  <p className="text-sm">
                    <strong>س:</strong> {q.question}
                  </p>
                  {q.answer && (
                    <p className="mt-1 border-r-2 border-[#3D5CFF] pr-2 text-xs text-slate-600">
                      <strong>ج:</strong> {q.answer}
                    </p>
                  )}
                  <p className="mt-1 text-[11px] text-slate-500">
                    الحالة: {HANDOFF_QUESTION_STATUS_LABELS[q.status]} · الأولوية: {HANDOFF_QUESTION_PRIORITY_LABELS[q.priority]}
                  </p>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {deliveries.length > 0 && (
          <Section title={`سجل التسليم (${deliveries.length})`}>
            <ul className="space-y-1">
              {deliveries.map((d) => (
                <li key={d.id} className="text-sm">
                  <strong>{d.partnerName || "—"}</strong> — {HANDOFF_DELIVERY_STATUS_LABELS[d.receiptStatus]}
                  {d.sentAt && <span className="block text-[11px] text-slate-500">أُرسل: {new Date(d.sentAt).toLocaleString("ar-EG")}</span>}
                  {d.acceptedAt && <span className="block text-[11px] text-slate-500">قُبل: {new Date(d.acceptedAt).toLocaleString("ar-EG")}</span>}
                  {d.notes && <span className="block text-[11px] text-slate-600">— {d.notes}</span>}
                </li>
              ))}
            </ul>
          </Section>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Loaders (service client, no RLS)
// ---------------------------------------------------------------------------

interface ProblemBriefContent { title: string; body: string; quote: string; meta: string }

type DbPkg = {
  id: string; project_id: string; version: number; title: string;
  status: HandoffPackageStatus; finalized_at: string | null; finalized_by: string | null;
  notes: string; created_at: string; updated_at: string; created_by: string | null;
};
type DbItem = {
  id: string; package_id: string; project_id: string; item_key: string;
  is_mandatory: boolean; status: HandoffItemStatus;
  content_url: string | null; content_text: string;
  content_ref_type: string | null; content_ref_id: string | null;
  notes: string; completed_at: string | null; completed_by: string | null;
  created_at: string; updated_at: string;
  source_type?: string | null; source_version?: string | null; source_hash?: string | null;
  assembled_at?: string | null; assembled_by?: string | null;
  is_manual_override?: boolean; override_reason?: string;
};

async function loadPackage(
  supabase: SupabaseClient,
  projectId: string,
  packageId?: string,
): Promise<HandoffPackageRow | null> {
  const q = packageId
    ? supabase.from("handoff_packages").select("*").eq("id", packageId).eq("project_id", projectId).maybeSingle()
    : supabase.from("handoff_packages").select("*").eq("project_id", projectId)
        .order("version", { ascending: false }).limit(1).maybeSingle();
  const { data } = await q;
  if (!data) return null;
  const r = data as DbPkg;
  return {
    id: r.id, projectId: r.project_id, version: r.version, title: r.title,
    status: r.status, finalizedAt: r.finalized_at, finalizedBy: r.finalized_by,
    notes: r.notes, createdAt: r.created_at, updatedAt: r.updated_at, createdBy: r.created_by,
  };
}

async function loadItems(supabase: SupabaseClient, packageId: string): Promise<HandoffItemRow[]> {
  const { data } = await supabase
    .from("handoff_items").select("*").eq("package_id", packageId)
    .order("item_key", { ascending: true });
  return ((data as DbItem[] | null) ?? []).map((r) => ({
    id: r.id, packageId: r.package_id, projectId: r.project_id,
    itemKey: r.item_key, isMandatory: r.is_mandatory, status: r.status,
    contentUrl: r.content_url, contentText: r.content_text,
    contentRefType: r.content_ref_type, contentRefId: r.content_ref_id,
    notes: r.notes, completedAt: r.completed_at, completedBy: r.completed_by,
    createdAt: r.created_at, updatedAt: r.updated_at,
    sourceType: r.source_type ?? null,
    sourceVersion: r.source_version ?? null,
    sourceHash: r.source_hash ?? null,
    assembledAt: r.assembled_at ?? null,
    assembledBy: r.assembled_by ?? null,
    isManualOverride: r.is_manual_override ?? false,
    overrideReason: r.override_reason ?? "",
  }));
}

async function loadQuestions(supabase: SupabaseClient, packageId: string): Promise<HandoffQuestionRow[]> {
  const { data } = await supabase
    .from("handoff_questions").select("*").eq("package_id", packageId)
    .order("asked_at", { ascending: false });
  type DbQ = {
    id: string; project_id: string; package_id: string; partner_id: string | null;
    question: string; answer: string; status: HandoffQuestionStatus; priority: HandoffQuestionPriority;
    asked_by: string | null; assigned_to: string | null; answered_by: string | null;
    asked_at: string; answered_at: string | null; closed_at: string | null;
    created_at: string; updated_at: string;
  };
  return ((data as DbQ[] | null) ?? []).map((r) => ({
    id: r.id, projectId: r.project_id, packageId: r.package_id, partnerId: r.partner_id,
    question: r.question, answer: r.answer, status: r.status, priority: r.priority,
    askedBy: r.asked_by, assignedTo: r.assigned_to, answeredBy: r.answered_by,
    askedAt: r.asked_at, answeredAt: r.answered_at, closedAt: r.closed_at,
    createdAt: r.created_at, updatedAt: r.updated_at,
  }));
}

async function loadDeliveries(supabase: SupabaseClient, packageId: string): Promise<HandoffDeliveryRow[]> {
  const { data } = await supabase
    .from("handoff_deliveries").select("*").eq("package_id", packageId)
    .order("created_at", { ascending: false });
  type DbD = {
    id: string; project_id: string; package_id: string; partner_id: string | null; partner_name: string;
    receipt_status: HandoffDeliveryStatus; sent_at: string | null; sent_by: string | null;
    received_at: string | null; accepted_at: string | null; rejected_at: string | null;
    status_updated_by: string | null; notes: string; created_at: string; updated_at: string;
  };
  return ((data as DbD[] | null) ?? []).map((r) => ({
    id: r.id, projectId: r.project_id, packageId: r.package_id, partnerId: r.partner_id,
    partnerName: r.partner_name, receiptStatus: r.receipt_status,
    sentAt: r.sent_at, sentBy: r.sent_by, receivedAt: r.received_at,
    acceptedAt: r.accepted_at, rejectedAt: r.rejected_at,
    statusUpdatedBy: r.status_updated_by, notes: r.notes,
    createdAt: r.created_at, updatedAt: r.updated_at,
  }));
}

async function loadRequirements(supabase: SupabaseClient, projectId: string): Promise<RequirementRow[]> {
  try {
    const { data } = await supabase
      .from("product_requirements").select("*").eq("project_id", projectId);
    type DbR = {
      id: string; project_id: string; code: string | null; title: string; description: string | null;
      priority: MoscowPriority; status: RequirementStatus; rationale: string | null; acceptance_hint: string | null;
      created_at: string; updated_at: string;
    };
    return ((data as DbR[] | null) ?? []).map((r) => ({
      id: r.id, projectId: r.project_id, code: r.code, title: r.title, description: r.description,
      priority: r.priority, status: r.status, rationale: r.rationale, acceptanceHint: r.acceptance_hint,
      createdAt: r.created_at, updatedAt: r.updated_at,
    })) as RequirementRow[];
  } catch { return []; }
}

async function loadStories(supabase: SupabaseClient, projectId: string): Promise<UserStoryRow[]> {
  try {
    const { data } = await supabase
      .from("user_stories").select("*").eq("project_id", projectId);
    type DbS = {
      id: string; project_id: string; code: string | null; title: string;
      as_a: string | null; i_want: string | null; so_that: string | null; narrative_extra: string | null;
      status: StoryStatus; risk_level: RiskLevel; story_points: number | null;
      created_at: string; updated_at: string;
    };
    return ((data as DbS[] | null) ?? []).map((r) => ({
      id: r.id, projectId: r.project_id, code: r.code, title: r.title,
      asA: r.as_a ?? "", iWant: r.i_want ?? "", soThat: r.so_that ?? "",
      narrativeExtra: r.narrative_extra ?? "",
      status: r.status, riskLevel: r.risk_level, storyPoints: r.story_points,
      createdAt: r.created_at, updatedAt: r.updated_at,
    })) as unknown as UserStoryRow[];
  } catch { return []; }
}

async function loadAcs(supabase: SupabaseClient, projectId: string): Promise<AcceptanceCriterionRow[]> {
  try {
    const { data } = await supabase
      .from("acceptance_criteria").select("*").eq("project_id", projectId);
    type DbAc = {
      id: string; project_id: string; user_story_id: string; code: string | null; title: string | null;
      given_clause: string | null; when_clause: string | null; then_clause: string | null;
      and_conditions: string[] | null; status: AcStatus;
      created_at: string; updated_at: string;
    };
    return ((data as DbAc[] | null) ?? []).map((r) => ({
      id: r.id, projectId: r.project_id, userStoryId: r.user_story_id, code: r.code, title: r.title ?? "",
      givenClause: r.given_clause ?? "", whenClause: r.when_clause ?? "", thenClause: r.then_clause ?? "",
      andConditions: r.and_conditions ?? [], status: r.status,
      createdAt: r.created_at, updatedAt: r.updated_at,
    })) as unknown as AcceptanceCriterionRow[];
  } catch { return []; }
}

async function loadPrd(supabase: SupabaseClient, projectId: string): Promise<PRD | null> {
  try {
    const { data } = await supabase
      .from("prd").select("*").eq("project_id", projectId)
      .order("version", { ascending: false }).limit(1).maybeSingle();
    return (data as PRD | null) ?? null;
  } catch { return null; }
}

async function loadScenarios(supabase: SupabaseClient, projectId: string): Promise<EvaluationScenarioRow[]> {
  try {
    const { data } = await supabase
      .from("evaluation_scenarios").select("*").eq("project_id", projectId);
    type DbSc = {
      id: string; project_id: string; code: string | null; title: string;
      description: string | null; category: EvalCategory; severity: EvalSeverity;
      preconditions: string | null; steps: Array<{ order: number; action: string }> | null;
      expected_result: string | null;
      created_at: string; updated_at: string;
    };
    return ((data as DbSc[] | null) ?? []).map((r) => ({
      id: r.id, projectId: r.project_id, code: r.code, title: r.title,
      description: r.description ?? "", category: r.category, severity: r.severity,
      preconditions: r.preconditions ?? "", steps: r.steps ?? [],
      expectedResult: r.expected_result ?? "",
      createdAt: r.created_at, updatedAt: r.updated_at,
    })) as unknown as EvaluationScenarioRow[];
  } catch { return []; }
}

async function loadScenarioStatuses(supabase: SupabaseClient, projectId: string): Promise<Map<string, string>> {
  try {
    const { data } = await supabase
      .from("evaluation_scenarios").select("id, status").eq("project_id", projectId);
    return new Map(
      ((data ?? []) as Array<{ id: string; status: string | null }>)
        .map((r) => [r.id, r.status ?? "draft"]),
    );
  } catch { return new Map(); }
}

async function loadProblemBrief(
  supabase: SupabaseClient,
  projectId: string,
  row?: HandoffItemRow,
): Promise<ProblemBriefContent | null> {
  const refType = row?.contentRefType ?? null;
  const refId = row?.contentRefId ?? null;
  try {
    if (refType === "problem_validation_item" && refId) {
      const { data } = await supabase
        .from("problem_validation_items")
        .select("title, pain_point, quote, source_person, source_role, source_date, supporting_notes")
        .eq("id", refId).maybeSingle();
      if (data) {
        const d = data as Record<string, string | null>;
        const metaParts = [d.source_person, d.source_role, d.source_date].filter(Boolean);
        return {
          title: d.title ?? "",
          body: [d.pain_point ?? "", d.supporting_notes ?? ""].filter(Boolean).join("\n\n").trim(),
          quote: d.quote ?? "",
          meta: metaParts.length > 0 ? `المصدر: ${metaParts.join(" · ")}` : "",
        };
      }
    }
    if (refType === "discovery_analysis" && refId) {
      const { data } = await supabase
        .from("discovery_analyses").select("content, created_at").eq("id", refId).maybeSingle();
      if (data) {
        const c = ((data as { content: Record<string, unknown> }).content ?? {}) as Record<string, unknown>;
        const ps = (c.problem_statement ?? c.problem_definition ?? c.executive_summary) as unknown;
        const text = typeof ps === "string" ? ps : ((ps as { value?: string })?.value ?? "");
        return {
          title: "",
          body: (text ?? "").trim(),
          quote: "",
          meta: `Discovery Analysis · ${new Date((data as { created_at: string }).created_at).toLocaleDateString("ar-EG")}`,
        };
      }
    }
    if (refType === "brain_document" && refId) {
      const { data } = await supabase
        .from("project_brain_documents").select("content, version").eq("id", refId).maybeSingle();
      if (data) {
        const content = ((data as { content: Record<string, { value?: unknown }> }).content ?? {});
        const exec = content?.executive_summary?.value;
        const problem = (content?.problem_definition?.value ?? content?.problem_statement?.value) as unknown;
        const text = (typeof exec === "string" && exec.trim())
          ? exec.trim()
          : (typeof problem === "string" ? problem : "");
        return {
          title: "الملخّص التنفيذي",
          body: text.trim(),
          quote: "",
          meta: `Brain v${(data as { version: number }).version} · معتمَد`,
        };
      }
    }
  } catch { /* fall through */ }
  if (row?.contentText) {
    return { title: "", body: row.contentText, quote: "", meta: "" };
  }
  try {
    const { data } = await supabase
      .from("problem_validation_items")
      .select("title, pain_point, evidence_quote")
      .eq("project_id", projectId).order("created_at", { ascending: true }).limit(1).maybeSingle();
    if (data) {
      const d = data as Record<string, string | null>;
      return { title: d.title ?? "", body: d.pain_point ?? "", quote: d.evidence_quote ?? "", meta: "" };
    }
  } catch { /* ignore */ }
  return null;
}

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------
function EmptyPage({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white p-10 text-center text-slate-600" dir="rtl">
      {children}
    </div>
  );
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-6 break-inside-avoid">
      <h2 className="border-b border-slate-200 pb-1 font-display text-lg">{title}</h2>
      <div className="mt-2 text-sm leading-relaxed text-slate-700">{children}</div>
    </div>
  );
}
function ItemSection({ title, row, children }: { title: string; row?: HandoffItemRow; children: React.ReactNode }) {
  const status = row?.status ?? "pending";
  const style: Record<string, { bg: string; color: string }> = {
    pending: { bg: "#F1F5F9", color: "#475569" },
    in_progress: { bg: "#FEF3C7", color: "#92400E" },
    completed: { bg: "#DCFCE7", color: "#166534" },
    skipped: { bg: "#F5F5F5", color: "#737373" },
  };
  const st = style[status];
  return (
    <div className="mt-8 break-inside-avoid">
      <div className="flex items-center justify-between border-b-2 border-[#3D5CFF] pb-1">
        <h2 className="font-display text-xl">{title}</h2>
        <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
          style={{ backgroundColor: st.bg, color: st.color }}>
          {HANDOFF_ITEM_STATUS_LABELS[status]}
        </span>
      </div>
      <div className="mt-3 text-[13px] leading-relaxed text-slate-700">{children}</div>
    </div>
  );
}
function ItemRow({ def, row }: { def: HandoffItemDef; row?: HandoffItemRow }) {
  const status = row?.status ?? "pending";
  const statusStyle: Record<string, { bg: string; color: string }> = {
    pending: { bg: "#F1F5F9", color: "#475569" },
    in_progress: { bg: "#FEF3C7", color: "#92400E" },
    completed: { bg: "#DCFCE7", color: "#166534" },
    skipped: { bg: "#F5F5F5", color: "#737373" },
  };
  const st = statusStyle[status];
  return (
    <div className="rounded border border-slate-200 p-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">
            {def.label}
            {def.isMandatory && <span className="mr-1 text-xs text-[#DC2626]">*</span>}
          </p>
          <p className="text-[11px] text-slate-500">{def.description}</p>
        </div>
        <span
          className="whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold"
          style={{ backgroundColor: st.bg, color: st.color }}
        >
          {HANDOFF_ITEM_STATUS_LABELS[status]}
        </span>
      </div>
      {row?.notes && <p className="mt-1 text-[11px] text-slate-500">ملاحظات: {row.notes}</p>}
    </div>
  );
}
function EmptyNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded border border-dashed border-slate-300 bg-slate-50 p-2 text-[12px] text-slate-600">
      {children}
    </div>
  );
}
function PrdSection({ title, text }: { title: string; text?: string | null }) {
  if (!text || !text.trim()) return null;
  return (
    <div className="break-inside-avoid">
      <h4 className="text-[12px] font-semibold text-[#0A1735]">{title}</h4>
      <p className="mt-0.5 whitespace-pre-wrap text-[12px] leading-relaxed text-slate-700">{text}</p>
    </div>
  );
}
function PrdList({ title, items }: { title: string; items?: string[] | null }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="break-inside-avoid">
      <h4 className="text-[12px] font-semibold text-[#0A1735]">{title}</h4>
      <ul className="mt-0.5 list-disc space-y-0.5 pr-5 text-[12px] text-slate-700">
        {items.map((it, i) => <li key={i}>{it}</li>)}
      </ul>
    </div>
  );
}
/**
 * الأقسام المُهيكلة الثلاثة الجديدة (0116) — لقطات zero-invention من
 * الجداول الحية وقت توليد PRD. مثل PrdList/PrdSection، بترجع null (بدون
 * أي عنصر) لو المصفوفة فاضية — نفس نمط تجنّب الفراغات في هذه الصفحة.
 */
function PrdBusinessRules({ title, items }: { title: string; items?: PRDBusinessRuleDetail[] | null }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="break-inside-avoid">
      <h4 className="text-[12px] font-semibold text-[#0A1735]">{title}</h4>
      <table className="mt-1 w-full border-collapse text-[11px]">
        <thead>
          <tr className="border-b border-slate-300 text-right text-slate-500">
            <th className="p-1 font-medium">القاعدة</th>
            <th className="p-1 font-medium">الشرط</th>
            <th className="p-1 font-medium">القيمة الحدّية</th>
            <th className="p-1 font-medium">عند التجاوز</th>
            <th className="p-1 font-medium">مين بيطبّقها</th>
          </tr>
        </thead>
        <tbody>
          {items.map((b, i) => (
            <tr key={i} className="border-b border-slate-200 align-top text-slate-700 last:border-0">
              <td className="p-1 font-semibold">{b.title || "—"}</td>
              <td className="p-1">{b.trigger_condition || "—"}</td>
              <td className="p-1">{b.threshold_value || "—"}</td>
              <td className="p-1">{b.on_violation || "—"}</td>
              <td className="p-1">{b.enforcement_point}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function PrdSystemMessages({ title, items }: { title: string; items?: PRDSystemMessageDetail[] | null }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="break-inside-avoid">
      <h4 className="text-[12px] font-semibold text-[#0A1735]">{title}</h4>
      <table className="mt-1 w-full border-collapse text-[11px]">
        <thead>
          <tr className="border-b border-slate-300 text-right text-slate-500">
            <th className="p-1 font-medium">الحدث</th>
            <th className="p-1 font-medium">النوع</th>
            <th className="p-1 font-medium">النص</th>
          </tr>
        </thead>
        <tbody>
          {items.map((m, i) => (
            <tr key={i} className="border-b border-slate-200 align-top text-slate-700 last:border-0">
              <td className="p-1 font-semibold">{m.event_name || "—"}</td>
              <td className="p-1">{SYSTEM_MESSAGE_TYPE_LABELS[m.message_type]}</td>
              <td className="p-1">{m.message_text || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function PrdFlowSpecifications({ title, items }: { title: string; items?: PRDFlowSpecification[] | null }) {
  if (!items || items.length === 0) return null;
  const groups = groupFlowSpecificationsByFlow(items);
  return (
    <div className="break-inside-avoid">
      <h4 className="text-[12px] font-semibold text-[#0A1735]">{title}</h4>
      <div className="mt-1 space-y-2">
        {groups.map((g, gi) => (
          <div key={gi} className="rounded border border-slate-200 p-2">
            <p className="text-[12px] font-semibold text-slate-800">{g.flowName}</p>
            <ul className="mt-1 space-y-1.5">
              {g.items.map((f, i) => (
                <li key={i} className="text-[11px] text-slate-700">
                  <p><b>الخطوة:</b> {f.step_action || "—"}</p>
                  {f.ui_elements.length > 0 && (
                    <ul className="mt-0.5 list-disc pr-5">
                      {f.ui_elements.map((el, ei) => (
                        <li key={ei}>{el.field_name} — {el.field_type} — {el.validation_rule}</li>
                      ))}
                    </ul>
                  )}
                  {f.success_message && <p className="mt-0.5">رسالة نجاح: {f.success_message}</p>}
                  {f.error_messages.map((err, ei) => (
                    <p key={ei} className="mt-0.5">رسالة خطأ: {err}</p>
                  ))}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
/**
 * القسمان الجديدان (0122 Part 2/2): state_machines_detail + persona_modules
 * — نفس اتفاقية باقي أقسام PRD المُهيكلة في هذه الصفحة: null (بلا رندر)
 * لو المصفوفة فاضية. آلات الحالة تُعرض بنفس سلسلة الأسهم (stateChainString)
 * المستخدَمة في تبويب "تعريف المنتج" وتبويب "PRD" — اتساق بصري واحد عبر
 * الثلاث واجهات.
 */
function PrdStateMachines({ title, items }: { title: string; items?: PRDStateMachineDetail[] | null }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="break-inside-avoid">
      <h4 className="text-[12px] font-semibold text-[#0A1735]">{title}</h4>
      <div className="mt-1 space-y-2">
        {items.map((sm, i) => {
          const chain = stateChainString(sm.states);
          return (
            <div key={i} className="rounded border border-slate-200 p-2">
              <p className="text-[12px] font-semibold text-slate-800">{sm.name}</p>
              {sm.description && <p className="mt-0.5 text-[11px] text-slate-600">{sm.description}</p>}
              {chain && <p className="mt-1 text-[11px] text-slate-700" dir="ltr">{chain}</p>}
              {sm.transitions.length > 0 && (
                <ul className="mt-1 space-y-0.5">
                  {sm.transitions.map((t, ti) => (
                    <li key={ti} className="text-[11px] text-slate-600" dir="ltr">
                      {t.from} → {t.to}{t.trigger ? ` (${t.trigger})` : ""}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
function PrdPersonaModules({ title, items }: { title: string; items?: PRDPersonaModule[] | null }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="break-inside-avoid">
      <h4 className="text-[12px] font-semibold text-[#0A1735]">{title}</h4>
      <div className="mt-1 space-y-3">
        {items.map((m, i) => (
          <div key={i} className="rounded border border-slate-200 p-2">
            <p className="text-[12px] font-semibold text-slate-800">
              موديول: {m.persona_name}
              {m.persona_role && <span className="font-normal text-slate-500"> — {m.persona_role}</span>}
            </p>
            {m.user_stories.length > 0 && (
              <div className="mt-1">
                <p className="text-[11px] font-semibold text-slate-600">قصص المستخدم</p>
                <ul className="mt-0.5 list-disc pr-5 text-[11px] text-slate-700">
                  {m.user_stories.map((s, si) => (
                    <li key={si}>{s.code ? `[${s.code}] ` : ""}{s.title}</li>
                  ))}
                </ul>
              </div>
            )}
            {m.requirements.length > 0 && (
              <div className="mt-1">
                <p className="text-[11px] font-semibold text-slate-600">المتطلبات</p>
                <ul className="mt-0.5 list-disc pr-5 text-[11px] text-slate-700">
                  {m.requirements.map((r, ri) => (
                    <li key={ri}>{r.code ? `[${r.code}] ` : ""}{r.title}</li>
                  ))}
                </ul>
              </div>
            )}
            <PrdBusinessRules title="قواعد العمل" items={m.business_rules} />
            <PrdSystemMessages title="رسائل النظام" items={m.system_messages} />
            <PrdFlowSpecifications title="مواصفات التدفقات" items={m.flow_specifications} />
          </div>
        ))}
      </div>
    </div>
  );
}
