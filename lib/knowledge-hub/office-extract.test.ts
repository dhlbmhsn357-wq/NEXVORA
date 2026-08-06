import { describe, it, expect } from "vitest";
import { decodeXml, parseSharedStrings, sheetToText, stripDocxXml } from "./office-extract";

describe("office-extract · decodeXml", () => {
  it("decodes named and numeric entities", () => {
    expect(decodeXml("a &amp; b")).toBe("a & b");
    expect(decodeXml("&lt;tag&gt;")).toBe("<tag>");
    expect(decodeXml("quote&#39;s")).toBe("quote's");
    expect(decodeXml("&#x41;")).toBe("A");
  });
});

describe("office-extract · xlsx", () => {
  it("parses shared strings including rich-text runs", () => {
    const xml = `<sst><si><t>Toyota</t></si><si><r><t>Land </t></r><r><t>Cruiser</t></r></si><si><t>سعر</t></si></sst>`;
    expect(parseSharedStrings(xml)).toEqual(["Toyota", "Land Cruiser", "سعر"]);
  });

  it("resolves shared-string cells, inline strings and literals into rows", () => {
    const shared = ["Model", "Toyota"];
    const sheet = `
      <worksheet><sheetData>
        <row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="inlineStr"><is><t>Year</t></is></c></row>
        <row r="2"><c r="A2" t="s"><v>1</v></c><c r="B2"><v>2024</v></c></row>
      </sheetData></worksheet>`;
    expect(sheetToText(sheet, shared)).toBe("Model\tYear\nToyota\t2024");
  });

  it("skips fully empty rows", () => {
    const sheet = `<sheetData><row><c/><c/></row><row><c t="s"><v>0</v></c></row></sheetData>`;
    expect(sheetToText(sheet, ["X"])).toBe("X");
  });

  it("handles a missing shared-string index safely", () => {
    const sheet = `<sheetData><row><c t="s"><v>9</v></c></row></sheetData>`;
    expect(sheetToText(sheet, ["only"])).toBe("");
  });
});

describe("office-extract · docx fallback", () => {
  it("keeps paragraph and tab boundaries, strips tags, decodes entities", () => {
    const xml = `<w:document><w:body>
      <w:p><w:r><w:t>تقرير</w:t></w:r><w:tab/><w:r><w:t>الصيانة</w:t></w:r></w:p>
      <w:p><w:r><w:t>البند 1 &amp; 2</w:t></w:r></w:p>
    </w:body></w:document>`;
    expect(stripDocxXml(xml)).toBe("تقرير\tالصيانة\nالبند 1 & 2");
  });

  it("returns empty string for a doc with no text nodes", () => {
    expect(stripDocxXml("<w:document><w:body></w:body></w:document>")).toBe("");
  });
});
