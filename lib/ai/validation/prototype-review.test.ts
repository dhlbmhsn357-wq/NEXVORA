import { describe, expect, it } from "vitest";
import { validatePrototypeReview } from "./prototype-review";

const validPayload = {
  user_stories: [
    {
      story: "As a branch manager, I want to log a request, so that it gets tracked.",
      status: "implemented",
      evidence: [{ file: "app/requests/new.tsx", function_or_component: "NewRequestForm", line: 12 }],
      gap: null,
    },
  ],
  acceptance_criteria_results: [
    {
      criterion: "Given a request exists, When status changes, Then it updates.",
      status: "not_implemented",
      evidence: null,
      gap: "No status update handler found.",
    },
  ],
  missing_features: ["Notification on status change"],
  scope_creep: [],
  non_functional_gaps: [],
  unresolved_risks: [],
  recommendation_summary: "Core flow works but status updates are missing.",
};

describe("validatePrototypeReview", () => {
  it("accepts a well-formed response", () => {
    const result = validatePrototypeReview(JSON.stringify(validPayload));
    expect(result.ok).toBe(true);
  });

  it("rejects null/empty/invalid JSON", () => {
    expect(validatePrototypeReview(null).ok).toBe(false);
    expect(validatePrototypeReview("not json").ok).toBe(false);
  });

  it("rejects a response missing a required key", () => {
    const { recommendation_summary, ...missing } = validPayload;
    void recommendation_summary;
    expect(validatePrototypeReview(JSON.stringify(missing)).ok).toBe(false);
  });

  it("rejects a response with an extra key", () => {
    const withExtra = { ...validPayload, overall_notes: "extra" };
    expect(validatePrototypeReview(JSON.stringify(withExtra)).ok).toBe(false);
  });

  it("rejects an implemented item with null evidence (Evidence Rule violation)", () => {
    const bad = {
      ...validPayload,
      user_stories: [{ ...validPayload.user_stories[0], evidence: null }],
    };
    expect(validatePrototypeReview(JSON.stringify(bad)).ok).toBe(false);
  });

  it("rejects a not_implemented item that includes evidence", () => {
    const bad = {
      ...validPayload,
      acceptance_criteria_results: [
        { ...validPayload.acceptance_criteria_results[0], evidence: [{ file: "x.ts" }] },
      ],
    };
    expect(validatePrototypeReview(JSON.stringify(bad)).ok).toBe(false);
  });

  it("rejects an invalid status value", () => {
    const bad = {
      ...validPayload,
      user_stories: [{ ...validPayload.user_stories[0], status: "mostly_done" }],
    };
    expect(validatePrototypeReview(JSON.stringify(bad)).ok).toBe(false);
  });

  it("rejects an empty user_stories array", () => {
    const bad = { ...validPayload, user_stories: [] };
    expect(validatePrototypeReview(JSON.stringify(bad)).ok).toBe(false);
  });

  it("rejects evidence missing a file field", () => {
    const bad = {
      ...validPayload,
      user_stories: [{ ...validPayload.user_stories[0], evidence: [{ function_or_component: "X" }] }],
    };
    expect(validatePrototypeReview(JSON.stringify(bad)).ok).toBe(false);
  });
});
