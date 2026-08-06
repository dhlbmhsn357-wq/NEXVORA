import { describe, expect, it } from "vitest";
import { computeSecurityScoreSummary } from "./score-summary";
import type { SecurityReviewCategoryKey } from "@/lib/types/database";

function scores(overrides: Partial<Record<SecurityReviewCategoryKey, number>> = {}): Record<SecurityReviewCategoryKey, number> {
  return {
    authentication: 100,
    authorization: 100,
    rls: 100,
    api_security: 100,
    input_validation: 100,
    secrets: 100,
    environment: 100,
    ...overrides,
  };
}

describe("computeSecurityScoreSummary", () => {
  it("لو كل المحاور 100، كل الدرجات النهائية 100", () => {
    const summary = computeSecurityScoreSummary(scores());
    expect(summary.overall_security_score).toBe(100);
    expect(summary.api_security).toBe(100);
  });

  it("authentication/authorization/rls بترجع درجة محورها مباشرة", () => {
    const summary = computeSecurityScoreSummary(scores({ authentication: 40, authorization: 60, rls: 20 }));
    expect(summary.authentication).toBe(40);
    expect(summary.authorization).toBe(60);
    expect(summary.rls).toBe(20);
  });

  it("api_security بيتحسب من متوسط api_security + input_validation", () => {
    const summary = computeSecurityScoreSummary(scores({ api_security: 80, input_validation: 40 }));
    expect(summary.api_security).toBe(60);
  });

  it("secrets_management وconfiguration بيرجعوا secrets/environment مباشرة", () => {
    const summary = computeSecurityScoreSummary(scores({ secrets: 10, environment: 90 }));
    expect(summary.secrets_management).toBe(10);
    expect(summary.configuration).toBe(90);
  });
});
