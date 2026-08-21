import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const state = vi.hoisted(() => {
  let changeRequest: unknown = { id: "cr-1", projectId: "p1", status: "approved" };
  let impacts: unknown[] = [];
  const impactStatusUpdates: { id: string; status: string }[] = [];
  const crStatusUpdates: string[] = [];

  return {
    setChangeRequest: (cr: unknown) => {
      changeRequest = cr;
    },
    getChangeRequest: () => changeRequest,
    setImpacts: (i: unknown[]) => {
      impacts = i;
    },
    getImpacts: () => impacts,
    impactStatusUpdates,
    crStatusUpdates,
    resetTracking: () => {
      impactStatusUpdates.length = 0;
      crStatusUpdates.length = 0;
    },
  };
});

vi.mock("./change-request-service", () => ({
  getChangeRequest: vi.fn(async () => state.getChangeRequest()),
  listChangeImpacts: vi.fn(async () => state.getImpacts()),
  updateChangeImpactStatus: vi.fn(async (id: string, status: string) => {
    state.impactStatusUpdates.push({ id, status });
    const impact = (state.getImpacts() as { id: string; status: string }[]).find((i) => i.id === id);
    if (impact) impact.status = status;
    return { id, status };
  }),
  updateChangeRequestStatus: vi.fn(async (_id: string, status: string) => {
    state.crStatusUpdates.push(status);
    return { id: _id, status };
  }),
}));

const reqMocks = vi.hoisted(() => ({
  createRequirement: vi.fn(async (_pid: string, input: unknown) => ({ id: "new-req", ...(input as object) })),
  updateRequirement: vi.fn(async (id: string, patch: unknown) => ({ id, ...(patch as object) })),
  deleteRequirement: vi.fn(async (_id: string) => {}),
}));
vi.mock("@/lib/product-definition/service", () => reqMocks);

const brMocks = vi.hoisted(() => ({
  createBusinessRule: vi.fn(async (_pid: string, input: unknown) => ({ id: "new-br", ...(input as object) })),
  updateBusinessRule: vi.fn(async (id: string, patch: unknown) => ({ id, ...(patch as object) })),
  deleteBusinessRule: vi.fn(async (_id: string) => {}),
}));
vi.mock("@/lib/product-definition/business-rules-service", () => brMocks);

const smMocks = vi.hoisted(() => ({
  createSystemMessage: vi.fn(async (_pid: string, input: unknown) => ({ id: "new-sm", ...(input as object) })),
  updateSystemMessage: vi.fn(async (id: string, patch: unknown) => ({ id, ...(patch as object) })),
  deleteSystemMessage: vi.fn(async (_id: string) => {}),
}));
vi.mock("@/lib/product-definition/system-messages-service", () => smMocks);

const storyMocks = vi.hoisted(() => ({
  createStory: vi.fn(async (_pid: string, input: unknown) => ({ id: "new-story", ...(input as object) })),
  updateStory: vi.fn(async (id: string, patch: unknown) => ({ id, ...(patch as object) })),
  deleteStory: vi.fn(async (_id: string) => {}),
  createAc: vi.fn(async (_pid: string, input: unknown) => ({ id: "new-ac", ...(input as object) })),
  updateAc: vi.fn(async (id: string, patch: unknown) => ({ id, ...(patch as object) })),
  deleteAc: vi.fn(async (_id: string) => {}),
}));
vi.mock("@/lib/user-stories/service", () => storyMocks);

const { createRequirement, updateRequirement, deleteRequirement } = reqMocks;
const { createBusinessRule, updateBusinessRule, deleteBusinessRule } = brMocks;
const { createSystemMessage, updateSystemMessage, deleteSystemMessage } = smMocks;
const { createStory, updateStory, deleteStory, createAc, updateAc, deleteAc } = storyMocks;

// 0125 — Handoff regeneration flag + Standard learning signals
const handoffMocks = vi.hoisted(() => ({
  flagHandoffNeedsRegeneration: vi.fn(async (_projectId: string, _reason: string) => {}),
}));
vi.mock("./handoff-regeneration", () => handoffMocks);
const { flagHandoffNeedsRegeneration } = handoffMocks;

const learningMocks = vi.hoisted(() => ({
  recordLearningSignal: vi.fn(async (_changeRequestId: string, _impact: unknown) => {}),
}));
vi.mock("./learning-signals-service", () => learningMocks);
const { recordLearningSignal } = learningMocks;

import { applyApprovedImpacts } from "./apply-changes-service";

