/**
 * NEXVORA Scenario-from-Story — Deterministic Derivation Helpers
 * ==============================================================
 * Pure functions (لا server-only)، متاحة للاختبارات ولطبقة الخدمة على حدٍّ سواء.
 *
 * الغرض: تقليل الكتابة المكرَّرة — المستخدم يكتب القصة + AC، والسيناريو يُشتق
 * تلقائيًا كمسوّدة قابلة للتعديل قبل الاعتماد.
 */
import type {
  UserStoryRow, AcceptanceCriterionRow, RiskLevel,
} from "@/lib/user-stories/types";
import type {
  EvaluationScenarioRow, EvalStep, EvalSeverity, EvalCategory,
} from "@/lib/evaluation/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface DerivedScenarioDraft {
  linkedStoryId: string;
  storyTitle: string;
  storyCode: string | null;
  suggestedTitle: string;
  suggestedDescription: string;
  suggestedCategory: EvalCategory;
  suggestedSeverity: EvalSeverity;
  suggestedPreconditions: string;
  suggestedSteps: EvalStep[];
  suggestedExpectedResult: string;
}

export interface DerivedScenarioPlan {
  toCreate: DerivedScenarioDraft[];
  skipped: Array<{
    storyId: string;
    storyTitle: string;
    reason: "already_has_scenario" | "not_approved";
  }>;
}

/**
 * الحالات المؤهلة لتوليد سيناريو منها (approved / in_dev / done).
 * القيمة `readonly` عشان تُستخدم للفلترة بدون قلق.
 */
export const APPROVED_STORY_STATUSES = ["approved", "in_dev", "done"] as const;

// ---------------------------------------------------------------------------
// Severity mapping
// ---------------------------------------------------------------------------
/**
 * القصص ما فيهاش priority (must/should/could) في المخطط الحالي، لكن فيها
 * riskLevel اللي بيعبّر عن نفس الفكرة (مخاطر أعلى → خطورة تقييم أعلى).
 * التطبيع: high→high, medium→medium, low→low.
 */
export function deriveSeverityFromStory(story: UserStoryRow): EvalSeverity {
  const map: Record<RiskLevel, EvalSeverity> = {
    high: "high",
    medium: "medium",
    low: "low",
  };
  return map[story.riskLevel] ?? "medium";
}

// ---------------------------------------------------------------------------
// Steps derivation
// ---------------------------------------------------------------------------
/**
 * لو القصة عندها AC → نبني الخطوات من whenClause و andConditions لكل معيار.
 * لو مفيش AC → قالب عام من 3 خطوات.
 */
export function buildStepsFromStoryAndAc(
  story: UserStoryRow,
  acs: AcceptanceCriterionRow[],
): EvalStep[] {
  const storyAcs = acs
    .filter((a) => a.userStoryId === story.id)
    .sort((a, b) => a.orderIndex - b.orderIndex);

  if (storyAcs.length > 0) {
    const actions: string[] = [];
    for (const a of storyAcs) {
      const when = a.whenClause?.trim();
      if (when) actions.push(when);
      for (const cond of a.andConditions ?? []) {
        const c = cond.trim();
        if (c) actions.push(c);
      }
    }
    if (actions.length > 0) {
      return actions.map((action, i) => ({ order: i + 1, action }));
    }
  }

  // fallback عام
  const title = story.title || "الميزة";
  return [
    { order: 1, action: `افتح ${title}` },
    { order: 2, action: "أدخل البيانات المطلوبة" },
    { order: 3, action: "احفظ" },
  ];
}

// ---------------------------------------------------------------------------
// Draft builder
// ---------------------------------------------------------------------------
export function deriveScenarioDraft(
  story: UserStoryRow,
  acs: AcceptanceCriterionRow[],
): DerivedScenarioDraft {
  const persona = story.asA?.trim();
  const iWant = story.iWant?.trim();
  const soThat = story.soThat?.trim();

  const descParts: string[] = [];
  if (persona) descParts.push(`الشخصية: ${persona}.`);
  if (iWant) descParts.push(iWant);
  if (soThat) descParts.push(`— ${soThat}`);

  return {
    linkedStoryId: story.id,
    storyTitle: story.title,
    storyCode: story.code,
    suggestedTitle: `اختبار: ${story.title}`,
    suggestedDescription: descParts.join(" ").trim(),
    suggestedCategory: "usability",
    suggestedSeverity: deriveSeverityFromStory(story),
    suggestedPreconditions: "المستخدم مصادَق عليه ودخل النظام.",
    suggestedSteps: buildStepsFromStoryAndAc(story, acs),
    suggestedExpectedResult: soThat || (iWant ? `النتيجة المتوقعة: ${iWant}` : "النتيجة المتوقعة."),
  };
}

// ---------------------------------------------------------------------------
// Plan (deterministic — لا يلامس DB)
// ---------------------------------------------------------------------------
/**
 * يبني الخطة من مدخلات بحتة. Idempotent: أي قصة عندها سيناريو مرتبط
 * (linkedStoryId === story.id) تُتجاهل.
 */
export function planScenariosFromInputs(
  stories: UserStoryRow[],
  existingScenarios: Pick<EvaluationScenarioRow, "linkedStoryId">[],
  acs: AcceptanceCriterionRow[],
): DerivedScenarioPlan {
  const linkedSet = new Set(
    existingScenarios
      .map((s) => s.linkedStoryId)
      .filter((v): v is string => typeof v === "string" && v.length > 0),
  );
  const approvedStatuses = new Set<string>(APPROVED_STORY_STATUSES);

  const toCreate: DerivedScenarioDraft[] = [];
  const skipped: DerivedScenarioPlan["skipped"] = [];

  for (const story of stories) {
    if (!approvedStatuses.has(story.status)) {
      skipped.push({ storyId: story.id, storyTitle: story.title, reason: "not_approved" });
      continue;
    }
    if (linkedSet.has(story.id)) {
      skipped.push({ storyId: story.id, storyTitle: story.title, reason: "already_has_scenario" });
      continue;
    }
    toCreate.push(deriveScenarioDraft(story, acs));
  }

  return { toCreate, skipped };
}

/**
 * فلترة خطة إلى قصة واحدة — للاستخدام في زر "أنشئ سيناريو من هذه القصة".
 */
export function planScenarioForSingleStory(
  story: UserStoryRow,
  existingScenarios: Pick<EvaluationScenarioRow, "linkedStoryId">[],
  acs: AcceptanceCriterionRow[],
): DerivedScenarioPlan {
  return planScenariosFromInputs([story], existingScenarios, acs);
}
