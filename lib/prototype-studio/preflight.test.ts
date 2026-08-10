import { describe, it, expect, vi } from "vitest";

// Neutralise "server-only" so we can unit-test the pure orchestration logic.
vi.mock("server-only", () => ({}));

// Mock all data-access dependencies before importing preflight.
vi.mock("@/lib/product-definition/service", () => ({
  listPersonas: vi.fn(),
  listFlows: vi.fn(),
  listRequirements: vi.fn(),
}));
vi.mock("@/lib/user-stories/service", () => ({
  listStories: vi.fn(),
  listAcceptanceCriteria: vi.fn(),
}));
vi.mock("@/lib/product-decisions/service", () => ({
  listItems: vi.fn(),
}));
vi.mock("@/lib/market-research/service", () => ({
  listMarketResearchItems: vi.fn(),
  listProblemValidationItems: vi.fn(),
}));

import { runPreflight } from "./preflight";
import { listPersonas, listFlows, listRequirements } from "@/lib/product-definition/service";
import { listStories, listAcceptanceCriteria } from "@/lib/user-stories/service";
import { listItems as listDecisionItems } from "@/lib/product-decisions/service";
import { listMarketResearchItems, listProblemValidationItems } from "@/lib/market-research/service";

function setEmpty() {
  (listPersonas as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  (listFlows as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  (listRequirements as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  (listStories as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  (listAcceptanceCriteria as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  (listDecisionItems as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  (listMarketResearchItems as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  (listProblemValidationItems as ReturnType<typeof vi.fn>).mockResolvedValue([]);
}

describe("runPreflight", () => {
  it("blocks build on empty project (no personas/flows/etc.)", async () => {
    setEmpty();
    const r = await runPreflight("p1");
    expect(r.canBuild).toBe(false);
    expect(r.blockers.some((b) => b.key === "no_personas")).toBe(true);
    expect(r.blockers.some((b) => b.key === "no_flows")).toBe(true);
    expect(r.blockers.some((b) => b.key === "no_approved_requirements")).toBe(true);
  });

  it("passes with minimum approved set", async () => {
    setEmpty();
    (listPersonas as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: "p" }]);
    (listFlows as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: "f" }]);
    (listRequirements as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: "r", status: "approved" }]);
    (listStories as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: "s", status: "approved" }]);
    (listAcceptanceCriteria as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "a", userStoryId: "s", status: "approved" },
    ]);
    const r = await runPreflight("p1");
    expect(r.canBuild).toBe(true);
    expect(r.blockers.filter((b) => b.severity === "block").length).toBe(0);
  });

  it("warns when only simulated evidence exists", async () => {
    setEmpty();
    (listPersonas as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: "p" }]);
    (listFlows as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: "f" }]);
    (listRequirements as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: "r", status: "approved" }]);
    (listStories as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: "s", status: "approved" }]);
    (listAcceptanceCriteria as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "a", userStoryId: "s", status: "approved" },
    ]);
    (listMarketResearchItems as ReturnType<typeof vi.fn>).mockResolvedValue([{ origin: "simulated" }]);
    const r = await runPreflight("p1");
    expect(r.summary.evidenceOrigins.simulated).toBe(1);
    expect(r.blockers.some((b) => b.key === "only_simulated_evidence")).toBe(true);
    // still buildable — warn, not block
    expect(r.canBuild).toBe(true);
  });

  it("counts stories missing AC", async () => {
    setEmpty();
    (listPersonas as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: "p" }]);
    (listFlows as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: "f" }]);
    (listRequirements as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: "r", status: "approved" }]);
    (listStories as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "s1", status: "approved" },
      { id: "s2", status: "approved" },
    ]);
    (listAcceptanceCriteria as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "a", userStoryId: "s1", status: "approved" },
    ]);
    const r = await runPreflight("p1");
    expect(r.summary.storiesWithoutAc).toBe(1);
    expect(r.blockers.some((b) => b.key === "stories_missing_ac")).toBe(true);
  });
});
