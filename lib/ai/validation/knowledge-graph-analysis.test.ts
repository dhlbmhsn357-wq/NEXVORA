import { describe, expect, it } from "vitest";
import { validateKnowledgeGraphAnalysis } from "./knowledge-graph-analysis";

const validIds = new Set(["A", "B"]);

describe("validateKnowledgeGraphAnalysis", () => {
  it("يرفض رد فارغ", () => {
    expect(validateKnowledgeGraphAnalysis(null, validIds).ok).toBe(false);
  });

  it("يرفض JSON غير صالح", () => {
    expect(validateKnowledgeGraphAnalysis("{غير صالح", validIds).ok).toBe(false);
  });

  it("يقبل رد صحيح", () => {
    const raw = JSON.stringify({
      terminology_issues: [{ description: "مصطلح غير متسق", node_ids: ["A", "B"] }],
      semantic_duplicates: [],
      proposed_relations: [{ from_id: "A", to_id: "B", relation_type: "depends_on" }],
    });
    const result = validateKnowledgeGraphAnalysis(raw, validIds);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.terminologyIssues).toHaveLength(1);
      expect(result.data.proposedRelations).toHaveLength(1);
    }
  });

  it("يرفض علاقة مقترحة على ID مش موجود في القائمة المسموحة (منع Hallucination)", () => {
    const raw = JSON.stringify({ proposed_relations: [{ from_id: "A", to_id: "GHOST", relation_type: "depends_on" }] });
    const result = validateKnowledgeGraphAnalysis(raw, validIds);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.proposedRelations).toHaveLength(0);
  });

  it("يرفض علاقة عنصر بنفسه (from_id === to_id)", () => {
    const raw = JSON.stringify({ proposed_relations: [{ from_id: "A", to_id: "A", relation_type: "related_to" }] });
    const result = validateKnowledgeGraphAnalysis(raw, validIds);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.proposedRelations).toHaveLength(0);
  });

  it("relation_type غير معروف يترجم لـ related_to بدل ما يرفض العلاقة كلها", () => {
    const raw = JSON.stringify({ proposed_relations: [{ from_id: "A", to_id: "B", relation_type: "unknown_type" }] });
    const result = validateKnowledgeGraphAnalysis(raw, validIds);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.proposedRelations[0].relation_type).toBe("related_to");
  });

  it("مفاتيح غايبة ترجع مصفوفات فاضية بدل رفض الرد كله", () => {
    const result = validateKnowledgeGraphAnalysis("{}", validIds);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.terminologyIssues).toEqual([]);
      expect(result.data.proposedRelations).toEqual([]);
    }
  });
});
