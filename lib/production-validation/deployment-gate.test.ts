import { describe, expect, it } from "vitest";
import { computeDeploymentGate } from "./deployment-gate";

describe("computeDeploymentGate", () => {
  it("يمنع الجاهزية لو فيه Finding واحد Critical", () => {
    const result = computeDeploymentGate([{ severity: "critical" }, { severity: "low" }]);
    expect(result.productionReady).toBe(false);
    expect(result.reason).toContain("1");
  });

  it("يسمح بالجاهزية لو مفيش أي Critical حتى لو فيه High/Medium", () => {
    const result = computeDeploymentGate([{ severity: "high" }, { severity: "medium" }]);
    expect(result.productionReady).toBe(true);
  });

  it("يسمح بالجاهزية لمصفوفة فاضية من Findings", () => {
    expect(computeDeploymentGate([]).productionReady).toBe(true);
  });

  it("يذكر عدد المشاكل Critical الصحيح في السبب", () => {
    const result = computeDeploymentGate([{ severity: "critical" }, { severity: "critical" }, { severity: "critical" }]);
    expect(result.reason).toContain("3");
  });
});
