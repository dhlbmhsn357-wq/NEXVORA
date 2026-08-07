import { describe, expect, it } from "vitest";
import {
  groupBySource, countBySource,
  summarizeCoverage, deriveEvidenceHealth,
} from "./derive";
import type { EvidenceLinkRow, EvidenceSourceType, EvidenceKind } from "./types";

const NOW = "2026-08-07T10:00:00.000Z";

function link(over: Partial<EvidenceLinkRow>): EvidenceLinkRow {
  return {
    id: "l", projectId: "prj",
    sourceType: "user_story", sourceId: "s1",
    evidenceType: "problem_validation", evidenceId: "e1",
    note: "", createdAt: NOW, createdBy: null,
    ...over,
  };
}

describe("groupBySource", () => {
  it("يجمع حسب source_id فقط", () => {
    const g = groupBySource([
      link({ sourceId: "s1" }),
      link({ sourceId: "s1" }),
      link({ sourceId: "s2" }),
    ]);
    expect(g.get("s1")?.length).toBe(2);
    expect(g.get("s2")?.length).toBe(1);
  });
  it("يفلتر بـ sourceType لو تم تمريره", () => {
    const g = groupBySource([
      link({ sourceId: "s1", sourceType: "user_story" }),
      link({ sourceId: "s1", sourceType: "requirement" }),
    ], "user_story");
    expect(g.get("s1")?.length).toBe(1);
  });
});

describe("countBySource", () => {
  it("عدّاد سريع بلا حفظ الروابط", () => {
    const c = countBySource([
      link({ sourceId: "a" }), link({ sourceId: "a" }),
      link({ sourceId: "b" }),
    ]);
    expect(c.get("a")).toBe(2);
    expect(c.get("b")).toBe(1);
    expect(c.get("c")).toBeUndefined();
  });
});

describe("summarizeCoverage", () => {
  it("فاضي = صفر", () => {
    const s = summarizeCoverage([], []);
    expect(s.coveragePercent).toBe(0);
    expect(s.avgLinksPerCovered).toBe(0);
  });
  it("3 عناصر، اتنين عليهم أدلة → 67%", () => {
    const s = summarizeCoverage(
      ["s1", "s2", "s3"],
      [link({ sourceId: "s1" }), link({ sourceId: "s1" }), link({ sourceId: "s2" })],
    );
    expect(s.totalSources).toBe(3);
    expect(s.covered).toBe(2);
    expect(s.uncovered).toBe(1);
    expect(s.coveragePercent).toBe(67);
    expect(s.avgLinksPerCovered).toBe(1.5); // 3/2
  });
  it("عناصر مش من الـ sourceIds المُمرَّرة لا تُحسب", () => {
    const s = summarizeCoverage(
      ["s1"],
      [link({ sourceId: "s1" }), link({ sourceId: "outsider" })],
    );
    // filtered = 2 links total, لكن covered يعتمد على sourceIds اللي المفروض نغطّيها
    expect(s.totalSources).toBe(1);
    expect(s.covered).toBe(1);
    expect(s.coveragePercent).toBe(100);
  });
  it("فلتر sourceType يشتغل مع summarize", () => {
    const s = summarizeCoverage(
      ["s1", "s2"],
      [
        link({ sourceId: "s1", sourceType: "user_story" }),
        link({ sourceId: "s2", sourceType: "requirement" }),
      ],
      "user_story",
    );
    expect(s.covered).toBe(1);   // s2 مربوطة كـ requirement فما تُحسب
    expect(s.coveragePercent).toBe(50);
  });
});

describe("deriveEvidenceHealth", () => {
  it("فاضي = poor بلا روابط", () => {
    const h = deriveEvidenceHealth([]);
    expect(h.totalLinks).toBe(0);
    expect(h.noteRatio).toBe(0);
    expect(h.quality).toBe("poor");
  });
  it("كل الروابط عليها note → healthy", () => {
    const h = deriveEvidenceHealth([
      link({ note: "دليل من مقابلة X" }),
      link({ note: "دليل من استبيان Y" }),
    ]);
    expect(h.noteRatio).toBe(100);
    expect(h.quality).toBe("healthy");
  });
  it("40..70 = acceptable", () => {
    const h = deriveEvidenceHealth([
      link({ note: "ok" }), link({ note: "ok" }),
      link({ note: "" }), link({ note: "" }), link({ note: "" }),
    ]);
    expect(h.noteRatio).toBe(40);
    expect(h.quality).toBe("acceptable");
  });
  it("note فيه مسافات فقط لا يُحسب", () => {
    const h = deriveEvidenceHealth([
      link({ note: "   " }),
      link({ note: "شرح فعلي" }),
    ]);
    expect(h.noteRatio).toBe(50);
    expect(h.quality).toBe("acceptable");
  });
});

// نضمن ثوابت الأنواع محفوظة (regressions)
describe("type constants sanity", () => {
  it("EvidenceSourceType يقبل القيم الثلاثة", () => {
    const values: EvidenceSourceType[] = ["requirement", "user_story", "acceptance_criterion"];
    expect(values.length).toBe(3);
  });
  it("EvidenceKind يقبل القيمتين", () => {
    const values: EvidenceKind[] = ["market_research", "problem_validation"];
    expect(values.length).toBe(2);
  });
});
