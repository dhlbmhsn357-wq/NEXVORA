import { describe, expect, it } from "vitest";
import {
  validatePrototypePromptGeneration,
  validatePrototypePromptSectionRegeneration,
} from "./prototype-prompt-generation";

const validPayload = {
  context: "Internal tool for a furniture retailer to manage maintenance requests.",
  project_goal: "Build a working prototype for request tracking.",
  technical_context: "Next.js App Router, TypeScript, Supabase.",
  required_features: "- Request creation\n- Status tracking",
  functional_requirements: "- Users can create a request\n- Users can update status",
  user_stories: "1. As a branch manager, I want to log a request, so that it gets tracked.",
  acceptance_criteria: "1. Given a request exists, When status changes, Then it updates.",
  edge_cases: "- Empty request list\n- Network failure",
  constraints: "- Must work on Vercel Hobby plan",
  out_of_scope: "- Mobile app in v1",
  architecture_notes: "- Use Server Actions for mutations",
  ui_guidelines: "- Light theme, RTL support",
  code_quality_requirements: "- TypeScript strict mode",
  testing_expectations: "- Manual testing acceptable for prototype",
  definition_of_done: "- All user stories are clickable end-to-end",
};

describe("validatePrototypePromptGeneration", () => {
  it("accepts a well-formed full response", () => {
    const result = validatePrototypePromptGeneration(JSON.stringify(validPayload));
    expect(result.ok).toBe(true);
  });

  it("rejects null/empty/invalid JSON", () => {
    expect(validatePrototypePromptGeneration(null).ok).toBe(false);
    expect(validatePrototypePromptGeneration("").ok).toBe(false);
    expect(validatePrototypePromptGeneration("not json").ok).toBe(false);
  });

  it("rejects a response missing a required section", () => {
    const { definition_of_done, ...missing } = validPayload;
    void definition_of_done;
    expect(validatePrototypePromptGeneration(JSON.stringify(missing)).ok).toBe(false);
  });

  it("rejects a response with an extra section", () => {
    const withExtra = { ...validPayload, deployment_notes: "Deploy to Vercel" };
    expect(validatePrototypePromptGeneration(JSON.stringify(withExtra)).ok).toBe(false);
  });

  it("rejects an empty section value", () => {
    const bad = { ...validPayload, ui_guidelines: "" };
    expect(validatePrototypePromptGeneration(JSON.stringify(bad)).ok).toBe(false);
  });

  it("rejects a non-string section value", () => {
    const bad = { ...validPayload, required_features: ["a", "b"] };
    expect(validatePrototypePromptGeneration(JSON.stringify(bad)).ok).toBe(false);
  });
});

describe("validatePrototypePromptSectionRegeneration", () => {
  it("accepts a valid single-section response", () => {
    const result = validatePrototypePromptSectionRegeneration(
      JSON.stringify({ edge_cases: "- New edge case" }),
      "edge_cases"
    );
    expect(result.ok).toBe(true);
  });

  it("rejects a response with more than one key", () => {
    const result = validatePrototypePromptSectionRegeneration(
      JSON.stringify({ edge_cases: "x", constraints: "y" }),
      "edge_cases"
    );
    expect(result.ok).toBe(false);
  });

  it("rejects a response for the wrong section key", () => {
    const result = validatePrototypePromptSectionRegeneration(
      JSON.stringify({ constraints: "x" }),
      "edge_cases"
    );
    expect(result.ok).toBe(false);
  });
});