function makeImpact(overrides: Partial<Record<string, unknown>> & { id: string }) {
  return {
    changeRequestId: "cr-1",
    artifactType: "requirement",
    artifactId: null,
    artifactLabel: "",
    impactType: "add",
    reason: "سبب",
    proposedChange: {},
    dependencies: [],
    missingInformation: "",
    status: "approved",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  state.resetTracking();
  state.setChangeRequest({ id: "cr-1", projectId: "p1", status: "approved" });
});

describe("applyApprovedImpacts — requirement", () => {
  it("add يستدعي createRequirement بالحقول من proposedChange", async () => {
    const impact = makeImpact({ id: "i1", artifactType: "requirement", impactType: "add", proposedChange: { title: "متطلب جديد", priority: "must" } });
    state.setImpacts([impact]);

    const result = await applyApprovedImpacts("cr-1", ["i1"], "u1");

    expect(result.applied).toBe(1);
    expect(result.failed).toEqual([]);
    expect(createRequirement).toHaveBeenCalledWith("p1", expect.objectContaining({ title: "متطلب جديد", priority: "must" }), "u1");
    expect(state.impactStatusUpdates).toEqual([{ id: "i1", status: "applied" }]);
  });

  it("modify يستدعي updateRequirement بـ artifactId + proposedChange", async () => {
    const impact = makeImpact({ id: "i2", artifactType: "requirement", impactType: "modify", artifactId: "req-1", proposedChange: { priority: "should" } });
    state.setImpacts([impact]);

    await applyApprovedImpacts("cr-1", ["i2"], "u1");

    expect(updateRequirement).toHaveBeenCalledWith("req-1", { priority: "should" });
  });

  it("remove يستدعي deleteRequirement بـ artifactId", async () => {
    const impact = makeImpact({ id: "i3", artifactType: "requirement", impactType: "remove", artifactId: "req-2" });
    state.setImpacts([impact]);

    await applyApprovedImpacts("cr-1", ["i3"], "u1");

    expect(deleteRequirement).toHaveBeenCalledWith("req-2");
  });
});

describe("applyApprovedImpacts — user_story + acceptance_criteria", () => {
  it("user_story: add/modify/remove", async () => {
    state.setImpacts([
      makeImpact({ id: "s1", artifactType: "user_story", impactType: "add", proposedChange: { title: "قصة جديدة" } }),
      makeImpact({ id: "s2", artifactType: "user_story", impactType: "modify", artifactId: "story-1", proposedChange: { status: "approved" } }),
      makeImpact({ id: "s3", artifactType: "user_story", impactType: "remove", artifactId: "story-2" }),
    ]);

    await applyApprovedImpacts("cr-1", ["s1", "s2", "s3"], "u1");

    expect(createStory).toHaveBeenCalledWith("p1", expect.objectContaining({ title: "قصة جديدة" }), "u1");
    expect(updateStory).toHaveBeenCalledWith("story-1", { status: "approved" });
    expect(deleteStory).toHaveBeenCalledWith("story-2");
  });

  it("acceptance_criteria: add يتطلب userStoryId في proposedChange", async () => {
    const impact = makeImpact({
      id: "ac1",
      artifactType: "acceptance_criteria",
      impactType: "add",
      proposedChange: { userStoryId: "story-1", title: "معيار جديد" },
    });
    state.setImpacts([impact]);

    const result = await applyApprovedImpacts("cr-1", ["ac1"], "u1");

    expect(result.applied).toBe(1);
    expect(createAc).toHaveBeenCalledWith("p1", expect.objectContaining({ userStoryId: "story-1", title: "معيار جديد" }), "u1");
  });

  it("acceptance_criteria: add بدون userStoryId يفشل بشكل نظيف (partial failure)", async () => {
    const impact = makeImpact({ id: "ac2", artifactType: "acceptance_criteria", impactType: "add", proposedChange: { title: "بدون قصة" } });
    state.setImpacts([impact]);

    const result = await applyApprovedImpacts("cr-1", ["ac2"], "u1");

    expect(result.applied).toBe(0);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].impactId).toBe("ac2");
  });

  it("acceptance_criteria: modify/remove", async () => {
    state.setImpacts([
      makeImpact({ id: "ac3", artifactType: "acceptance_criteria", impactType: "modify", artifactId: "ac-1", proposedChange: { thenClause: "جديد" } }),
      makeImpact({ id: "ac4", artifactType: "acceptance_criteria", impactType: "remove", artifactId: "ac-2" }),
    ]);

    await applyApprovedImpacts("cr-1", ["ac3", "ac4"], "u1");

    expect(updateAc).toHaveBeenCalledWith("ac-1", { thenClause: "جديد" });
    expect(deleteAc).toHaveBeenCalledWith("ac-2");
  });
});

