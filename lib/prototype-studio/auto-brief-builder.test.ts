import { describe, expect, it } from "vitest";
import { buildAutoBriefFromConfig } from "./auto-brief-builder";
import { DEFAULT_DESIGN_DIRECTION } from "./types";
import type { PrototypeStudioConfigRow } from "./types";

const NOW = "2026-08-10T00:00:00.000Z";

function cfg(over: Partial<PrototypeStudioConfigRow> = {}): PrototypeStudioConfigRow {
  return {
    projectId: "prj",
    prototypeType: "clickable",
    prototypeGoal: "اختبار قابلية استخدام تدفّق التسجيل",
    primaryPersonas: ["مستخدم جديد"],
    coreFlows: ["تسجيل", "استكشاف", "شراء", "دفع", "تأكيد"],
    platform: "web",
    fidelity: "mid",
    language: "ar",
    isRtl: true,
    backendRequirement: "mocked",
    dataStrategy: "mock",
    inScopeItems: ["صفحة تسجيل", "لوحة تحكم"],
    outOfScopeItems: ["دفع حقيقي", "مصادقة SSO"],
    designDirection: { ...DEFAULT_DESIGN_DIRECTION, visual_style: "بسيط" },
    designReferences: [],
    updatedAt: NOW,
    updatedBy: null,
    ...over,
  };
}

describe("buildAutoBriefFromConfig", () => {
  it("includes all required sections sourced from Studio config", () => {
    const md = buildAutoBriefFromConfig(cfg());
    expect(md).toContain("# Build Brief");
    expect(md).toContain("## Objective");
    expect(md).toContain("اختبار قابلية استخدام");
    expect(md).toContain("## In-Scope");
    expect(md).toContain("- صفحة تسجيل");
    expect(md).toContain("## Out-of-Scope");
    expect(md).toContain("- دفع حقيقي");
    expect(md).toContain("## Core Flows");
    expect(md).toContain("- تسجيل");
    expect(md).toContain("## Design Direction");
    expect(md).toContain("بسيط");
    expect(md).toContain("## Data Strategy");
    expect(md).toContain("## Language / RTL");
    expect(md).toContain("RTL:** نعم");
  });

  it("degrades gracefully when config fields are empty", () => {
    const md = buildAutoBriefFromConfig(cfg({
      prototypeGoal: "", primaryPersonas: [], coreFlows: [],
      inScopeItems: [], outOfScopeItems: [],
    }));
    expect(md).toContain("Objective");
    expect(md).toContain("_(لم يُحدَّد");
    expect(md).toContain("Core Flows");
  });
});
