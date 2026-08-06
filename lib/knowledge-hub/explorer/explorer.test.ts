import { describe, expect, it } from "vitest";
import { applyExplorer, facets, filterItems, sortItems, type ExplorerItem } from "./filters";

function item(p: Partial<ExplorerItem> & { id: string }): ExplorerItem {
  return {
    title: "عنصر", content: "محتوى", category: "business", status: "active",
    confidence: 70, tags: [], createdAt: "2026-01-01T00:00:00Z", ...p,
  };
}

const items: ExplorerItem[] = [
  item({ id: "a", title: "سياسة الخصم", category: "sales", confidence: 90, tags: ["source:pdf"], createdAt: "2026-03-01T00:00:00Z" }),
  item({ id: "b", title: "دورة الموافقة", category: "workflow", confidence: 50, tags: ["source:meeting"], createdAt: "2026-02-01T00:00:00Z" }),
  item({ id: "c", title: "قاعدة المخزون", category: "sales", confidence: 30, status: "archived", createdAt: "2026-01-15T00:00:00Z" }),
];

describe("filterItems", () => {
  it("يبحث في العنوان بتطبيع عربي", () => {
    expect(filterItems(items, { search: "الخصم" }).map((i) => i.id)).toEqual(["a"]);
  });
  it("يفلتر بالتصنيف", () => {
    expect(filterItems(items, { category: "sales" }).map((i) => i.id).sort()).toEqual(["a", "c"]);
  });
  it("يفلتر بالحالة", () => {
    expect(filterItems(items, { status: "archived" }).map((i) => i.id)).toEqual(["c"]);
  });
  it("يفلتر بأقل ثقة", () => {
    expect(filterItems(items, { minConfidence: 60 }).map((i) => i.id)).toEqual(["a"]);
  });
  it("يفلتر بالوسم", () => {
    expect(filterItems(items, { tag: "source:meeting" }).map((i) => i.id)).toEqual(["b"]);
  });
  it("يجمع الفلاتر (AND)", () => {
    expect(filterItems(items, { category: "sales", minConfidence: 60 }).map((i) => i.id)).toEqual(["a"]);
  });
});

describe("sortItems", () => {
  it("الأحدث أولًا افتراضيًا", () => {
    expect(sortItems(items, "recent")[0].id).toBe("a");
  });
  it("الأعلى ثقة", () => {
    expect(sortItems(items, "confidence")[0].id).toBe("a");
  });
});

describe("facets", () => {
  it("يستخرج التصنيفات والوسوم والحالات المتاحة", () => {
    const f = facets(items);
    expect(f.categories).toContain("sales");
    expect(f.tags).toContain("source:pdf");
    expect(f.statuses).toContain("archived");
  });
});

describe("applyExplorer", () => {
  it("يفلتر ثم يرتّب", () => {
    const result = applyExplorer(items, { category: "sales" }, "confidence");
    expect(result.map((i) => i.id)).toEqual(["a", "c"]);
  });
});
