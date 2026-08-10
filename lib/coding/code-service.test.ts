import { describe, it, expect, vi } from "vitest";
import { nextCode, generateAndInsertWithRetry, type CodedTable } from "./code-service";

// -----------------------------------------------------------------------------
// Minimal Supabase mock: chainable builder returning canned data/error.
// -----------------------------------------------------------------------------
type Row = { code: string | null };
function makeSelectClient(rowsByTable: Record<string, Row[]>) {
  return {
    from(table: string) {
      const rows = rowsByTable[table] ?? [];
      const builder: Record<string, unknown> = {};
      builder.select = () => builder;
      builder.eq = () => builder;
      builder.not = () => builder;
      builder.order = () => builder;
      builder.limit = () => Promise.resolve({ data: rows, error: null });
      return builder;
    },
  } as unknown as Parameters<typeof nextCode>[0];
}

describe("nextCode", () => {
  const projectId = "p1";

  it("starts at 001 when no rows", async () => {
    const client = makeSelectClient({ product_requirements: [] });
    expect(await nextCode(client, "product_requirements", projectId)).toBe("REQ-001");
  });

  it("increments past highest existing", async () => {
    const client = makeSelectClient({
      product_requirements: [{ code: "REQ-007" }, { code: "REQ-003" }, { code: "REQ-001" }],
    });
    expect(await nextCode(client, "product_requirements", projectId)).toBe("REQ-008");
  });

  it("uses correct prefix per table", async () => {
    const cases: Array<[CodedTable, string]> = [
      ["product_requirements", "REQ-001"],
      ["user_stories", "US-001"],
      ["acceptance_criteria", "AC-001"],
      ["evaluation_scenarios", "SC-001"],
    ];
    for (const [table, expected] of cases) {
      const client = makeSelectClient({ [table]: [] });
      expect(await nextCode(client, table, projectId)).toBe(expected);
    }
  });

  it("ignores non-matching prefixes", async () => {
    const client = makeSelectClient({
      user_stories: [{ code: "LEGACY-99" }, { code: "US-002" }],
    });
    expect(await nextCode(client, "user_stories", projectId)).toBe("US-003");
  });
});

// -----------------------------------------------------------------------------
// Retry mock: makeInsertClient lets us script a sequence of insert results.
// -----------------------------------------------------------------------------
function makeInsertClient(
  existingRows: Row[],
  insertResults: Array<{ data: unknown; error: { code?: string } | null }>,
) {
  let insertCallIdx = 0;
  return {
    from() {
      const builder: Record<string, unknown> = {};
      builder.select = () => builder;
      builder.eq = () => builder;
      builder.not = () => builder;
      builder.order = () => builder;
      builder.limit = () => Promise.resolve({ data: existingRows, error: null });
      builder.insert = () => builder;
      // .select("*").single() after insert
      builder.single = () => {
        const res = insertResults[insertCallIdx++];
        return Promise.resolve(res);
      };
      return builder;
    },
    _calls: () => insertCallIdx,
  } as unknown as Parameters<typeof generateAndInsertWithRetry>[0] & { _calls: () => number };
}

describe("generateAndInsertWithRetry", () => {
  it("returns data on first success", async () => {
    const client = makeInsertClient(
      [{ code: "REQ-002" }],
      [{ data: { id: "x", code: "REQ-003" }, error: null }],
    );
    const build = vi.fn((code: string) => ({ code, title: "t" }));
    const row = await generateAndInsertWithRetry(client, "product_requirements", "p1", build);
    expect(row).toEqual({ id: "x", code: "REQ-003" });
    expect(build).toHaveBeenCalledWith("REQ-003");
  });

  it("retries on unique_violation and eventually succeeds", async () => {
    const client = makeInsertClient(
      [{ code: "REQ-002" }],
      [
        { data: null, error: { code: "23505" } },
        { data: { id: "x", code: "REQ-003" }, error: null },
      ],
    );
    const row = await generateAndInsertWithRetry(client, "product_requirements", "p1", (c) => ({ code: c }));
    expect(row).toEqual({ id: "x", code: "REQ-003" });
  });

  it("throws non-unique errors immediately", async () => {
    const client = makeInsertClient(
      [],
      [{ data: null, error: { code: "23502" } }],
    );
    await expect(
      generateAndInsertWithRetry(client, "product_requirements", "p1", (c) => ({ code: c })),
    ).rejects.toMatchObject({ code: "23502" });
  });

  it("gives up after maxRetries unique_violations", async () => {
    const client = makeInsertClient(
      [],
      Array.from({ length: 5 }, () => ({ data: null, error: { code: "23505" } })),
    );
    await expect(
      generateAndInsertWithRetry(client, "product_requirements", "p1", (c) => ({ code: c }), 5),
    ).rejects.toMatchObject({ code: "23505" });
  });
});
