import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PrintButton from "@/components/ui/PrintButton";
import { ProjectModeBanner } from "@/app/(platform)/_shared/project-mode-banner";
import {
  getLatestPackage,
  listItems,
  listQuestions,
  listDeliveries,
} from "@/lib/handoff/service";
import {
  HANDOFF_ITEM_REGISTRY,
  HANDOFF_ITEM_STATUS_LABELS,
  HANDOFF_PACKAGE_STATUS_LABELS,
  HANDOFF_QUESTION_STATUS_LABELS,
  HANDOFF_QUESTION_PRIORITY_LABELS,
  HANDOFF_DELIVERY_STATUS_LABELS,
  type HandoffItemDef,
  type HandoffItemRow,
} from "@/lib/handoff/types";
import { listRequirements } from "@/lib/product-definition/service";
import {
  MOSCOW_LABELS,
  REQUIREMENT_STATUS_LABELS,
  type RequirementRow,
} from "@/lib/product-definition/types";
import { listStories, listAcceptanceCriteria } from "@/lib/user-stories/service";
import {
  STORY_STATUS_LABELS, RISK_LABELS, AC_STATUS_LABELS,
  type UserStoryRow, type AcceptanceCriterionRow,
} from "@/lib/user-stories/types";
import { listScenarios } from "@/lib/evaluation/service";
import {
  EVAL_CATEGORY_LABELS, EVAL_SEVERITY_LABELS,
  type EvaluationScenarioRow,
} from "@/lib/evaluation/types";
import { getOrCreatePrd } from "@/lib/prd/versioning";
import type { PRD } from "@/lib/types/database";
import type { SupabaseClient } from "@supabase/supabase-js";
import "@/app/print.css";

/**
 * صفحة PDF لحزمة التسليم (Handoff Package) — تسليم فعلي وليس فهرس.
 * كل عنصر إلزامي يعرض المحتوى الكامل من مصدره المعتمَد:
 *   • problem_brief          → نص كامل من Brain/Discovery/Problem Validation
 *   • scope_mvp              → متطلبات MVP كاملة (عنوان/وصف/priority/status)
 *   • user_stories           → صيغة بصفتي/أريد/لكي لكل قصّة معتمَدة
 *   • acceptance_criteria    → Given/When/Then لكل معيار معتمَد
 *   • prd                    → أقسام الـ PRD المعتمَدة مضمّنة داخل الـ PDF
 *   • evaluation             → سيناريو + خطوات + النتيجة المتوقعة
 *   • prototype_link         → رابط خارجي فقط (لا روابط داخلية login-gated)
 */
