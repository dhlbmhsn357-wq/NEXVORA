/**
 * اجتياز رسم الأثر والاعتماد — **وحدة نقية بلا I/O**.
 *
 * ## السؤال اللي بتجاوب عليه
 *
 * «لو غيّرنا هذا القرار، ماذا يتأثّر؟» و«ما الذي يعتمد عليه هذا
 * المتطلب؟». الإجابة اجتياز رسم بياني: من عقدة البداية، امشِ على
 * الحواف لعمق محدّد، وارجع كل ما وصلته مع المسار والوزن المتراكم.
 *
 * الوزن المتراكم بيتضاءل مع البُعد: أثر مباشر (حافة واحدة) أقوى من أثر
 * غير مباشر عبر ثلاث حواف. ده بيخلّي الترتيب يعكس «قوّة الأثر» لا مجرّد
 * «قابلية الوصول».
 */

export interface ImpactEdge {
  fromType: string;
  fromId: string;
  toType: string;
  toId: string;
  edgeType: string;
  weight: number; // 0–100
}

export interface GraphNodeRef {
  type: string;
  id: string;
}

export interface ImpactHit {
  type: string;
  id: string;
  depth: number;
  /** الوزن المتراكم ٠–١ — حاصل ضرب أوزان الحواف على المسار. */
  cumulativeWeight: number;
  edgeType: string;
  /** المسار من البداية لهذه العقدة (شامل الطرفين). */
  path: GraphNodeRef[];
}

export type TraversalDirection = "downstream" | "upstream";

export interface TraversalOptions {
  maxDepth?: number;
  direction?: TraversalDirection;
  /** أقل وزن متراكم يستحق الإدراج — يقصّ الأثر الضعيف جدًا. */
  minCumulativeWeight?: number;
}

const DEFAULT_MAX_DEPTH = 3;
const DEFAULT_MIN_WEIGHT = 0.05;

function keyOf(type: string, id: string): string {
  return `${type}::${id}`;
}

/**
 * يجتاز الأثر من عقدة البداية.
 *
 * - `downstream`: «ماذا يتأثّر بي» — يمشي from→to.
 * - `upstream`: «على ماذا أعتمد» — يمشي to→from.
 *
 * BFS بعمق محدود مع منع الدوران (كل عقدة تُزار مرة بأقصر/أقوى مسار
 * يوصلها). الرسوم البيانية للمعرفة بتحتوي دورات (أ يؤثّر على ب، ب على
 * أ)، وبدون حارس الزيارة كان الاجتياز هيدور للأبد.
 */
export function traverseImpact(
  edges: ImpactEdge[],
  start: GraphNodeRef,
  options: TraversalOptions = {}
): ImpactHit[] {
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
  const direction = options.direction ?? "downstream";
  const minWeight = options.minCumulativeWeight ?? DEFAULT_MIN_WEIGHT;

  // فهرسة الحواف بالاتجاه المطلوب.
  const adjacency = new Map<string, ImpactEdge[]>();
  for (const e of edges) {
    const fromKey = direction === "downstream" ? keyOf(e.fromType, e.fromId) : keyOf(e.toType, e.toId);
    const list = adjacency.get(fromKey) ?? [];
    list.push(e);
    adjacency.set(fromKey, list);
  }

  const visited = new Set<string>([keyOf(start.type, start.id)]);
  const hits: ImpactHit[] = [];

  interface QueueItem {
    ref: GraphNodeRef;
    depth: number;
    weight: number;
    path: GraphNodeRef[];
  }

  let frontier: QueueItem[] = [
    { ref: start, depth: 0, weight: 1, path: [start] },
  ];

  while (frontier.length > 0) {
    const next: QueueItem[] = [];

    for (const item of frontier) {
      if (item.depth >= maxDepth) continue;
      const outgoing = adjacency.get(keyOf(item.ref.type, item.ref.id)) ?? [];

      for (const edge of outgoing) {
        const neighbor: GraphNodeRef =
          direction === "downstream"
            ? { type: edge.toType, id: edge.toId }
            : { type: edge.fromType, id: edge.fromId };
        const nKey = keyOf(neighbor.type, neighbor.id);
        if (visited.has(nKey)) continue;

        const cumulative = item.weight * (edge.weight / 100);
        if (cumulative < minWeight) continue;

        visited.add(nKey);
        const path = [...item.path, neighbor];
        hits.push({
          type: neighbor.type,
          id: neighbor.id,
          depth: item.depth + 1,
          cumulativeWeight: round3(cumulative),
          edgeType: edge.edgeType,
          path,
        });
        next.push({ ref: neighbor, depth: item.depth + 1, weight: cumulative, path });
      }
    }

    frontier = next;
  }

  // الأقوى أثرًا أولًا، ثم الأقرب.
  return hits.sort((a, b) => b.cumulativeWeight - a.cumulativeWeight || a.depth - b.depth);
}

/**
 * يقسّم العقد لطبقات اعتماد.
 *
 * الطبقة ٠ = بلا اعتمادات واردة (الأساس). كل طبقة بعدها بتعتمد على
 * اللي قبلها. مفيد لعرض «ترتيب البناء»: نفّذ الطبقة ٠ أولًا.
 *
 * الدورات بتتكسر بإسناد العقد المتبقية لطبقة أخيرة بدل الدوران — رسم
 * المعرفة مش دايمًا لا دوري، وإسقاط الدورة أأمن من رفض التقسيم كله.
 */
export function buildDependencyLayers(
  nodes: GraphNodeRef[],
  edges: ImpactEdge[]
): GraphNodeRef[][] {
  if (nodes.length === 0) return [];

  const nodeKeys = new Set(nodes.map((n) => keyOf(n.type, n.id)));
  // اعتماد: from depends_on to  ⇒  to لازم يسبق from.
  const incoming = new Map<string, Set<string>>();
  for (const n of nodes) incoming.set(keyOf(n.type, n.id), new Set());

  for (const e of edges) {
    const fromKey = keyOf(e.fromType, e.fromId);
    const toKey = keyOf(e.toType, e.toId);
    if (!nodeKeys.has(fromKey) || !nodeKeys.has(toKey)) continue;
    incoming.get(fromKey)?.add(toKey);
  }

  const layers: GraphNodeRef[][] = [];
  const placed = new Set<string>();
  const byKey = new Map(nodes.map((n) => [keyOf(n.type, n.id), n]));

  while (placed.size < nodes.length) {
    const layer: GraphNodeRef[] = [];
    for (const [key, node] of byKey) {
      if (placed.has(key)) continue;
      const deps = incoming.get(key) ?? new Set();
      const unmet = [...deps].some((d) => !placed.has(d));
      if (!unmet) layer.push(node);
    }

    if (layer.length === 0) {
      // دورة — نحط المتبقّي كله في طبقة أخيرة بدل ما ندور.
      const remaining = [...byKey.entries()]
        .filter(([k]) => !placed.has(k))
        .map(([, n]) => n);
      layers.push(remaining);
      break;
    }

    for (const n of layer) placed.add(keyOf(n.type, n.id));
    layers.push(layer);
  }

  return layers;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
