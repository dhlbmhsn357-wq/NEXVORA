/**
 * محرّك ترتيب التبعية (Dependency Engine) — **وحدة نقية بلا I/O**.
 *
 * يرتّب الكيانات بحيث تُرحَّل الجداول المرجعية/الأب قبل الأبناء
 * (Customers → Invoices → Payments)، ولا يُسمح بترحيل Payment قبل Invoice.
 * فرز طوبولوجي مع كسر آمن للدورات لضمان تقدّم التنفيذ.
 */

import type { RelationshipSpec } from "@/lib/simulation/simulation-types";
import type { EntityCount, OrderedEntity, DependencyPlan } from "./execution-types";

export function planDependencyOrder(entities: EntityCount[], relationships: RelationshipSpec[]): DependencyPlan {
  const names = new Set(entities.map((e) => e.entity));
  // حافة child → parent (الابن يعتمد على الأب): from يعتمد على to.
  const deps = new Map<string, Set<string>>();
  for (const e of entities) deps.set(e.entity, new Set());
  for (const r of relationships) {
    if (r.kind === "many_to_many") continue;
    if (!names.has(r.fromEntity) || !names.has(r.toEntity) || r.fromEntity === r.toEntity) continue;
    deps.get(r.fromEntity)!.add(r.toEntity);
  }

  // كسر الدورات: أزِل الحواف التي تغلق دورة (اكتشاف عبر DFS).
  const brokenCycles = breakCycles(deps);

  // Kahn topological sort — المستوى = أطول مسار من جذر.
  const level = new Map<string, number>();
  const visiting = new Set<string>();
  function depth(node: string): number {
    if (level.has(node)) return level.get(node)!;
    if (visiting.has(node)) return 0;
    visiting.add(node);
    let max = 0;
    for (const p of deps.get(node) ?? []) max = Math.max(max, depth(p) + 1);
    visiting.delete(node);
    level.set(node, max);
    return max;
  }
  for (const e of entities) depth(e.entity);

  const byName = new Map(entities.map((e) => [e.entity, e]));
  const ordered: OrderedEntity[] = entities
    .map((e) => ({ entity: e.entity, label: e.label, rows: e.rows, level: level.get(e.entity) ?? 0, order: 0 }))
    .sort((a, b) => a.level - b.level || (byName.get(b.entity)!.rows - byName.get(a.entity)!.rows))
    .map((o, i) => ({ ...o, order: i + 1 }));

  return { ordered, brokenCycles };
}

function breakCycles(deps: Map<string, Set<string>>): string[][] {
  const cycles: string[][] = [];
  const state = new Map<string, 0 | 1 | 2>(); // 0=unseen 1=visiting 2=done
  const stack: string[] = [];

  function dfs(node: string): void {
    state.set(node, 1);
    stack.push(node);
    for (const next of [...(deps.get(node) ?? [])]) {
      const st = state.get(next) ?? 0;
      if (st === 1) {
        // دورة: اكسر الحافة node→next.
        const idx = stack.indexOf(next);
        cycles.push([...stack.slice(idx), next]);
        deps.get(node)!.delete(next);
      } else if (st === 0) {
        dfs(next);
      }
    }
    stack.pop();
    state.set(node, 2);
  }

  for (const node of deps.keys()) if ((state.get(node) ?? 0) === 0) dfs(node);
  return cycles;
}
