import { describe, expect, it } from "vitest";
import { assemblePrompt } from "./assemble";
import { computePromptReadiness } from "./readiness";
import { getProfile, allProfileIds } from "./profiles";
import { buildRulesBlock, getRules } from "./rules-engine";
import { buildContextResult } from "./context-engine";
import type { PromptContextBlock } from "./types";

describe("rules-engine", () => {
  it("يبني كتلة قواعد مرقّمة من المفاتيح المعروفة ويتجاهل غير المعروف", () => {
    const block = buildRulesBlock(["scope_lock", "ghost_rule", "no_break"]);
    expect(block).toContain("1.");
    expect(block).toContain("2.");
    expect(block).not.toContain("3.");
    expect(getRules(["ghost"])).toEqual([]);
  });
});

describe("profiles", () => {
  it("كل Profile مجموع أوزان جاهزيته ≤ 100", () => {
    for (const id of allProfileIds()) {
      const total = getProfile(id).readinessRequirements.reduce((s, r) => s + r.weight, 0);
      expect(total).toBeLessThanOrEqual(100);
      expect(total).toBeGreaterThan(0);
    }
  });
});

describe("assemblePrompt", () => {
  const ctx: PromptContextBlock[] = [{ title: "Project Brain", content: "محتوى" }];

  it("يركّب Persona + قواعد + سياق + body", () => {
    const r = assemblePrompt({ profile: getProfile("analysis"), stageBody: "الـ Schema المطلوب", context: ctx });
    expect(r.text).toContain("محلّل أعمال");
    expect(r.text).toContain("قواعد الجودة الإلزامية");
    expect(r.text).toContain("## Project Brain");
    expect(r.text).toContain("الـ Schema المطلوب");
    expect(r.metadata.claudeCodeWorkflowInjected).toBe(false);
    expect(r.metadata.contextBlockTitles).toEqual(["Project Brain"]);
  });

  it("يحقن Claude Code Workflow فقط عند target=claude_code", () => {
    const claude = assemblePrompt({ profile: getProfile("code_generation"), stageBody: "b", context: ctx });
    expect(claude.metadata.target).toBe("claude_code"); // الافتراضي للـ Profile
    expect(claude.metadata.claudeCodeWorkflowInjected).toBe(true);
    expect(claude.text).toContain("ممنوع العمل مباشرة على main");
    expect(claude.text).toContain("Type Check");

    const gemini = assemblePrompt({ profile: getProfile("prd"), stageBody: "b", context: ctx });
    expect(gemini.metadata.claudeCodeWorkflowInjected).toBe(false);
    expect(gemini.text).not.toContain("ممنوع العمل مباشرة على main");
  });

  it("override للهدف بيغيّر الحقن", () => {
    const forced = assemblePrompt({ profile: getProfile("prd"), stageBody: "b", context: ctx, target: "claude_code" });
    expect(forced.metadata.claudeCodeWorkflowInjected).toBe(true);
  });

  it("يتجاهل كتل السياق الفارغة", () => {
    const r = assemblePrompt({
      profile: getProfile("analysis"),
      stageBody: "b",
      context: [{ title: "فاضي", content: "  " }, { title: "مليان", content: "x" }],
    });
    expect(r.metadata.contextBlockTitles).toEqual(["مليان"]);
  });
});

describe("computePromptReadiness", () => {
  it("كل المتطلبات متوفّرة → 100 بلا خصومات", () => {
    const profile = getProfile("prd");
    const keys = new Set(profile.readinessRequirements.map((r) => r.key));
    const r = computePromptReadiness(profile, keys);
    expect(r.score).toBe(100);
    expect(r.deductions).toEqual([]);
  });

  it("متطلب ناقص → خصم بوزنه مع سبب", () => {
    const profile = getProfile("prd"); // brain=55, recommendations=20, project_context=25
    const r = computePromptReadiness(profile, new Set(["recommendations", "project_context"]));
    expect(r.score).toBe(45);
    expect(r.deductions).toHaveLength(1);
    expect(r.deductions[0].key).toBe("brain");
    expect(r.deductions[0].points).toBe(55);
  });

  it("مفيش أي متطلب → صفر", () => {
    const r = computePromptReadiness(getProfile("prd"), new Set());
    expect(r.score).toBe(0);
  });
});

describe("buildContextResult", () => {
  it("يشتق presentKeys/sources ويتجاهل الفارغ", () => {
    const r = buildContextResult([
      { key: "brain", title: "Brain", content: "محتوى", source: { type: "brain", version: 3 } },
      { key: "recommendations", title: "توصيات", content: "  " },
      { key: "project_context", title: "سياق", content: "x" },
    ]);
    expect([...r.presentKeys].sort()).toEqual(["brain", "project_context"]);
    expect(r.blocks).toHaveLength(2);
    expect(r.sources).toEqual([{ type: "brain", version: 3 }]);
  });
});
