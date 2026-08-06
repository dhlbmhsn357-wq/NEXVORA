import type { KnowledgeConsistencyIssue, KnowledgeRelation } from "@/lib/types/database";

export interface MinimalNode {
  id: string;
  category: string;
  item_key: string;
  title: string;
}

/**
 * مفتاح نفسه ظاهر في أكتر من محور معرفي مختلف — إشارة قوية إن نفس
 * الفكرة اتسجّلت مرتين تحت تصنيف مختلف (مثلًا "دعم الفروع" مسجّل في
 * risks و constraints في نفس الوقت). Pure.
 */
export function detectDuplicateKeys(nodes: MinimalNode[]): KnowledgeConsistencyIssue[] {
  const byKey = new Map<string, MinimalNode[]>();
  for (const node of nodes) {
    const list = byKey.get(node.item_key) ?? [];
    list.push(node);
    byKey.set(node.item_key, list);
  }

  const issues: KnowledgeConsistencyIssue[] = [];
  for (const [key, group] of byKey) {
    const categories = new Set(group.map((n) => n.category));
    if (categories.size > 1) {
      issues.push({
        type: "duplicate_key",
        severity: "medium",
        description: `"${key}" مسجّل في أكتر من محور معرفي مختلف (${[...categories].join("، ")}) — ممكن يكون نفس الفكرة اتكررت.`,
        node_ids: group.map((n) => n.id),
      });
    }
  }
  return issues;
}

/**
 * كشف دورة اعتماد حقيقية (A يعتمد على B، B يعتمد على C، C يعتمد على A)
 * عبر علاقات depends_on بس — DFS + Recursion Stack كلاسيكي. Pure.
 */
export function detectCircularDependencies(relations: Pick<KnowledgeRelation, "from_node_id" | "to_node_id" | "relation_type">[]): KnowledgeConsistencyIssue[] {
  const adjacency = new Map<string, string[]>();
  for (const rel of relations) {
    if (rel.relation_type !== "depends_on") continue;
    const list = adjacency.get(rel.from_node_id) ?? [];
    list.push(rel.to_node_id);
    adjacency.set(rel.from_node_id, list);
  }

  const visited = new Set<string>();
  const inStack = new Set<string>();
  const issues: KnowledgeConsistencyIssue[] = [];
  const reportedCycles = new Set<string>();

  function dfs(node: string, path: string[]): void {
    visited.add(node);
    inStack.add(node);
    for (const next of adjacency.get(node) ?? []) {
      if (inStack.has(next)) {
        const cycleStart = path.indexOf(next);
        const cycle = [...path.slice(cycleStart), next];
        const signature = [...new Set(cycle)].sort().join(",");
        if (!reportedCycles.has(signature)) {
          reportedCycles.add(signature);
          issues.push({
            type: "circular_dependency",
            severity: "high",
            description: `دورة اعتماد مكتشفة: ${cycle.join(" → ")}.`,
            node_ids: [...new Set(cycle)],
          });
        }
      } else if (!visited.has(next)) {
        dfs(next, [...path, next]);
      }
    }
    inStack.delete(node);
  }

  for (const node of adjacency.keys()) {
    if (!visited.has(node)) dfs(node, [node]);
  }

  return issues;
}

/**
 * علاقة بتشاور على عقدة مش نشطة (superseded/محذوفة) — لازم تتراجع.
 * Pure.
 */
export function detectOrphanRelations(
  relations: Pick<KnowledgeRelation, "id" | "from_node_id" | "to_node_id">[],
  activeNodeIds: Set<string>
): KnowledgeConsistencyIssue[] {
  return relations
    .filter((rel) => !activeNodeIds.has(rel.from_node_id) || !activeNodeIds.has(rel.to_node_id))
    .map((rel) => ({
      type: "orphan_relation" as const,
      severity: "low" as const,
      description: "علاقة بتشاور على عنصر معرفة مش نشط (تحديث لاحق أو حذف).",
      node_ids: [rel.from_node_id, rel.to_node_id].filter((id) => !activeNodeIds.has(id)),
    }));
}

export function buildDeterministicIssues(
  nodes: MinimalNode[],
  relations: Pick<KnowledgeRelation, "id" | "from_node_id" | "to_node_id" | "relation_type">[]
): KnowledgeConsistencyIssue[] {
  const activeIds = new Set(nodes.map((n) => n.id));
  return [
    ...detectDuplicateKeys(nodes),
    ...detectCircularDependencies(relations),
    ...detectOrphanRelations(relations, activeIds),
  ];
}
