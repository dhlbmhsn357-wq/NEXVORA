/**
 * NEXVORA Prototype Studio — Config Suggestion (from Product Definition)
 * ======================================================================
 * Server-only. Reads personas, flows, approved requirements and open
 * decisions from Product Definition. Returns a Partial<SaveConfigPatch>
 * with sensible defaults the Studio can accept, reject, or diff.
 *
 * No AI. Purely deterministic mapping from source-of-truth data.
 */
import "server-only";
import { listPersonas, listFlows, listRequirements } from "@/lib/product-definition/service";
import { listItems as listDecisionItems } from "@/lib/product-decisions/service";

export interface StudioConfigSuggestion {
  personaNames: string[];
  coreFlowNames: string[];
  inScopeItems: string[];
  outOfScopeItems: string[];
  openDecisionCount: number;
  criticalDecisionCount: number;
  suggestedNotes: string;
}

export async function suggestStudioConfig(projectId: string): Promise<StudioConfigSuggestion> {
  const [personas, flows, requirements, decisions] = await Promise.all([
    listPersonas(projectId),
    listFlows(projectId),
    listRequirements(projectId),
    listDecisionItems(projectId, {}),
  ]);

  const personaNames = personas.map((p) => p.name).filter(Boolean);
  const coreFlowNames = flows
    .filter((f) => f.flowType === "primary" || f.flowType === "core" as unknown as string)
    .map((f) => f.name)
    .filter(Boolean);
  const inScopeItems = requirements
    .filter((r) => r.status === "approved" && (r.priority === "must" || r.priority === "should"))
    .map((r) => r.title);
  const outOfScopeItems = requirements
    .filter((r) => r.status === "deferred" || r.priority === "wont")
    .map((r) => r.title);
  const openDecisionCount = decisions.filter(
    (d) => d.status !== "resolved" && d.status !== "rejected"
  ).length;
  const criticalDecisionCount = decisions.filter(
    (d) => d.priority === "critical" && d.status !== "resolved" && d.status !== "rejected"
  ).length;

  const suggestedNotes = [
    `Personas: ${personaNames.length}`,
    `Flows: ${coreFlowNames.length}`,
    `In-scope (must/should approved): ${inScopeItems.length}`,
    criticalDecisionCount > 0 ? `⚠ قرارات حرجة مفتوحة: ${criticalDecisionCount}` : "",
  ].filter(Boolean).join(" · ");

  return {
    personaNames,
    coreFlowNames,
    inScopeItems,
    outOfScopeItems,
    openDecisionCount,
    criticalDecisionCount,
    suggestedNotes,
  };
}
