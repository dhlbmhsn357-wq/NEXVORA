import { describe, expect, it } from "vitest";
import { isParseableJson } from "./service";

describe("isParseableJson (شبكة أمان الـ JSON)", () => {
  it("يقبل JSON صالحًا (كائن ومصفوفة)", () => {
    expect(isParseableJson('{"a":1}')).toBe(true);
    expect(isParseableJson("  [1,2,3]  ")).toBe(true);
  });

  it("يرفض الفارغ/null/الكلام العادي/الـ fences", () => {
    expect(isParseableJson(null)).toBe(false);
    expect(isParseableJson("")).toBe(false);
    expect(isParseableJson("   ")).toBe(false);
    expect(isParseableJson("هنا النتيجة")).toBe(false);
    expect(isParseableJson('```json\n{"a":1}\n```')).toBe(false);
    expect(isParseableJson('{"a":1')).toBe(false); // JSON مقصوص
  });
});
