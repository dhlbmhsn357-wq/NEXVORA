import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import {
  parseSpreadsheetFile,
  previewImportRows,
  validateImportFile,
  MAX_IMPORT_FILE_SIZE_BYTES,
  type ProspectColumnMapping,
} from "./import-service";

function buildXlsxBuffer(headers: string[], rows: (string | number)[][]): ArrayBuffer {
  const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Sheet1");
  const out = XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return out;
}

describe("validateImportFile", () => {
  it("يقبل .xlsx و.csv ضمن الحد المسموح", () => {
    expect(validateImportFile("data.xlsx", 1000).ok).toBe(true);
    expect(validateImportFile("data.csv", 1000).ok).toBe(true);
  });

  it("يرفض امتداد غير مدعوم", () => {
    const r = validateImportFile("data.pdf", 1000);
    expect(r.ok).toBe(false);
  });

  it("يرفض ملفًا أكبر من الحد المسموح", () => {
    const r = validateImportFile("data.xlsx", MAX_IMPORT_FILE_SIZE_BYTES + 1);
    expect(r.ok).toBe(false);
  });
});

describe("parseSpreadsheetFile", () => {
  it("يستخرج headers وrows من ملف xlsx", () => {
    const buffer = buildXlsxBuffer(
      ["الاسم", "الهاتف", "البريد"],
      [
        ["مدرسة النور", "01012345678", "info@nour.com"],
        ["مطعم الأصالة", "01111111111", ""],
      ]
    );
    const { headers, rows } = parseSpreadsheetFile(buffer, "xlsx");
    expect(headers).toEqual(["الاسم", "الهاتف", "البريد"]);
    expect(rows).toHaveLength(2);
    expect(rows[0]["الاسم"]).toBe("مدرسة النور");
    expect(rows[0]["الهاتف"]).toBe("01012345678");
  });

  it("ملف فارغ بدون صفوف → headers/rows فارغة بلا استثناء", () => {
    const buffer = buildXlsxBuffer([], []);
    const { headers, rows } = parseSpreadsheetFile(buffer, "xlsx");
    expect(headers).toEqual([]);
    expect(rows).toEqual([]);
  });
});

describe("previewImportRows", () => {
  const mapping: ProspectColumnMapping = {
    organization_name: "الاسم",
    primary_phone_raw: "الهاتف",
    email: "البريد",
    governorate: "المحافظة",
    sector: "القطاع",
  };

  it("صف صالح كامل → valid", () => {
    const rows = [{ الاسم: "مدرسة النور", الهاتف: "01012345678", البريد: "info@nour.com", المحافظة: "القاهرة", القطاع: "تعليم" }];
    const preview = previewImportRows(rows, mapping);
    expect(preview.valid).toHaveLength(1);
    expect(preview.missingName).toHaveLength(0);
  });

  it("صف بلا اسم → missingName", () => {
    const rows = [{ الاسم: "", الهاتف: "01012345678", البريد: "", المحافظة: "", القطاع: "" }];
    const preview = previewImportRows(rows, mapping);
    expect(preview.missingName).toHaveLength(1);
  });

  it("صف بلا هاتف ولا بريد → missingContact", () => {
    const rows = [{ الاسم: "جهة", الهاتف: "", البريد: "", المحافظة: "القاهرة", القطاع: "تعليم" }];
    const preview = previewImportRows(rows, mapping);
    expect(preview.missingContact).toHaveLength(1);
  });

  it("هاتف غير صالح → invalidPhone", () => {
    const rows = [{ الاسم: "جهة", الهاتف: "0223456789", البريد: "", المحافظة: "القاهرة", القطاع: "تعليم" }];
    const preview = previewImportRows(rows, mapping);
    expect(preview.invalidPhone).toHaveLength(1);
  });

  it("لا قطاع ولا محافظة (لكن بيانات أخرى صالحة) → needsReview", () => {
    const rows = [{ الاسم: "جهة", الهاتف: "01012345678", البريد: "", المحافظة: "", القطاع: "" }];
    const preview = previewImportRows(rows, mapping);
    expect(preview.needsReview).toHaveLength(1);
  });

  it("صفان بنفس الهاتف داخل نفس الملف → الثاني duplicatePotential", () => {
    const rows = [
      { الاسم: "جهة أ", الهاتف: "01012345678", البريد: "", المحافظة: "القاهرة", القطاع: "تعليم" },
      { الاسم: "جهة ب مختلفة", الهاتف: "01012345678", البريد: "", المحافظة: "القاهرة", القطاع: "تعليم" },
    ];
    const preview = previewImportRows(rows, mapping);
    expect(preview.valid).toHaveLength(1);
    expect(preview.duplicatePotential).toHaveLength(1);
    expect(preview.duplicatePotential[0].rowIndex).toBe(1);
  });

  it("totalRows يطابق عدد الصفوف المُدخلة", () => {
    const rows = [
      { الاسم: "جهة أ", الهاتف: "01012345678" },
      { الاسم: "", الهاتف: "" },
    ];
    const preview = previewImportRows(rows, mapping);
    expect(preview.totalRows).toBe(2);
  });
});
