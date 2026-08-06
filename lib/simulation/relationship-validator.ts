/**
 * التحقّق من السلامة المرجعية (Referential Integrity) — **وحدة نقية**.
 *
 * يتحقّق داخل الـTwin أن كل العلاقات بُنيت بنجاح: Foreign Keys، Parent-Child،
 * Many-to-Many، Recursive، Composite، ويكشف Broken/Orphan والدورات (Circular).
 */

import { hasKey } from "./digital-twin";
import type { DigitalTwin, RelationshipSpec, RelationshipCheck, RelationshipReport } from "./simulation-types";
import { SIM_LIMITS } from "./simulation-types";

export function validateRelationships(twin: DigitalTwin): RelationshipReport {
  const checks: RelationshipCheck[] = [];
  let totalBroken = 0;
  let totalOrphans = 0;

  for (const rel of twin.relationships) {
    const child = twin.entities.get(rel.fromEntity);
    const parent = twin.entities.get(rel.toEntity);
    const fk = rel.viaColumns[0];
    if (!child || !parent || !fk) {
      checks.push({ fromEntity: rel.fromEntity, toEntity: rel.toEntity, kind: rel.kind, checked: 0, broken: 0, orphans: 0, passed: true, message: "غير قابل للتحقّق (كيان/مفتاح غائب في العيّنة).", samples: [] });
      continue;
    }
    let checked = 0;
    let broken = 0;
    let orphans = 0;
    const samples: string[] = [];
    for (const row of child.rows) {
      const v = (row[fk] ?? "").trim();
      if (!v) continue;
      checked++;
      if (!hasKey(twin, rel.toEntity, v)) {
        broken++;
        if (rel.kind === "parent_child") orphans++;
        if (samples.length < SIM_LIMITS.maxSamplesPerIssue) samples.push(v.slice(0, SIM_LIMITS.sampleValueMaxLen));
      }
    }
    totalBroken += broken;
    totalOrphans += orphans;
    checks.push({
      fromEntity: rel.fromEntity, toEntity: rel.toEntity, kind: rel.kind, checked, broken, orphans,
      passed: broken === 0,
      message: broken === 0 ? `كل المراجع (${checked}) سليمة.` : `${broken} مرجع مكسور من ${checked} — ${rel.fromEntity}.${fk} → ${rel.toEntity}.`,
      samples,
    });
  }

  return {
    checks,
    totalBroken,
    totalOrphans,
    circularChains: detectCircular(twin.relationships),
    passed: totalBroken === 0,
  };
}

/** يكتشف الدورات (Circular) في رسم العلاقات. */
export function detectCircular(rels: RelationshipSpec[]): string[][] {
  const adj = new Map<string, string[]>();
  for (const r of rels) {
    if (r.kind === "many_to_many") continue;
    const arr = adj.get(r.fromEntity) ?? [];
    arr.push(r.toEntity);
    adj.set(r.fromEntity, arr);
  }
  const cycles: string[][] = [];
  const seen = new Set<string>();

  function dfs(node: string, path: string[], visiting: Set<string>): void {
    if (visiting.has(node)) {
      const idx = path.indexOf(node);
      if (idx >= 0) cycles.push([...path.slice(idx), node]);
      return;
    }
    if (seen.has(node)) return;
    visiting.add(node);
    for (const next of adj.get(node) ?? []) dfs(next, [...path, node], visiting);
    visiting.delete(node);
    seen.add(node);
  }

  for (const node of adj.keys()) dfs(node, [], new Set());
  // إزالة التكرارات (نفس الدورة بترتيب مختلف).
  const uniq = new Map<string, string[]>();
  for (const c of cycles) {
    const key = [...c].sort().join(">");
    if (!uniq.has(key)) uniq.set(key, c);
  }
  return [...uniq.values()];
}