export default async function HandoffPrintPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: project } = await supabase
    .from("projects")
    .select("name, mode")
    .eq("id", projectId)
    .maybeSingle();
  if (!project) notFound();

  const pkg = await getLatestPackage(projectId);
  if (!pkg) notFound();

  const [items, questions, deliveries] = await Promise.all([
    listItems(pkg.id),
    listQuestions(pkg.id),
    listDeliveries(pkg.id),
  ]);

  const itemsByKey = new Map(items.map((i) => [i.itemKey, i]));

  // Load full content for every mandatory item, in parallel.
  const [
    problemBrief,
    requirements,
    stories,
    acs,
    prd,
    scenarios,
  ] = await Promise.all([
    loadProblemBrief(supabase as unknown as SupabaseClient, projectId, itemsByKey.get("problem_brief")),
    listRequirements(projectId).catch(() => [] as RequirementRow[]),
    listStories(projectId).catch(() => [] as UserStoryRow[]),
    listAcceptanceCriteria(projectId).catch(() => [] as AcceptanceCriterionRow[]),
    getOrCreatePrd(supabase as unknown as SupabaseClient, projectId).catch(() => null as PRD | null),
    listScenarios(projectId).catch(() => [] as EvaluationScenarioRow[]),
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

  // Approved evaluation scenarios (status may be missing for legacy rows → treat as draft).
  const { data: scenarioStatusRows } = await supabase
    .from("evaluation_scenarios").select("id, status").eq("project_id", projectId);
  const scenarioStatusById = new Map<string, string>(
    ((scenarioStatusRows ?? []) as Array<{ id: string; status: string | null }>)
      .map((r) => [r.id, r.status ?? "draft"]),
  );
  const approvedScenarios = scenarios.filter((s) => {
    const st = scenarioStatusById.get(s.id) ?? "draft";
    return st === "approved";
  });

  const prototypeItem = itemsByKey.get("prototype_link");
  const prototypeUrl = prototypeItem?.contentUrl && /^https?:\/\//i.test(prototypeItem.contentUrl)
    ? prototypeItem.contentUrl : null;

  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-3xl px-8 py-10 text-[#0A1735]" dir="rtl">
        <div className="no-print mb-4 rounded border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
          💡 <strong>لأنظف PDF:</strong> اضغط Ctrl+P ← More Settings ← uncheck &quot;Headers and footers&quot;. ثم Save as PDF.
        </div>
        <div className="no-print mb-6">
          <PrintButton />
        </div>

        <ProjectModeBanner mode={(project as { mode?: string | null }).mode ?? null} />

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

        {/* ---------------- Full content sections per mandatory item ---------------- */}
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
              {/* ACs whose parent story isn't approved — still surface them for completeness */}
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
              {(prd.user_stories?.length ?? 0) > 0 && (
                <div className="break-inside-avoid">
                  <h4 className="text-[12px] font-semibold text-[#0A1735]">قصص المستخدم (من PRD)</h4>
                  <ul className="mt-1 list-disc space-y-0.5 pr-5 text-[12px] text-slate-700">
                    {prd.user_stories.map((s, i) => {
                      const title = (s as { title?: string }).title ?? "";
                      const asA = (s as { as_a?: string; asA?: string }).as_a ?? (s as { asA?: string }).asA ?? "";
                      const iWant = (s as { i_want?: string; iWant?: string }).i_want ?? (s as { iWant?: string }).iWant ?? "";
                      const soThat = (s as { so_that?: string; soThat?: string }).so_that ?? (s as { soThat?: string }).soThat ?? "";
                      return (
                        <li key={i}>
                          {title && <strong>{title}: </strong>}
                          بصفتي {asA}، أريد {iWant}، لكي {soThat}.
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
              {(prd.acceptance_criteria?.length ?? 0) > 0 && (
                <div className="break-inside-avoid">
                  <h4 className="text-[12px] font-semibold text-[#0A1735]">معايير القبول (من PRD)</h4>
                  <ul className="mt-1 space-y-1 pr-5 text-[12px] text-slate-700">
                    {prd.acceptance_criteria.map((a, i) => {
                      const given = (a as { given?: string }).given ?? "";
                      const when = (a as { when?: string }).when ?? "";
                      const then = (a as { then?: string }).then ?? "";
                      return (
                        <li key={i} className="rounded border border-slate-200 p-1.5">
                          <div><strong>Given</strong> {given}</div>
                          <div><strong>When</strong> {when}</div>
                          <div><strong>Then</strong> {then}</div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
              <PrdList title="متطلبات وظيفية (Functional)" items={prd.functional_requirements} />
              <PrdList title="متطلبات غير وظيفية (Non-Functional)" items={prd.non_functional_requirements} />
              <PrdList title="مؤشّرات النجاح (Success Metrics)" items={prd.success_metrics} />
              <PrdList title="المخاطر والافتراضات (Risks & Assumptions)" items={prd.risks_assumptions} />
            </div>
          )}
        </ItemSection>

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

        {/* ---------------- Overview grid (all registered items with status) ---------------- */}
        {categories.map((cat) => {
          const defs = HANDOFF_ITEM_REGISTRY.filter((d) => d.category === cat);
          return (
            <Section key={cat} title={`ملخّص الحالة — ${CATEGORY_LABELS[cat]}`}>
              <div className="space-y-2">
                {defs.map((def) => {
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
// Loaders
// ---------------------------------------------------------------------------
interface ProblemBriefContent {
  title: string;
  body: string;
  quote: string;
  meta: string;
}

async function loadProblemBrief(
  supabase: SupabaseClient,
  projectId: string,
  row?: HandoffItemRow,
): Promise<ProblemBriefContent | null> {
  // Prefer the exact ref the handoff resolver already picked (immutable link).
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
  } catch {
    // fall through to text fallback
  }

  // Fallback — use the text the resolver stored on the handoff item.
  if (row?.contentText) {
    return { title: "", body: row.contentText, quote: "", meta: "" };
  }
  // Last resort — try to find any problem_validation_item on this project.
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
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-6 break-inside-avoid">
      <h2 className="border-b border-slate-200 pb-1 font-display text-lg">{title}</h2>
      <div className="mt-2 text-sm leading-relaxed text-slate-700">{children}</div>
    </div>
  );
}

function ItemSection({
  title, row, children,
}: {
  title: string;
  row?: HandoffItemRow;
  children: React.ReactNode;
}) {
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