describe("applyApprovedImpacts — business_rule + system_message", () => {
  it("business_rule: add/modify/remove", async () => {
    state.setImpacts([
      makeImpact({ id: "br1", artifactType: "business_rule", impactType: "add", proposedChange: { title: "قاعدة جديدة" } }),
      makeImpact({ id: "br2", artifactType: "business_rule", impactType: "modify", artifactId: "br-x", proposedChange: { onViolation: "منع" } }),
      makeImpact({ id: "br3", artifactType: "business_rule", impactType: "remove", artifactId: "br-y" }),
    ]);

    await applyApprovedImpacts("cr-1", ["br1", "br2", "br3"], "u1");

    expect(createBusinessRule).toHaveBeenCalledWith("p1", expect.objectContaining({ title: "قاعدة جديدة" }), "u1");
    expect(updateBusinessRule).toHaveBeenCalledWith("br-x", { onViolation: "منع" });
    expect(deleteBusinessRule).toHaveBeenCalledWith("br-y");
  });

  it("system_message: add/modify/remove", async () => {
    state.setImpacts([
      makeImpact({ id: "sm1", artifactType: "system_message", impactType: "add", proposedChange: { eventName: "حدث جديد", messageText: "نص" } }),
      makeImpact({ id: "sm2", artifactType: "system_message", impactType: "modify", artifactId: "sm-x", proposedChange: { messageText: "محدَّث" } }),
      makeImpact({ id: "sm3", artifactType: "system_message", impactType: "remove", artifactId: "sm-y" }),
    ]);

    await applyApprovedImpacts("cr-1", ["sm1", "sm2", "sm3"], "u1");

    expect(createSystemMessage).toHaveBeenCalledWith("p1", expect.objectContaining({ eventName: "حدث جديد", messageText: "نص" }), "u1");
    expect(updateSystemMessage).toHaveBeenCalledWith("sm-x", { messageText: "محدَّث" });
    expect(deleteSystemMessage).toHaveBeenCalledWith("sm-y");
  });
});

describe("applyApprovedImpacts — أنواع غير مدعومة (خارج نطاق المرحلة ب)", () => {
  it("prd_section بيفشل بشكل نظيف بدل ما يتنفّذ بصمت", async () => {
    const impact = makeImpact({ id: "prd1", artifactType: "prd_section", impactType: "modify", artifactId: "prd-1" });
    state.setImpacts([impact]);

    const result = await applyApprovedImpacts("cr-1", ["prd1"], "u1");

    expect(result.applied).toBe(0);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].error).toMatch(/غير مدعوم/);
  });
});

describe("applyApprovedImpacts — مرونة الفشل الجزئي", () => {
  it("فشل عنصر واحد ما بيمنعش تطبيق باقي العناصر", async () => {
    updateRequirement.mockRejectedValueOnce(new Error("فشل متعمّد"));
    state.setImpacts([
      makeImpact({ id: "ok1", artifactType: "requirement", impactType: "modify", artifactId: "req-1", proposedChange: {} }),
      makeImpact({ id: "ok2", artifactType: "business_rule", impactType: "add", proposedChange: { title: "قاعدة" } }),
    ]);

    const result = await applyApprovedImpacts("cr-1", ["ok1", "ok2"], "u1");

    expect(result.applied).toBe(1);
    expect(result.failed).toEqual([{ impactId: "ok1", error: "فشل متعمّد" }]);
    expect(createBusinessRule).toHaveBeenCalled();
  });
});

describe("applyApprovedImpacts — ترقية حالة طلب التغيير", () => {
  it("لا يترقّى لـ applied لو لسه فيه عنصر معلّق (proposed/approved)", async () => {
    state.setImpacts([
      makeImpact({ id: "done1", artifactType: "requirement", impactType: "add", proposedChange: { title: "ok" } }),
      { ...makeImpact({ id: "pending1", artifactType: "requirement", impactType: "add" }), status: "proposed" },
    ]);

    await applyApprovedImpacts("cr-1", ["done1"], "u1");

    expect(state.crStatusUpdates).toEqual([]);
  });

  it("يترقّى لـ applied لما كل العناصر تبقى في حالة نهائية (applied أو rejected)", async () => {
    state.setImpacts([
      { ...makeImpact({ id: "a1", artifactType: "requirement", impactType: "add", proposedChange: { title: "ok" } }) },
      { ...makeImpact({ id: "a2", artifactType: "business_rule", impactType: "add", proposedChange: { title: "ok2" } }), status: "rejected" },
    ]);

    await applyApprovedImpacts("cr-1", ["a1"], "u1");

    expect(state.crStatusUpdates).toEqual(["applied"]);
  });
});

