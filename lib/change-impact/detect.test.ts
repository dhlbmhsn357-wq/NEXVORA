import { describe, it, expect } from "vitest";
import { isMaterialChange } from "./detect";

describe("isMaterialChange", () => {
  it("returns false for a no-op update", () => {
    expect(
      isMaterialChange("product_requirements", { title: "T", status: "approved" }, { title: "T", status: "approved" }),
    ).toBe(false);
  });

  it("detects title change on requirement", () => {
    expect(
      isMaterialChange("product_requirements", { title: "Old", status: "draft" }, { title: "New", status: "draft" }),
    ).toBe(true);
  });

  it("ignores non-material fields", () => {
    // `notes` isn't tracked as material for requirements
    expect(
      isMaterialChange(
        "product_requirements",
        { title: "T", notes: "a", status: "draft" },
        { title: "T", notes: "b", status: "draft" },
      ),
    ).toBe(false);
  });

  it("flags transition out of approved status", () => {
    expect(
      isMaterialChange("product_requirements", { title: "T", status: "approved" }, { title: "T", status: "draft" }),
    ).toBe(true);
  });

  it("does not flag transition INTO approved (no field change)", () => {
    expect(
      isMaterialChange("product_requirements", { title: "T", status: "draft" }, { title: "T", status: "approved" }),
    ).toBe(false);
  });

  it("story: iWant camelCase key detected", () => {
    expect(
      isMaterialChange("user_stories", { iWant: "X", status: "approved" }, { iWant: "Y", status: "approved" }),
    ).toBe(true);
  });

  it("AC: given_clause snake_case key detected", () => {
    expect(
      isMaterialChange(
        "acceptance_criteria",
        { given_clause: "old", status: "approved" },
        { given_clause: "new", status: "approved" },
      ),
    ).toBe(true);
  });
});
