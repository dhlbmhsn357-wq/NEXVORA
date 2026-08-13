import { describe, expect, it } from "vitest";
import { issueStableKey, type IssueDispositionsMap } from "./review-types";
import type { BrainReviewIssue } from "@/lib/types/database";

function issue(overrides: Partial<BrainReviewIssue> = {}): BrainReviewIssue {
  return {
    type: "security_weakness",
    severity: "high",
    category: "أمان",
    description: "استخدام LocalStorage بدلاً من قاعدة بيانات حقيقية للبيانات المالية الحساسة",
    related_object_keys: [],
    ...overrides,
  };
}

/** يقلّد فلترة المشاكل الحاسمة اللي تعتمد عليها gate الاعتماد (server) ولوحة المراجعة (client). */
function pendingBlockingIssues(issues: BrainReviewIssue[], dispositions: IssueDispositionsMap): BrainReviewIssue[] {
  return issues.filter((i) => {
    if (i.severity !== "critical" && i.severity !== "high") return false;
    const d = dispositions[issueStableKey(i)];
    return !d || d.state === "pending";
  });
}

describe("issueStableKey", () => {
  it("ثابت لنفس المشكلة (type/category/description) بغض النظر عن باقي الحقول", () => {
    const a = issue({ related_object_keys: ["x"] });
    const b = issue({ related_object_keys: ["y", "z"] });
    expect(issueStableKey(a)).toBe(issueStableKey(b));
  });

  it("يختلف لو النوع أو الفئة أو الوصف اختلف", () => {
    const a = issue();
    expect(issueStableKey(issue({ type: "scalability_risk" }))).not.toBe(issueStableKey(a));
    expect(issueStableKey(issue({ category: "أداء" }))).not.toBe(issueStableKey(a));
    expect(issueStableKey(issue({ description: "وصف مختلف تمامًا" }))).not.toBe(issueStableKey(a));
  });

  it("يقتصر على أول 120 حرف من الوصف (نفس المفتاح لو الفرق بعد الحد)", () => {
    const longDesc = "أ".repeat(150);
    const a = issue({ description: longDesc + " نهاية أولى" });
    const b = issue({ description: longDesc + " نهاية مختلفة تمامًا" });
    expect(issueStableKey(a)).toBe(issueStableKey(b));
  });
});

describe("فلترة المشاكل الحاسمة بعد تأجيل/تجاهل", () => {
  it("مشكلة غير محسومة (لا يوجد disposition) تفضل تحجب الاعتماد", () => {
    const issues = [issue()];
    const blocking = pendingBlockingIssues(issues, {});
    expect(blocking).toHaveLength(1);
  });

  it("مشكلة اتأجّلت أو اتجوهلت بقرار صريح متبقاش تحجب الاعتماد", () => {
    const i = issue();
    const key = issueStableKey(i);
    const deferred = pendingBlockingIssues([i], {
      [key]: { state: "deferred", reason: "قرار عمل لاحق", actor_id: "u1", at: "2026-01-01T00:00:00.000Z" },
    });
    expect(deferred).toHaveLength(0);

    const dismissed = pendingBlockingIssues([i], {
      [key]: { state: "dismissed", reason: "خطر مقبول للمرحلة الحالية", actor_id: "u1", at: "2026-01-01T00:00:00.000Z" },
    });
    expect(dismissed).toHaveLength(0);
  });

  it("التراجع لـ pending يرجّع المشكلة تحجب الاعتماد تاني", () => {
    const i = issue();
    const key = issueStableKey(i);
    const reverted = pendingBlockingIssues([i], {
      [key]: { state: "pending", reason: null, actor_id: null, at: "2026-01-01T00:00:00.000Z" },
    });
    expect(reverted).toHaveLength(1);
  });

  it("مشاكل medium/low ما بتتحسبش أصلًا حتى بدون disposition", () => {
    const issues = [issue({ severity: "medium" }), issue({ severity: "low", description: "وصف آخر" })];
    expect(pendingBlockingIssues(issues, {})).toHaveLength(0);
  });

  it("المفتاح بيفضل ثابت عبر إعادة تحقّق جديدة (نفس نص المشكلة) — الـ disposition بيفضل ساري", () => {
    // إعادة التشغيل بتولّد نفس المشكلة (نفس type/category/description) في صف تقرير جديد.
    const originalRun = issue();
    const regeneratedRun = issue(); // صف تقرير جديد، لكن نفس النص جوهريًا
    const key = issueStableKey(originalRun);
    const dispositions: IssueDispositionsMap = {
      [key]: { state: "dismissed", reason: "خطر مقبول", actor_id: "u1", at: "2026-01-01T00:00:00.000Z" },
    };
    expect(pendingBlockingIssues([regeneratedRun], dispositions)).toHaveLength(0);
  });
});
