import { describe, it, expect } from "vitest";
import { collectColumns, csvEscape, toCsv, toJson, sqlIdentifier, sqlValue, toSqlInserts, serialize } from "./serializers";
import { checksum, reconcile, buildManifest, countByEntity } from "./reconciliation";
import { describeTarget, listTargetTypes, validateTargetConfig, isTargetConfigured, isFileTarget } from "./target-adapters";
import { chunkRows, resolveEndpoint, buildAuthHeaders, buildRequestBody, classifyDirectStatus } from "./connectors";
import type { LoadRow, DatasetSummary } from "./load-types";

describe("serializers · CSV", () => {
  it("collects columns in first-seen order across ragged rows", () => {
    const rows: LoadRow[] = [{ a: "1", b: "2" }, { b: "3", c: "4" }];
    expect(collectColumns(rows)).toEqual(["a", "b", "c"]);
  });

  it("escapes commas, quotes and newlines", () => {
    expect(csvEscape("plain")).toBe("plain");
    expect(csvEscape("a,b")).toBe('"a,b"');
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""');
    expect(csvEscape("line1\nline2")).toBe('"line1\nline2"');
  });

  it("builds a header + CRLF rows with missing cells blank", () => {
    const rows: LoadRow[] = [{ name: "Ali", city: "Tripoli" }, { name: "Sara" }];
    const csv = toCsv(rows);
    expect(csv).toBe("name,city\r\nAli,Tripoli\r\nSara,");
  });

  it("emits header-only for empty rows", () => {
    expect(toCsv([], ["x", "y"])).toBe("x,y");
  });
});

describe("serializers · SQL", () => {
  it("quotes identifiers and doubles embedded quotes", () => {
    expect(sqlIdentifier("customers")).toBe('"customers"');
    expect(sqlIdentifier('we"ird')).toBe('"we""ird"');
  });

  it("escapes single quotes and maps null/undefined to NULL", () => {
    expect(sqlValue("O'Brien")).toBe("'O''Brien'");
    expect(sqlValue(null)).toBe("NULL");
    expect(sqlValue(undefined)).toBe("NULL");
    expect(sqlValue("")).toBe("''");
  });

  it("prevents injection by escaping value content", () => {
    const evil = sqlValue("'); drop table users; --");
    expect(evil).toBe("'''); drop table users; --'");
    expect(evil.startsWith("'")).toBe(true);
    expect(evil.endsWith("'")).toBe(true);
  });

  it("builds batched multi-row INSERTs with optional on conflict", () => {
    const rows: LoadRow[] = [{ id: "1", name: "Ali" }, { id: "2", name: "Sara" }, { id: "3", name: "Omar" }];
    const sql = toSqlInserts("customers", rows, { batchSize: 2, onConflictDoNothing: true });
    // دفعتان (2 + 1)
    expect(sql.match(/insert into/g)?.length).toBe(2);
    expect(sql).toContain('insert into "customers" ("id", "name") values');
    expect(sql).toContain("on conflict do nothing;");
    expect(sql).toContain("('1', 'Ali')");
  });

  it("comments out empty entity instead of emitting invalid SQL", () => {
    expect(toSqlInserts("empty", [])).toContain("-- لا صفوف");
  });
});

describe("serializers · dispatch", () => {
  const rows: LoadRow[] = [{ id: "1" }];
  it("routes by format", () => {
    expect(serialize("json", "t", rows)).toBe(toJson(rows));
    expect(serialize("csv", "t", rows)).toBe(toCsv(rows));
    expect(serialize("sql", "t", rows)).toContain("insert into");
  });
});

describe("reconciliation", () => {
  it("checksum is deterministic and differs on change", () => {
    expect(checksum("hello")).toBe(checksum("hello"));
    expect(checksum("hello")).not.toBe(checksum("world"));
    expect(checksum("")).toHaveLength(8);
  });

  it("reconciles matching counts", () => {
    const r = reconcile({ customers: 100, invoices: 250 }, { customers: 100, invoices: 250 });
    expect(r.reconciled).toBe(true);
    expect(r.mismatches).toHaveLength(0);
    expect(r.totalExpected).toBe(350);
    expect(r.totalLoaded).toBe(350);
  });

  it("flags a per-entity discrepancy", () => {
    const r = reconcile({ customers: 100, invoices: 250 }, { customers: 98, invoices: 250 });
    expect(r.reconciled).toBe(false);
    expect(r.mismatches).toHaveLength(1);
    expect(r.mismatches[0]).toContain("customers");
    expect(r.entities.find((e) => e.entity === "customers")?.match).toBe(false);
  });

  it("treats a missing entity on either side as zero", () => {
    const r = reconcile({ a: 5 }, { b: 5 });
    expect(r.reconciled).toBe(false);
    expect(r.entities).toHaveLength(2);
  });

  it("counts rows by entity", () => {
    expect(countByEntity({ a: [{ x: "1" }, { x: "2" }], b: [] })).toEqual({ a: 2, b: 0 });
  });

  it("builds a manifest with totals", () => {
    const summaries: DatasetSummary[] = [
      { entity: "customers", label: "العملاء", rowCount: 100, checksum: "abc", format: "sql" },
      { entity: "invoices", label: "الفواتير", rowCount: 250, checksum: "def", format: "sql" },
    ];
    const m = buildManifest("sql", summaries);
    expect(m.totalEntities).toBe(2);
    expect(m.totalRows).toBe(350);
    expect(m.format).toBe("sql");
  });
});

