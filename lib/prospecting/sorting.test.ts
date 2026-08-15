import { describe, expect, it } from "vitest";
import { prospectSortRank, compareProspectsForDefaultOrder } from "./sorting";

const NOW = "2026-08-15T10:00:00.000Z";

function p(over: Partial<{ status: string; nextFollowUpAt: string | null; createdAt: string }>) {
  return {
    status: "new" as const,
    nextFollowUpAt: null,
    createdAt: "2026-08-01T00:00:00.000Z",
    ...over,
  } as never;
}

describe("prospectSortRank", () => {
  it("متابعة متأخرة → رتبة 0", () => {
    expect(prospectSortRank(p({ nextFollowUpAt: "2026-08-10T00:00:00.000Z" }), NOW)).toBe(0);
  });
  it("متابعة اليوم → رتبة 1", () => {
    expect(prospectSortRank(p({ nextFollowUpAt: "2026-08-15T18:00:00.000Z" }), NOW)).toBe(1);
  });
  it("مهتم → رتبة 2", () => {
    expect(prospectSortRank(p({ status: "interested" }), NOW)).toBe(2);
  });
  it("ردّ → رتبة 3", () => {
    expect(prospectSortRank(p({ status: "replied" }), NOW)).toBe(3);
  });
  it("جاهز للتواصل → رتبة 4", () => {
    expect(prospectSortRank(p({ status: "ready_to_contact" }), NOW)).toBe(4);
  });
  it("البقية → رتبة 5", () => {
    expect(prospectSortRank(p({ status: "new" }), NOW)).toBe(5);
  });
  it("متابعة مستقبلية (ليست اليوم) لا تتقدّم على الترتيب العادي حسب الحالة", () => {
    expect(prospectSortRank(p({ status: "new", nextFollowUpAt: "2026-08-20T00:00:00.000Z" }), NOW)).toBe(5);
  });
});

describe("compareProspectsForDefaultOrder", () => {
  it("يرتب: متأخر ثم اليوم ثم مهتم ثم ردّ ثم جاهز ثم الباقي", () => {
    const overdue = p({ nextFollowUpAt: "2026-08-01T00:00:00.000Z" });
    const today = p({ nextFollowUpAt: "2026-08-15T05:00:00.000Z" });
    const interested = p({ status: "interested" });
    const replied = p({ status: "replied" });
    const ready = p({ status: "ready_to_contact" });
    const rest = p({ status: "new" });
    const sorted = [rest, ready, replied, interested, today, overdue].sort((a, b) =>
      compareProspectsForDefaultOrder(a, b, NOW)
    );
    expect(sorted).toEqual([overdue, today, interested, replied, ready, rest]);
  });

  it("داخل نفس الفئة: الأحدث إنشاءً أولًا", () => {
    const older = p({ status: "interested", createdAt: "2026-08-01T00:00:00.000Z" });
    const newer = p({ status: "interested", createdAt: "2026-08-10T00:00:00.000Z" });
    const sorted = [older, newer].sort((a, b) => compareProspectsForDefaultOrder(a, b, NOW));
    expect(sorted).toEqual([newer, older]);
  });
});
