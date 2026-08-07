/**
 * NEXVORA User Stories — Pure Derivations (P7)
 * ============================================
 * دوال نقيّة (بدون I/O) لتقييم جودة القصص/الـ AC:
 *   • scoreStoryInvest      — INVEST score (Independent/Negotiable/Valuable/
 *                                            Estimable/Small/Testable) لقصة واحدة
 *   • validateGherkin       — تحقق شكلي من AC (Given/When/Then موجودين)
 *   • summarizeStories      — توزيع الحالات + إجمالي story points + متوسط الأدلة
 *   • summarizeAcceptance   — تغطية AC + معدلات approval/verified
 *   • deriveStoriesReadiness — بوّابة قبل PRD generation (P8+)
 */
import type {
  UserStoryRow, AcceptanceCriterionRow, StoryStatus, AcStatus,
} from "./types";

// ---------------------------------------------------------------------------
// INVEST scoring — 6 فحوصات كل واحد True/False
// ---------------------------------------------------------------------------
/**
 * INVEST هو معيار Bill Wake الشهير لجودة قصة المستخدم:
 *   I - Independent  — مستقلة (نستخدم غياب story linkage كإشارة سلبية بسيطة)
 *   N - Negotiable   — قابلة للتفاوض (وصف مش تفصيلي زيادة)
 *   V - Valuable     — قيمة تجارية (business_value >= 30)
 *   E - Estimable    — قابلة للتقدير (story_points موجودة)
 *   S - Small        — صغيرة (story_points <= 8)
 *   T - Testable     — قابلة للاختبار (as_a + i_want + so_that + AC ≥ 1)
 *
 * كل فحص = True/False → المجموع 0..6.
 */
export interface InvestScore {
  independent: boolean;
  negotiable: boolean;
  valuable: boolean;
  estimable: boolean;
  small: boolean;
  testable: boolean;
  score: number;   // 0..6
}

const MAX_NEGOTIABLE_WORDS = 80;   // فوق ده = تفصيل زيادة، فقد "قابلة للتفاوض"
const SMALL_MAX_POINTS = 8;

export function scoreStoryInvest(
  story: UserStoryRow,
  acCount: number,
  siblingLinkedCount = 0,
): InvestScore {
  // Independent — لو قصص أخرى كتير مرتبطة بنفس requirement/flow، يبقى فيه coupling
  const independent = siblingLinkedCount <= 1;

  // Negotiable — narrative قصير، غير مغلق بتفاصيل
  const narrativeLen = (story.iWant + " " + story.narrativeExtra).trim().split(/\s+/).filter(Boolean).length;
  const negotiable = narrativeLen > 0 && narrativeLen <= MAX_NEGOTIABLE_WORDS;

  // Valuable — قيمة تجارية معلنة
  const valuable = story.businessValue >= 30;

  // Estimable — النقاط موضوعة
  const estimable = story.storyPoints != null && story.storyPoints >= 0;

  // Small — أقل من أو تساوي 8 نقاط
  const small = story.storyPoints != null && story.storyPoints <= SMALL_MAX_POINTS;

  // Testable — الصيغة كاملة + معيار قبول واحد على الأقل
  const testable =
    story.asA.trim().length > 0 &&
    story.iWant.trim().length > 0 &&
    story.soThat.trim().length > 0 &&
    acCount >= 1;

  const score =
    (independent ? 1 : 0) +
    (negotiable ? 1 : 0) +
    (valuable ? 1 : 0) +
    (estimable ? 1 : 0) +
    (small ? 1 : 0) +
    (testable ? 1 : 0);

  return { independent, negotiable, valuable, estimable, small, testable, score };
}

// ---------------------------------------------------------------------------
// Gherkin validation
// ---------------------------------------------------------------------------
export interface GherkinValidation {
  ok: boolean;
  missing: string[];   // أسماء الأجزاء الناقصة
}

/**
 * الحد الأدنى: given/when/then كلهم فيهم نص. and_conditions اختيارية.
 */
export function validateGherkin(ac: Pick<AcceptanceCriterionRow, "givenClause" | "whenClause" | "thenClause">): GherkinValidation {
  const missing: string[] = [];
  if (!ac.givenClause.trim()) missing.push("Given");
  if (!ac.whenClause.trim())  missing.push("When");
  if (!ac.thenClause.trim())  missing.push("Then");
  return { ok: missing.length === 0, missing };
}

// ---------------------------------------------------------------------------
// Stories summary
// ---------------------------------------------------------------------------
export interface StoriesSummary {
  total: number;
  byStatus: Record<StoryStatus, number>;
  totalPoints: number;              // مجموع story_points (تجاهل null)
  avgBusinessValue: number;
  linkedToRequirementCount: number; // مربوطة بمتطلب
  orphans: number;                  // لا persona، لا flow، لا requirement
}

const EMPTY_STORY_STATUS = (): Record<StoryStatus, number> => ({
  draft: 0, in_review: 0, approved: 0, in_dev: 0, done: 0, archived: 0,
});

export function summarizeStories(rows: readonly UserStoryRow[]): StoriesSummary {
  const byStatus = EMPTY_STORY_STATUS();
  let totalPoints = 0;
  let bvSum = 0;
  let linkedReq = 0;
  let orphans = 0;
  for (const s of rows) {
    byStatus[s.status]++;
    if (s.storyPoints != null) totalPoints += s.storyPoints;
    bvSum += s.businessValue;
    if (s.linkedRequirementId) linkedReq++;
    if (!s.linkedRequirementId && !s.linkedPersonaId && !s.linkedFlowId) orphans++;
  }
  return {
    total: rows.length,
    byStatus,
    totalPoints,
    avgBusinessValue: rows.length === 0 ? 0 : Math.round(bvSum / rows.length),
    linkedToRequirementCount: linkedReq,
    orphans,
  };
}

