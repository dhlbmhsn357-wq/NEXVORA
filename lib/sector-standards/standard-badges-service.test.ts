import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

type Row = Record<string, unknown>;

const impacts: Row[] = [
  { artifact_type: "requirement", status: "applied", client_change_requests: { project_id: "p1" } },
  { artifact_type: "requirement", status: "applied", client_change_requests: { project_id: "p1" } },
  { artifact_type: "user_story", status: "applied", client_change_requests: { project_id: "p1" } },
  { artifact_type: "requirement", status: "proposed", client_change_requests: { project_id: "p1" } },
  { artifact_type: "requirement", status: "applied", client_change_requests: { project_id: "p2" } },
];

/**
 * Supabase's real query builder is thenable at any point in the chain
 * (`await` works right after the last `.eq()`), so this mock resolves
 * lazily via `.then()` once both `.select()`/`.eq()` calls have narrowed
 * the filters — matching how getAppliedImpactCountsByArtifactType awaits it.
 */
function makeClient() {
  return {
    from(table: string) {
      if (table !== "change_impacts") throw new Error(`جدول غير متوقّع: ${table}`);
      const filters: Record<string, string> = {};
      const builder = {
        select() {
          return builder;
        },
        eq(col: string, value: string) {
          filters[col] = value;
          return builder;
        },
        then(resolve: (r: { data: Row[]; error: null }) => void) {
          const data = impacts.filter((r) => {
            if (filters.status && r.status !== filters.status) return false;
            if (filters["client_change_requests.project_id"]) {
              const cr = r.client_change_requests as Row;
              if (cr.project_id !== filters["client_change_requests.project_id"]) return false;
            }
            return true;
          });
          resolve({ data, error: null });
        },
      };
      return builder;
    },
  };
}

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => makeClient() }));

import { getAppliedImpactCountsByArtifactType } from "./standard-badges-service";

describe("getAppliedImpactCountsByArtifactType", () => {
  it("يحسب عدد الأثر المُطبَّق فقط، لكل artifact_type، لمشروع معيّن", async () => {
    const counts = await getAppliedImpactCountsByArtifactType("p1");
    expect(counts).toEqual({ requirement: 2, user_story: 1 });
  });

  it("يرجّع كائن فاضي لمشروع بلا أثر مُطبَّق", async () => {
    const counts = await getAppliedImpactCountsByArtifactType("p-none");
    expect(counts).toEqual({});
  });
});