describe("target-adapters", () => {
  it("lists all target types", () => {
    const keys = listTargetTypes().map((t) => t.key).sort();
    expect(keys).toEqual(["csv_bundle", "postgres", "rest_api", "sql_file", "supabase"]);
  });

  it("file targets are always configured (no secret needed)", () => {
    expect(isFileTarget("sql_file")).toBe(true);
    expect(isFileTarget("postgres")).toBe(false);
    expect(isTargetConfigured("sql_file", {}, false)).toBe(true);
    expect(isTargetConfigured("csv_bundle", {}, false)).toBe(true);
  });

  it("rest_api needs endpoint config AND a secret to be configured", () => {
    expect(validateTargetConfig("rest_api", {}).ok).toBe(false);
    expect(validateTargetConfig("rest_api", { endpoint: "https://erp/api" }).ok).toBe(true);
    expect(isTargetConfigured("rest_api", { endpoint: "https://erp/api" }, false)).toBe(false);
    expect(isTargetConfigured("rest_api", { endpoint: "https://erp/api" }, true)).toBe(true);
  });

  it("postgres needs a secret but no required config field", () => {
    expect(isTargetConfigured("postgres", {}, false)).toBe(false);
    expect(isTargetConfigured("postgres", {}, true)).toBe(true);
  });

  it("unknown target type is never configured", () => {
    expect(describeTarget("nope")).toBeNull();
    expect(isTargetConfigured("nope", {}, true)).toBe(false);
  });

  it("includes supabase as a real direct target", () => {
    const d = describeTarget("supabase");
    expect(d?.realtime).toBe(true);
    expect(d?.needsSecret).toBe(true);
    expect(isTargetConfigured("supabase", { url: "https://x.supabase.co" }, true)).toBe(true);
    expect(isTargetConfigured("supabase", { url: "https://x.supabase.co" }, false)).toBe(false);
  });
});

describe("connectors · pure helpers", () => {
  it("chunks rows and clamps size", () => {
    const rows: LoadRow[] = Array.from({ length: 5 }, (_, i) => ({ id: String(i) }));
    expect(chunkRows(rows, 2).map((b) => b.length)).toEqual([2, 2, 1]);
    expect(chunkRows(rows, 0).length).toBe(1); // 0 → clamped to 500
  });

  it("resolves endpoint templates", () => {
    expect(resolveEndpoint("https://erp/api/{entity}", "customers")).toBe("https://erp/api/customers");
    expect(resolveEndpoint("https://erp/api/", "invoices")).toBe("https://erp/api/invoices");
    expect(resolveEndpoint("https://erp/api", "cars")).toBe("https://erp/api/cars");
  });

  it("builds auth headers per type", () => {
    expect(buildAuthHeaders("bearer", "TOK")).toEqual({ Authorization: "Bearer TOK" });
    expect(buildAuthHeaders("apikey", "TOK")).toEqual({ "x-api-key": "TOK" });
    expect(buildAuthHeaders("apikey", "TOK", "apikey")).toEqual({ apikey: "TOK" });
    expect(buildAuthHeaders("none", "TOK")).toEqual({});
    expect(buildAuthHeaders("bearer", "")).toEqual({});
  });

  it("builds request body array vs wrapped", () => {
    const rows: LoadRow[] = [{ id: "1" }];
    expect(buildRequestBody(rows, "array")).toEqual(rows);
    expect(buildRequestBody(rows, "wrapped")).toEqual({ rows });
  });

  it("classifies direct-load status", () => {
    expect(classifyDirectStatus(100, 100, 0)).toBe("completed");
    expect(classifyDirectStatus(100, 80, 1)).toBe("partial");
    expect(classifyDirectStatus(100, 0, 3)).toBe("failed");
    expect(classifyDirectStatus(0, 0, 0)).toBe("completed");
  });
});