// ---------------------------------------------------------------------------
// AC summary
// ---------------------------------------------------------------------------
export interface AcSummary {
  total: number;
  byStatus: Record<AcStatus, number>;
  storiesWithAcCount: number;    // عدد القصص اللي عندها ≥ 1 AC
  validGherkinCount: number;     // AC كاملة الصيغة
  invalidGherkinCount: number;
}

const EMPTY_AC_STATUS = (): Record<AcStatus, number> => ({
  draft: 0, approved: 0, verified: 0, failed: 0,
});

export function summarizeAcceptance(
  acs: readonly AcceptanceCriterionRow[],
  storyIds: readonly string[],
): AcSummary {
  const byStatus = EMPTY_AC_STATUS();
  let valid = 0;
  let invalid = 0;
  const withAc = new Set<string>();
  for (const a of acs) {
    byStatus[a.status]++;
    withAc.add(a.userStoryId);
    if (validateGherkin(a).ok) valid++;
    else invalid++;
  }
  // storiesWithAcCount = عدد قصص المشروع اللي عندها AC (يستثني قصص من مشاريع تانية)
  const projectStoryIds = new Set(storyIds);
  const storiesWithAcCount = [...withAc].filter((id) => projectStoryIds.has(id)).length;
  return {
    total: acs.length,
    byStatus,
    storiesWithAcCount,
    validGherkinCount: valid,
    invalidGherkinCount: invalid,
  };
}

// ---------------------------------------------------------------------------
// Readiness — بوّابة قبل PRD generation
// ---------------------------------------------------------------------------
/**
 * قواعد الجاهزية:
 *   1. ≥ 3 قصص معتمدة (approved/in_dev/done)           — 25 نقطة
 *   2. تغطية AC ≥ 80% من القصص المعتمدة                — 25 نقطة
 *   3. Gherkin validity ≥ 90% من الـ AC                — 20 نقطة
 *   4. متوسط INVEST ≥ 4/6 عبر القصص المعتمدة           — 20 نقطة
 *   5. ≤ 15% orphans (كل قصة مربوطة بحاجة)             — 10 نقطة
 * الحدّ للجاهزية = 70.
 */
export interface StoriesReadiness {
  score: number;
  ready: boolean;
  checks: {
    minApprovedOk: boolean;
    acCoverageOk: boolean;
    gherkinValidityOk: boolean;
    avgInvestOk: boolean;
    lowOrphansOk: boolean;
  };
  breakdown: {
    approvedStories: number;
    acCoveragePercent: number;
    gherkinValidityPercent: number;
    avgInvestScore: number;      // 0..6
    orphanRatio: number;
  };
}

const READINESS_THRESHOLD = 70;

export function deriveStoriesReadiness(
  stories: readonly UserStoryRow[],
  acs: readonly AcceptanceCriterionRow[],
): StoriesReadiness {
  const sSum = summarizeStories(stories);
  const approvedIds = stories
    .filter((s) => s.status === "approved" || s.status === "in_dev" || s.status === "done")
    .map((s) => s.id);
  const approvedCount = approvedIds.length;

  const approvedIdsSet = new Set(approvedIds);
  const acForApproved = acs.filter((a) => approvedIdsSet.has(a.userStoryId));
  const storiesWithAcApproved = new Set(acForApproved.map((a) => a.userStoryId)).size;

  const acCoveragePercent = approvedCount === 0
    ? 0
    : Math.round((storiesWithAcApproved / approvedCount) * 100);

  const gherkinValidityPercent = acs.length === 0
    ? 0
    : Math.round((acs.filter((a) => validateGherkin(a).ok).length / acs.length) * 100);

  // متوسط INVEST للقصص المعتمدة فقط
  let investSum = 0;
  for (const s of stories.filter((st) => approvedIdsSet.has(st.id))) {
    const acCount = acs.filter((a) => a.userStoryId === s.id).length;
    investSum += scoreStoryInvest(s, acCount).score;
  }
  const avgInvestScore = approvedCount === 0 ? 0 : investSum / approvedCount;

  const orphanRatio = stories.length === 0 ? 0 : Math.round((sSum.orphans / stories.length) * 100);

  const checks = {
    minApprovedOk: approvedCount >= 3,
    acCoverageOk: acCoveragePercent >= 80,
    gherkinValidityOk: acs.length > 0 && gherkinValidityPercent >= 90,
    avgInvestOk: avgInvestScore >= 4,
    lowOrphansOk: stories.length === 0 ? false : orphanRatio <= 15,
  };

  let score = 0;
  if (checks.minApprovedOk)      score += 25;
  if (checks.acCoverageOk)       score += 25;
  if (checks.gherkinValidityOk)  score += 20;
  if (checks.avgInvestOk)        score += 20;
  if (checks.lowOrphansOk)       score += 10;

  return {
    score,
    ready: score >= READINESS_THRESHOLD,
    checks,
    breakdown: {
      approvedStories: approvedCount,
      acCoveragePercent,
      gherkinValidityPercent,
      avgInvestScore: Math.round(avgInvestScore * 10) / 10,
      orphanRatio,
    },
  };
}