describe("applyApprovedImpacts — 0125: علم إعادة تجميع Handoff", () => {
  it("applied > 0 بيستدعي flagHandoffNeedsRegeneration بسبب يحتوي عنوان طلب التغيير", async () => {
    state.setChangeRequest({ id: "cr-1", projectId: "p1", status: "approved", title: "تحديث سعر الحجز" });
    state.setImpacts([makeImpact({ id: "ok1", artifactType: "requirement", impactType: "add", proposedChange: { title: "ok" } })]);

    await applyApprovedImpacts("cr-1", ["ok1"], "u1");

    expect(flagHandoffNeedsRegeneration).toHaveBeenCalledTimes(1);
    const [projectId, reason] = flagHandoffNeedsRegeneration.mock.calls[0];
    expect(projectId).toBe("p1");
    expect(reason).toContain("تحديث سعر الحجز");
  });

  it("applied === 0 (كل العناصر فشلت) ما بيستدعيش flagHandoffNeedsRegeneration", async () => {
    state.setImpacts([makeImpact({ id: "prd1", artifactType: "prd_section", impactType: "modify", artifactId: "prd-1" })]);

    const result = await applyApprovedImpacts("cr-1", ["prd1"], "u1");

    expect(result.applied).toBe(0);
    expect(flagHandoffNeedsRegeneration).not.toHaveBeenCalled();
  });

  it("فشل flagHandoffNeedsRegeneration ما بيكسّرش نتيجة applyApprovedImpacts", async () => {
    flagHandoffNeedsRegeneration.mockRejectedValueOnce(new Error("فشل تعليم متعمَّد"));
    state.setImpacts([makeImpact({ id: "ok1", artifactType: "requirement", impactType: "add", proposedChange: { title: "ok" } })]);

    const result = await applyApprovedImpacts("cr-1", ["ok1"], "u1");

    expect(result.applied).toBe(1);
    expect(result.failed).toEqual([]);
  });
});

describe("applyApprovedImpacts — 0125: إشارات تعلّم Standard", () => {
  it("recordLearningSignal بيتنادى مرة واحدة لكل أثر اتطبّق بنجاح", async () => {
    state.setImpacts([
      makeImpact({ id: "ok1", artifactType: "requirement", impactType: "add", proposedChange: { title: "ok" } }),
      makeImpact({ id: "ok2", artifactType: "business_rule", impactType: "add", proposedChange: { title: "ok2" } }),
    ]);

    await applyApprovedImpacts("cr-1", ["ok1", "ok2"], "u1");

    expect(recordLearningSignal).toHaveBeenCalledTimes(2);
    expect(recordLearningSignal).toHaveBeenCalledWith("cr-1", expect.objectContaining({ id: "ok1", status: "applied" }));
    expect(recordLearningSignal).toHaveBeenCalledWith("cr-1", expect.objectContaining({ id: "ok2", status: "applied" }));
  });

  it("عنصر فشل تطبيقه ما بيستدعيش recordLearningSignal له", async () => {
    updateRequirement.mockRejectedValueOnce(new Error("فشل متعمّد"));
    state.setImpacts([makeImpact({ id: "fail1", artifactType: "requirement", impactType: "modify", artifactId: "req-1", proposedChange: {} })]);

    await applyApprovedImpacts("cr-1", ["fail1"], "u1");

    expect(recordLearningSignal).not.toHaveBeenCalled();
  });

  it("فشل recordLearningSignal ما بيكسّرش نتيجة applyApprovedImpacts (تحذير فقط)", async () => {
    recordLearningSignal.mockRejectedValueOnce(new Error("فشل تسجيل متعمَّد"));
    state.setImpacts([makeImpact({ id: "ok1", artifactType: "requirement", impactType: "add", proposedChange: { title: "ok" } })]);

    const result = await applyApprovedImpacts("cr-1", ["ok1"], "u1");

    expect(result.applied).toBe(1);
    expect(result.failed).toEqual([]);
  });
});
