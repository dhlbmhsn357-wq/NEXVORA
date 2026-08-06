/**
 * نواة تنفيذ الدفعة (Chunk Execution Core) — **وحدة نقية بلا I/O**.
 *
 * تنفّذ دفعة صفوف واحدة عبر محرّك التحويل المعتمَد (المرحلة ٤): تحويل →
 * تحقّق → قرار مصير → إنتاج صفوف جاهزة للتحميل + تحقّق ما بعد الدفعة
 * (تطابق العدد). تُعيد استخدام `transformRow`/`decideRow` — لا تعيد تنفيذهما.
 */

import { transformRow } from "@/lib/transformation/pipeline";
import type { Row, TransformRule } from "@/lib/transformation/rule-types";
import type { BusinessRule } from "@/lib/transformation/business-rules";
import { deriveExpectations, validateRow } from "@/lib/simulation/validators";
import type { ChunkResult, ChunkIssue } from "./execution-types";

export function executeChunk(rules: TransformRule[], businessRules: BusinessRule[], rows: Row[]): ChunkResult {
  const expectations = deriveExpectations(rules);
  const loaded: Row[] = [];
  const issueMap = new Map<string, ChunkIssue>();
  let migrated = 0;
  let skipped = 0;
  let archived = 0;
  let failed = 0;

  const addIssue = (field: string, issueType: string) => {
    const key = `${issueType}|${field}`;
    const it = issueMap.get(key) ?? { field, issueType, count: 0 };
    it.count++;
    issueMap.set(key, it);
  };

  for (const src of rows) {
    try {
      const res = transformRow(rules, businessRules, src, {});
      for (const vi of validateRow(expectations, src, res.output)) addIssue(vi.field, vi.issueType);

      if (res.decision.action === "migrate") {
        loaded.push(res.output);
        migrated++;
      } else if (res.decision.action === "skip") {
        skipped++;
      } else {
        archived++;
      }
    } catch {
      failed++;
      addIssue("*", "rule_error");
    }
  }

  // تحقّق ما بعد الدفعة: المُحمَّل + المتخطّى + المؤرشف + الفاشل = المُدخَل.
  const accounted = migrated + skipped + archived + failed;
  return {
    processed: rows.length,
    migrated,
    skipped,
    archived,
    failed,
    loaded,
    issues: [...issueMap.values()],
    countMatch: accounted === rows.length && loaded.length === migrated,
  };
}
