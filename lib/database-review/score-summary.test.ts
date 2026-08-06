import { describe, expect, it } from "vitest";
import { computeDatabaseScoreSummary } from "./score-summary";
import type { DatabaseReviewCategoryKey } from "@/lib/types/database";

function scores(overrides: Partial<Record<DatabaseReviewCategoryKey, number>> = {}): Record<DatabaseReviewCategoryKey, number> {
  return {
    database_structure: 100,
    query: 100,
    migration: 100,
    data_integrity: 100,
    storage: 100,
    logging: 100,
    ...overrides,
  };
}

describe("computeDatabaseScoreSummary", () => {
  it("لو كل المحاور 100، كل الدرجات النهائية 100", () => {
    const summary = computeDatabaseScoreSummary(scores());
    expect(summary.overall_database_score).toBe(100);
    expect(summary.database_integrity).toBe(100);
  });

  it("query/storage/logging بترجع درجة محورها مباشرة", () => {
    const summary = computeDatabaseScoreSummary(scores({ query: 50, storage: 30, logging: 70 }));
    expect(summary.query_quality).toBe(50);
    expect(summary.storage_security).toBe(30);
    expect(summary.logging).toBe(70);
  });

  it("database_integrity بيتحسب من متوسط database_structure + migration + data_integrity", () => {
    const summary = computeDatabaseScoreSummary(scores({ database_structure: 90, migration: 60, data_integrity: 30 }));
    expect(summary.database_integrity).toBe(60);
  });
});
