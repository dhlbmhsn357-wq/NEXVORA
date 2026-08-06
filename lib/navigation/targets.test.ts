import { describe, expect, it } from "vitest";
import { resolveNotificationTarget, projectTabUrl } from "./targets";

describe("resolveNotificationTarget", () => {
  it("يبني رابط تبويب مشروع صحيح مع Highlight", () => {
    const target = resolveNotificationTarget({ type: "pending_support", projectId: "proj-1", recordId: "req-1" });
    expect(target.url).toBe("/dashboard/projects/proj-1?tab=support&highlight=req-1");
    expect(target.tab).toBe("support");
    expect(target.highlight).toBe("req-1");
  });

  it("يبني الرابط بدون Highlight لو مفيش recordId", () => {
    const target = resolveNotificationTarget({ type: "blocked_review", projectId: "proj-1" });
    expect(target.url).toBe("/dashboard/projects/proj-1?tab=review");
    expect(target.highlight).toBeNull();
  });

  it("يوجّه discovery_submitted لتبويب overview (مش discoveryAnalysis)", () => {
    const target = resolveNotificationTarget({ type: "discovery_submitted", projectId: "proj-1", recordId: "link-1" });
    expect(target.tab).toBe("overview");
  });

  it("يوجّه discovery_analysis_completed لتبويب discoveryAnalysis", () => {
    const target = resolveNotificationTarget({ type: "discovery_analysis_completed", projectId: "proj-1" });
    expect(target.tab).toBe("discoveryAnalysis");
  });

  it("يوجّه monitoring_critical_incident لتبويب productionMonitoring", () => {
    const target = resolveNotificationTarget({ type: "monitoring_critical_incident", projectId: "proj-1" });
    expect(target.tab).toBe("productionMonitoring");
  });

  it("يوجّه knowledge_needs_approval لصفحة الذكاء التنظيمي (مش مشروع)", () => {
    const target = resolveNotificationTarget({ type: "knowledge_needs_approval", projectId: null, recordId: "know-1" });
    expect(target.url).toBe("/dashboard/organizational-intelligence");
    expect(target.tab).toBeNull();
    expect(target.highlight).toBe("know-1");
  });

  it("يرجع لقائمة المشاريع العامة لو مفيش projectId ونوع مش معروف كعام", () => {
    const target = resolveNotificationTarget({ type: "some_future_type", projectId: null });
    expect(target.url).toBe("/dashboard/projects");
  });

  it("يفتراض تبويب overview لنوع إشعار غير معروف بدل ما يفشل", () => {
    const target = resolveNotificationTarget({ type: "totally_unknown_type", projectId: "proj-1" });
    expect(target.tab).toBe("overview");
  });
});

describe("projectTabUrl", () => {
  it("يبني رابط تبويب مباشر صحيح", () => {
    expect(projectTabUrl("proj-1", "prd")).toBe("/dashboard/projects/proj-1?tab=prd");
  });

  it("يضيف Highlight لو اتمرر", () => {
    expect(projectTabUrl("proj-1", "support", "req-9")).toBe("/dashboard/projects/proj-1?tab=support&highlight=req-9");
  });
});
