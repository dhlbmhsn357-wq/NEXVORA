import { describe, expect, it } from "vitest";
import { detectDuplicateKeys, detectCircularDependencies, detectOrphanRelations, buildDeterministicIssues } from "./consistency-checker";

describe("detectDuplicateKeys", () => {
  it("مفتاح واحد بس في نفس المحور → مفيش مشكلة", () => {
    const issues = detectDuplicateKeys([{ id: "1", category: "risks", item_key: "دعم الفروع", title: "x" }]);
    expect(issues).toHaveLength(0);
  });

  it("نفس المفتاح في محورين مختلفين → مشكلة duplicate_key", () => {
    const issues = detectDuplicateKeys([
      { id: "1", category: "risks", item_key: "دعم الفروع", title: "x" },
      { id: "2", category: "constraints", item_key: "دعم الفروع", title: "y" },
    ]);
    expect(issues).toHaveLength(1);
    expect(issues[0].type).toBe("duplicate_key");
    expect(issues[0].node_ids).toEqual(["1", "2"]);
  });

  it("نفس المفتاح في نفس المحور مرتين (يفترض مش وارد فعليًا بسبب unique index) → مش بيتحسب Duplicate", () => {
    const issues = detectDuplicateKeys([
      { id: "1", category: "risks", item_key: "x", title: "a" },
      { id: "2", category: "risks", item_key: "x", title: "b" },
    ]);
    expect(issues).toHaveLength(0);
  });
});

describe("detectCircularDependencies", () => {
  it("مفيش أي دورة → مفيش Issues", () => {
    const issues = detectCircularDependencies([
      { from_node_id: "A", to_node_id: "B", relation_type: "depends_on" },
      { from_node_id: "B", to_node_id: "C", relation_type: "depends_on" },
    ]);
    expect(issues).toHaveLength(0);
  });

  it("دورة مباشرة A→B→C→A بتتكشف", () => {
    const issues = detectCircularDependencies([
      { from_node_id: "A", to_node_id: "B", relation_type: "depends_on" },
      { from_node_id: "B", to_node_id: "C", relation_type: "depends_on" },
      { from_node_id: "C", to_node_id: "A", relation_type: "depends_on" },
    ]);
    expect(issues).toHaveLength(1);
    expect(issues[0].type).toBe("circular_dependency");
    expect(issues[0].node_ids.sort()).toEqual(["A", "B", "C"]);
  });

  it("علاقات relation_type غير depends_on متتجاهلش خالص", () => {
    const issues = detectCircularDependencies([
      { from_node_id: "A", to_node_id: "B", relation_type: "related_to" },
      { from_node_id: "B", to_node_id: "A", relation_type: "related_to" },
    ]);
    expect(issues).toHaveLength(0);
  });

  it("دورة ذاتية (A يعتمد على نفسه) بتتكشف", () => {
    const issues = detectCircularDependencies([{ from_node_id: "A", to_node_id: "A", relation_type: "depends_on" }]);
    expect(issues).toHaveLength(1);
  });
});

describe("detectOrphanRelations", () => {
  it("علاقة بين عنصرين نشطين → مفيش Issue", () => {
    const issues = detectOrphanRelations([{ id: "r1", from_node_id: "A", to_node_id: "B" }], new Set(["A", "B"]));
    expect(issues).toHaveLength(0);
  });

  it("علاقة بتشاور على عنصر مش نشط → orphan_relation", () => {
    const issues = detectOrphanRelations([{ id: "r1", from_node_id: "A", to_node_id: "B" }], new Set(["A"]));
    expect(issues).toHaveLength(1);
    expect(issues[0].type).toBe("orphan_relation");
  });
});

describe("buildDeterministicIssues", () => {
  it("بيجمع كل الفحوصات الثلاثة في مصفوفة واحدة", () => {
    const nodes = [
      { id: "1", category: "risks", item_key: "x", title: "a" },
      { id: "2", category: "constraints", item_key: "x", title: "b" },
    ];
    const relations = [{ id: "r1", from_node_id: "1", to_node_id: "999", relation_type: "depends_on" as const }];
    const issues = buildDeterministicIssues(nodes, relations);
    expect(issues.some((i) => i.type === "duplicate_key")).toBe(true);
    expect(issues.some((i) => i.type === "orphan_relation")).toBe(true);
  });
});
