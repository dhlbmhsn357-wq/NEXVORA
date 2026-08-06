import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import {
  buildDependencyLayers,
  traverseImpact,
  type GraphNodeRef,
  type ImpactEdge,
  type ImpactHit,
  type TraversalDirection,
} from "./retrieval/impact-graph";

/**
 * تحليل الأثر والاعتماد — **تحميل الحواف واجتيازها**.
 *
 * الاجتياز نفسه نقي في `retrieval/impact-graph`. ده بيحمّل الحواف من
 * القاعدة، بيبني منها الرسم، بيشغّل الاجتياز، وبيحلّ عناوين العقد
 * للعرض. مصدرا الحواف:
 *
 * 1. `knowledge_impact_edges` — الحواف العامة بين أي نوعين (المصدر
 *    الأساسي، بيتولّد وقت المعالجة أو يدويًا).
 * 2. `knowledge_entity_relations` — علاقات الكيانات، بتتحوّل لحواف أثر
 *    عشان الاجتياز يشوف الشبكتين معًا بدل ما يفوّت علاقات الكيانات.
 */

export interface ImpactNode extends ImpactHit {
  label: string;
}

export interface ImpactReport {
  ok: boolean;
  message?: string;
  direction: TraversalDirection;
  start: { type: string; id: string; label: string };
  nodes: ImpactNode[];
}

/**
 * يحلّل أثر (أو اعتماد) عقدة واحدة.
 *
 * `downstream` = «لو غيّرنا ده، إيه اللي يتأثّر». `upstream` = «ده
 * بيعتمد على إيه». العناوين بتتحلّ في نداء واحد لكل نوع بدل نداء لكل
 * عقدة.
 */
export async function analyzeImpact(
  projectId: string,
  start: GraphNodeRef,
  options: { direction?: TraversalDirection; maxDepth?: number } = {}
): Promise<ImpactReport> {
  const direction = options.direction ?? "downstream";
  const supabase = createServiceClient();

  const edges = await loadEdges(supabase, projectId);
  const hits = traverseImpact(edges, start, { direction, maxDepth: options.maxDepth ?? 3 });

  // حلّ العناوين: نجمع المعرّفات المطلوبة بالنوع وننادي مرة لكل نوع.
  const refs: GraphNodeRef[] = [start, ...hits.map((h) => ({ type: h.type, id: h.id }))];
  const labels = await resolveLabels(supabase, refs);

  return {
    ok: true,
    direction,
    start: { type: start.type, id: start.id, label: labels.get(refKey(start.type, start.id)) ?? start.id },
    nodes: hits.map((h) => ({ ...h, label: labels.get(refKey(h.type, h.id)) ?? h.id })),
  };
}

/**
 * يبني طبقات الاعتماد لمجموعة عقد.
 *
 * يُستخدم لعرض «ترتيب البناء»: الطبقة الأولى بلا اعتمادات، وكل طبقة
 * بتعتمد على اللي قبلها.
 */
export async function dependencyLayers(
  projectId: string,
  nodes: GraphNodeRef[]
): Promise<GraphNodeRef[][]> {
  const supabase = createServiceClient();
  const edges = await loadEdges(supabase, projectId);
  return buildDependencyLayers(nodes, edges);
}

// ============================================================
// تحميل الحواف
// ============================================================

async function loadEdges(supabase: SupabaseClient, projectId: string): Promise<ImpactEdge[]> {
  const [generic, entityRels] = await Promise.all([
    supabase
      .from("knowledge_impact_edges")
      .select("from_type, from_id, to_type, to_id, edge_type, weight")
      .eq("project_id", projectId)
      .limit(5000),
    supabase
      .from("knowledge_entity_relations")
      .select("from_entity_id, to_entity_id, relation_type, confidence")
      .eq("project_id", projectId)
      .limit(5000),
  ]);

  const edges: ImpactEdge[] = [];

  for (const e of (generic.data ?? []) as Array<Record<string, unknown>>) {
    edges.push({
      fromType: e.from_type as string,
      fromId: e.from_id as string,
      toType: e.to_type as string,
      toId: e.to_id as string,
      edgeType: e.edge_type as string,
      weight: (e.weight as number) ?? 50,
    });
  }

  // علاقات الكيانات → حواف أثر (نوع الطرفين "entity").
  for (const r of (entityRels.data ?? []) as Array<Record<string, unknown>>) {
    edges.push({
      fromType: "entity",
      fromId: r.from_entity_id as string,
      toType: "entity",
      toId: r.to_entity_id as string,
      edgeType: r.relation_type as string,
      weight: (r.confidence as number) ?? 50,
    });
  }

  return edges;
}

// ============================================================
// حلّ العناوين
// ============================================================

/** الجدول والعمود النصّي لكل نوع عقدة. */
const LABEL_SOURCE: Record<string, { table: string; column: string }> = {
  entity: { table: "knowledge_entities", column: "name" },
  business_rule: { table: "knowledge_business_rules", column: "name" },
  workflow: { table: "knowledge_workflows", column: "name" },
  requirement: { table: "knowledge_requirements", column: "statement" },
  decision: { table: "knowledge_decisions", column: "decision" },
  risk: { table: "knowledge_risks", column: "description" },
  item: { table: "knowledge_items", column: "title" },
};

async function resolveLabels(
  supabase: SupabaseClient,
  refs: GraphNodeRef[]
): Promise<Map<string, string>> {
  const labels = new Map<string, string>();

  const idsByType = new Map<string, Set<string>>();
  for (const r of refs) {
    const set = idsByType.get(r.type) ?? new Set<string>();
    set.add(r.id);
    idsByType.set(r.type, set);
  }

  await Promise.all(
    [...idsByType.entries()].map(async ([type, ids]) => {
      const source = LABEL_SOURCE[type];
      if (!source) return;
      const { data } = await supabase
        .from(source.table)
        .select(`id, ${source.column}`)
        .in("id", [...ids]);
      const rows = (data ?? []) as unknown as Array<Record<string, string>>;
      for (const row of rows) {
        labels.set(refKey(type, row.id), truncate(row[source.column] ?? row.id));
      }
    })
  );

  return labels;
}

function refKey(type: string, id: string): string {
  return `${type}::${id}`;
}

function truncate(text: string, max = 120): string {
  return text.length <= max ? text : `${text.slice(0, max)}…`;
}
