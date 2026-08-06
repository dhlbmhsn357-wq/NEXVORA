import { describe, expect, it } from "vitest";
import { getAllowedWorkflowRoles } from "./permissions";

describe("getAllowedWorkflowRoles", () => {
  it("archive دايمًا مقصورة على admin بس، لأي مرحلة", () => {
    expect(getAllowedWorkflowRoles("prd", "archive")).toEqual(["admin"]);
    expect(getAllowedWorkflowRoles("support", "archive")).toEqual(["admin"]);
  });

  it("view مفتوحة لكل الأدوار الستة افتراضيًا", () => {
    expect(getAllowedWorkflowRoles("prd", "view")).toHaveLength(6);
  });

  it("approve على engineeringQaReview بيشمل qa (مش موجودة في الافتراضي العام)", () => {
    expect(getAllowedWorkflowRoles("engineeringQaReview", "approve")).toContain("qa");
  });

  it("مرحلة غير معرّفة ترجع مصفوفة فاضية", () => {
    expect(getAllowedWorkflowRoles("not-a-real-stage" as never, "view")).toEqual([]);
  });
});
