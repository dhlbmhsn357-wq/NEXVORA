import { describe, expect, it } from "vitest";
import { packageToCsv, packageToMarkdown } from "./serialize";
import { buildPackage, type KnowledgePackage } from "./package-model";

function pkg(): KnowledgePackage {
  return buildPackage({
    projectId: "p",
    projectName: "مشروع تجريبي",
    generatedAt: "2026-07-28T00:00:00Z",
    piiMasked: false,
    objects: [
      { type: "item", sourceId: "i1", data: { title: "سياسة الخصم", content: "خصم ٢٠٪ للعملاء الدائمين", confidence: 90 } },
      { type: "entity", sourceId: "e1", data: { name: "المبيعات", entityType: "department" } },
    ],
    relations: [
      { fromType: "entity", fromSourceId: "e1", toType: "item", toSourceId: "i1", relationType: "يحكم" },
    ],
  });
}

describe("packageToCsv", () => {
  it("يبدأ بترويسة الأعمدة", () => {
    const csv = packageToCsv(pkg());
    expect(csv.split("\r\n")[0]).toBe("type,source_id,title,body,extra");
  });

  it("يحتوي صفًّا لكل كائن", () => {
    const csv = packageToCsv(pkg());
    const rows = csv.split("\r\n");
    expect(rows).toHaveLength(3); // ترويسة + كائنان
    expect(rows[1]).toContain("item");
    expect(rows[1]).toContain("سياسة الخصم");
  });

  it("يهرّب فاصل CSV والأسطر الجديدة بالاقتباس", () => {
    const p = buildPackage({
      projectId: "p", projectName: "x", generatedAt: "t", piiMasked: false,
      objects: [{ type: "item", sourceId: "i1", data: { title: "a,b", content: "line1\nline2" } }],
      relations: [],
    });
    const csv = packageToCsv(p);
    expect(csv).toContain('"a,b"');
    expect(csv).toContain('"line1\nline2"');
  });

  it("يضع الحقول الإضافية كـ JSON في عمود extra", () => {
    const csv = packageToCsv(pkg());
    // الكيان له entityType — يظهر في extra.
    expect(csv).toContain("entityType");
  });
});

describe("packageToMarkdown", () => {
  it("يبدأ بعنوان المشروع", () => {
    const md = packageToMarkdown(pkg());
    expect(md).toContain("# معرفة المشروع: مشروع تجريبي");
  });

  it("يجمّع بالنوع بعناوين عربية", () => {
    const md = packageToMarkdown(pkg());
    expect(md).toContain("## عناصر المعرفة");
    expect(md).toContain("## الكيانات");
  });

  it("يعرض المحتوى تحت عنوان الكائن", () => {
    const md = packageToMarkdown(pkg());
    expect(md).toContain("### سياسة الخصم");
    expect(md).toContain("خصم ٢٠٪ للعملاء الدائمين");
  });

  it("يسرد العلاقات", () => {
    const md = packageToMarkdown(pkg());
    expect(md).toContain("## العلاقات");
    expect(md).toContain("يحكم");
  });

  it("يذكر إخفاء PII عند التفعيل", () => {
    const masked = buildPackage({
      projectId: "p", projectName: "x", generatedAt: "t", piiMasked: true,
      objects: [{ type: "item", sourceId: "i1", data: { title: "أ" } }], relations: [],
    });
    expect(packageToMarkdown(masked)).toContain("مُخفاة");
  });
});
