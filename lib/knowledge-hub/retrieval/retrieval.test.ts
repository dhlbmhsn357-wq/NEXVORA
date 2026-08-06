import { describe, expect, it } from "vitest";
import {
  assembleContextText,
  compressToBudget,
  rankMemories,
  type MemoryCandidate,
} from "./ranking";
import {
  buildDependencyLayers,
  traverseImpact,
  type ImpactEdge,
  type GraphNodeRef,
} from "./impact-graph";

// زمن ثابت للاختبار — الوحدات نقية فبتاخد nowMs صراحةً.
const NOW = Date.parse("2026-07-01T00:00:00Z");

function cand(partial: Partial<MemoryCandidate> & { objectId: string }): MemoryCandidate {
  return {
    objectType: "entity",
    title: "",
    content: "محتوى",
    similarity: 0.5,
    ...partial,
  };
}

// ============================================================
// ranking
// ============================================================

describe("rankMemories", () => {
  it("التشابه الأعلى يتصدّر عند تساوي باقي العوامل", () => {
    const ranked = rankMemories(
      [cand({ objectId: "a", similarity: 0.4 }), cand({ objectId: "b", similarity: 0.9 })],
      NOW
    );
    expect(ranked[0].objectId).toBe("b");
  });

  it("الثقة الأعلى ترفع الترتيب عند تساوي التشابه", () => {
    const ranked = rankMemories(
      [
        cand({ objectId: "low", similarity: 0.6, confidence: 20 }),
        cand({ objectId: "high", similarity: 0.6, confidence: 95 }),
      ],
      NOW
    );
    expect(ranked[0].objectId).toBe("high");
  });

  it("الأحدث يكسر التعادل", () => {
    const ranked = rankMemories(
      [
        cand({ objectId: "old", similarity: 0.6, confidence: 60, createdAt: "2024-01-01T00:00:00Z" }),
        cand({ objectId: "new", similarity: 0.6, confidence: 60, createdAt: "2026-06-30T00:00:00Z" }),
      ],
      NOW
    );
    expect(ranked[0].objectId).toBe("new");
  });

  it("الدرجة بين ٠ و١", () => {
    const ranked = rankMemories([cand({ objectId: "a", similarity: 1, confidence: 100 })], NOW);
    expect(ranked[0].score).toBeGreaterThan(0);
    expect(ranked[0].score).toBeLessThanOrEqual(1);
  });
});

describe("compressToBudget", () => {
  it("يستبعد ما يتجاوز الميزانية ويعلّم truncated", () => {
    const ranked = rankMemories(
      [
        cand({ objectId: "a", content: "x".repeat(100), similarity: 0.9 }),
        cand({ objectId: "b", content: "y".repeat(100), similarity: 0.8 }),
      ],
      NOW
    );
    const result = compressToBudget(ranked, 120);
    expect(result.included).toHaveLength(1);
    expect(result.omitted).toHaveLength(1);
    expect(result.truncated).toBe(true);
    // الأعلى ترتيبًا هو اللي دخل.
    expect(result.included[0].objectId).toBe("a");
  });

  it("ميزانية كافية تُدخل الكل بلا اقتطاع", () => {
    const ranked = rankMemories([cand({ objectId: "a", content: "قصير" })], NOW);
    const result = compressToBudget(ranked, 10_000);
    expect(result.truncated).toBe(false);
    expect(result.omitted).toHaveLength(0);
  });
});

describe("assembleContextText", () => {
  it("يجمّع بالنوع مع عناوين عربية", () => {
    const ranked = rankMemories(
      [
        cand({ objectId: "e1", objectType: "entity", title: "المبيعات", content: "قسم" }),
        cand({ objectId: "r1", objectType: "business_rule", content: "لو الخصم > ٢٠٪ موافقة" }),
      ],
      NOW
    );
    const text = assembleContextText(ranked);
    expect(text).toContain("## الكيانات");
    expect(text).toContain("## قواعد العمل");
    expect(text).toContain("المبيعات");
  });

  it("قائمة فارغة ترجّع نصًّا فارغًا", () => {
    expect(assembleContextText([])).toBe("");
  });
});

// ============================================================
// impact-graph
// ============================================================

function edge(from: string, to: string, weight = 80, edgeType = "affects"): ImpactEdge {
  const [fromType, fromId] = from.split(":");
  const [toType, toId] = to.split(":");
  return { fromType, fromId, toType, toId, edgeType, weight };
}

describe("traverseImpact", () => {
  const edges = [
    edge("decision:d1", "requirement:r1", 90),
    edge("requirement:r1", "workflow:w1", 80),
    edge("workflow:w1", "entity:e1", 70),
  ];

  it("downstream يصل لكل المتأثّرين حتى العمق", () => {
    const hits = traverseImpact(edges, { type: "decision", id: "d1" }, { maxDepth: 3 });
    const ids = hits.map((h) => `${h.type}:${h.id}`);
    expect(ids).toEqual(["requirement:r1", "workflow:w1", "entity:e1"]);
  });

  it("العمق المحدود يقصّ الاجتياز", () => {
    const hits = traverseImpact(edges, { type: "decision", id: "d1" }, { maxDepth: 1 });
    expect(hits).toHaveLength(1);
    expect(hits[0].id).toBe("r1");
  });

  it("الوزن المتراكم يتضاءل مع البُعد", () => {
    const hits = traverseImpact(edges, { type: "decision", id: "d1" }, { maxDepth: 3 });
    const direct = hits.find((h) => h.id === "r1")!;
    const distant = hits.find((h) => h.id === "e1")!;
    expect(direct.cumulativeWeight).toBeGreaterThan(distant.cumulativeWeight);
  });

  it("upstream يمشي عكسيًا", () => {
    const hits = traverseImpact(edges, { type: "entity", id: "e1" }, { direction: "upstream", maxDepth: 3 });
    const ids = hits.map((h) => h.id);
    expect(ids).toContain("w1");
    expect(ids).toContain("d1");
  });

  it("لا يدور في الحلقات", () => {
    const cyclic = [edge("a:1", "b:1"), edge("b:1", "a:1")];
    const hits = traverseImpact(cyclic, { type: "a", id: "1" }, { maxDepth: 10 });
    // b يُزار مرة واحدة، وa عقدة البداية لا تُعاد.
    expect(hits).toHaveLength(1);
    expect(hits[0].id).toBe("1");
    expect(hits[0].type).toBe("b");
  });
});

describe("buildDependencyLayers", () => {
  it("الأساس (بلا اعتماد وارد) في الطبقة الأولى", () => {
    const nodes: GraphNodeRef[] = [
      { type: "req", id: "a" },
      { type: "req", id: "b" },
    ];
    // b depends_on a  ⇒  a أساس
    const layers = buildDependencyLayers(nodes, [edge("req:b", "req:a")]);
    expect(layers[0].map((n) => n.id)).toEqual(["a"]);
    expect(layers[1].map((n) => n.id)).toEqual(["b"]);
  });

  it("الدورة لا توقف التقسيم", () => {
    const nodes: GraphNodeRef[] = [
      { type: "x", id: "1" },
      { type: "x", id: "2" },
    ];
    const layers = buildDependencyLayers(nodes, [edge("x:1", "x:2"), edge("x:2", "x:1")]);
    // كلاهما في طبقة أخيرة واحدة بدل التعليق.
    const flat = layers.flat().map((n) => n.id).sort();
    expect(flat).toEqual(["1", "2"]);
  });

  it("قائمة فارغة ترجّع لا طبقات", () => {
    expect(buildDependencyLayers([], [])).toEqual([]);
  });
});
