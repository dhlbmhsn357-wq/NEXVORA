import type { TransformRule } from "./rule-types";

/**
 * رسم التحويل — **وحدة نقية بلا I/O**.
 *
 * يوضّح كيف تتحرّك البيانات: من حقول المصدر ← عبر القواعد ← إلى حقول
 * الوجهة. عُقد + حواف قابلة للعرض.
 */

export interface GraphNode {
  id: string;
  label: string;
  type: "source" | "rule" | "target";
}
export interface GraphEdge {
  from: string;
  to: string;
}
export interface TransformationGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export function buildGraph(rules: TransformRule[]): TransformationGraph {
  const nodes = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];

  const addNode = (id: string, label: string, type: GraphNode["type"]) => {
    if (!nodes.has(id)) nodes.set(id, { id, label, type });
  };

  for (const r of rules.filter((x) => x.enabled)) {
    const ruleId = `rule:${r.id}`;
    addNode(ruleId, r.kind, "rule");
    for (const src of r.sourceFields) {
      const sid = `src:${src}`;
      addNode(sid, src, "source");
      edges.push({ from: sid, to: ruleId });
    }
    const tid = `tgt:${r.targetField}`;
    addNode(tid, r.targetField, "target");
    edges.push({ from: ruleId, to: tid });
  }

  return { nodes: [...nodes.values()], edges };
}
