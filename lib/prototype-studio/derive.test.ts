import { describe, expect, it } from "vitest";
import { computeStudioReadiness } from "./derive";
import { filterConfidentialResearch, SENSITIVE_FIELD_DENY_LIST } from "./security-filter";
import { DEFAULT_DESIGN_DIRECTION } from "./types";
import type {
  PrototypeStudioArtifactRow,
  PrototypeStudioConfigRow,
} from "./types";
import type { Confidentiality, MarketResearchItem } from "@/lib/market-research/types";

function mrItem(id: string, title: string, confidentiality: Confidentiality): MarketResearchItem {
  return {
    id, projectId: "prj", itemType: "direct_competitor", title, summary: "",
    details: {}, sourceUrl: null, sourceNotes: "", confidence: 50, tags: [],
    informationClass: "fact", confidentiality,
    createdAt: NOW, updatedAt: NOW, createdBy: null,
  };
}

const NOW = "2026-08-07T10:00:00.000Z";

function cfg(over: Partial<PrototypeStudioConfigRow> = {}): PrototypeStudioConfigRow {
  return {
    projectId: "prj",
    prototypeType: "clickable",
    prototypeGoal: "",
    primaryPersonas: [],
    coreFlows: [],
    platform: "web",
    fidelity: "mid",
    language: "ar",
    isRtl: true,
    backendRequirement: "mocked",
    dataStrategy: "mock",
    inScopeItems: [],
    outOfScopeItems: [],
    designDirection: { ...DEFAULT_DESIGN_DIRECTION },
    designReferences: [],
    updatedAt: NOW,
    updatedBy: null,
    ...over,
  };
}

function art(over: Partial<PrototypeStudioArtifactRow>): PrototypeStudioArtifactRow {
  return {
    id: "a", projectId: "prj",
    artifactType: "context_pack", version: 1, status: "draft",
    contentMd: "", metadata: {
      pinned_prd_version: null, pinned_brain_version: null,
      pinned_config_updated_at: null, chatgpt_session_ref: null, source_details: null,
      brief_source: null,
    },
    source: "system", createdBy: null, createdAt: NOW,
    approvedBy: null, approvedAt: null, notes: "",
    ...over,
  };
}

describe("computeStudioReadiness", () => {
  it("empty config → low score with major missing items", () => {
    const r = computeStudioReadiness(cfg(), []);
    expect(r.score).toBeLessThan(30);
    expect(r.missing).toContain("Context Pack");
    expect(r.missing).toContain("Build Brief معتمد");
  });

  it("fully configured + all artifacts → 100", () => {
    const config = cfg({
      prototypeGoal: "بناء نموذج قابل للنقر لتجربة المستخدم الأساسية",
      primaryPersonas: ["p1"],
      coreFlows: ["f1"],
      inScopeItems: ["item"],
      designReferences: [{ url: "https://x", screenshot_url: null, liked: "", avoid: "", notes: "" }],
    });
    const arts: PrototypeStudioArtifactRow[] = [
      art({ artifactType: "context_pack", version: 1, status: "active" }),
      art({ artifactType: "build_brief", version: 1, status: "approved" }),
      art({ artifactType: "codex_build_pack", version: 1 }),
    ];
    const r = computeStudioReadiness(config, arts);
    expect(r.score).toBe(100);
  });
});

describe("filterConfidentialResearch", () => {
  it("keeps only 'public' items", () => {
    const items: MarketResearchItem[] = [
      mrItem("1", "A", "public"),
      mrItem("2", "B", "internal"),
      mrItem("3", "C", "confidential"),
    ];
    const kept = filterConfidentialResearch(items);
    expect(kept).toHaveLength(1);
    expect(kept[0].title).toBe("A");
  });

  it("deny-list includes core sensitive tables", () => {
    expect(SENSITIVE_FIELD_DENY_LIST).toContain("ai_task_model_config");
    expect(SENSITIVE_FIELD_DENY_LIST).toContain("commercial");
    expect(SENSITIVE_FIELD_DENY_LIST).toContain("handoff_partners");
  });
});
