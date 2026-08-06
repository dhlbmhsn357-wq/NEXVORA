import type {
  DeveloperHandoffExpectedBehavior,
  GapReport,
  PRD,
  PrototypeReview,
} from "@/lib/types/database";

/**
 * أقسام حتمية — كود خالص، بدون أي استدعاء AI. الهدف: صفر مساحة
 * لتلفيق بيانات في الأقسام اللي المفروض تُنقل كما هي أو تُشتق ميكانيكيًا
 * من PRD المعتمد فقط.
 */

export function buildExpectedBehavior(prd: PRD): DeveloperHandoffExpectedBehavior {
  const fromStories = prd.user_stories.map((s) => ({
    source: "user_story" as const,
    statement: `Verify that the system behaves such that ${s.role} can ${s.want}, so that ${s.benefit}.`,
  }));

  const fromCriteria = prd.acceptance_criteria.map((c) => ({
    source: "acceptance_criterion" as const,
    statement: `Verify that: given ${c.given}, when ${c.when}, then ${c.then}.`,
  }));

  return { items: [...fromStories, ...fromCriteria] };
}

/**
 * نسخ مباشر بدون أي تعديل أو تجميل من آخر Gap Report معتمد — طبقًا
 * لمتطلب "Known State transferred DIRECTLY with NO modification".
 */
export function buildKnownState(review: PrototypeReview): GapReport {
  return JSON.parse(JSON.stringify(review.gap_report)) as GapReport;
}
