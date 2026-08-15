import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import {
  parseSpreadsheetFile,
  listSpreadsheetSheets,
  detectHeaderRowIndex,
  guessColumnMapping,
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

/** يبني buffer فيه صفوف عنوان/ملاحظة تمهيدية (خلية واحدة بنص طويل) قبل جدول حقيقي — يحاكي ملفات أبحاث السوق الواقعية. */
function buildXlsxBufferWithPreamble(
  preambleRows: string[],
  headers: string[],
  rows: (string | number | null)[][]
): ArrayBuffer {
  const matrix: unknown[][] = [...preambleRows.map((p) => [p]), headers, ...rows];
  const sheet = XLSX.utils.aoa_to_sheet(matrix);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Sheet1");
  return XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

function buildMultiSheetXlsxBuffer(sheets: { name: string; matrix: unknown[][] }[]): ArrayBuffer {
  const workbook = XLSX.utils.book_new();
  for (const s of sheets) {
    const sheet = XLSX.utils.aoa_to_sheet(s.matrix);
    XLSX.utils.book_append_sheet(workbook, sheet, s.name);
  }
  return XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
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

describe("detectHeaderRowIndex", () => {
  it("صف العناوين في المكان الطبيعي (index 0) لملف بسيط", () => {
    const matrix = [
      ["الاسم", "الهاتف", "البريد"],
      ["مدرسة النور", "01012345678", "info@nour.com"],
      ["مطعم الأصالة", "01111111111", ""],
    ];
    expect(detectHeaderRowIndex(matrix)).toBe(0);
  });

  it("يتخطّى صفوف عنوان/ملاحظة نصّية طويلة قبل صف العناوين الحقيقي (زي ملفات أبحاث السوق الواقعية)", () => {
    // يحاكي بالظبط شكل شيت "قاعدة السناتر" الحقيقي: عنوان + ملاحظتان + عناوين + بيانات.
    const matrix: unknown[][] = [
      ["NEXVORA | قاعدة بحثية: 50 سنترًا تعليميًا بارزًا في مصر"],
      ["القائمة ليست ترتيبًا رسميًا بالإيرادات؛ هي قائمة فرص مرتفعة الإشارة..."],
      ["آخر تحقق: 2026-08-15 | راجع رقم الهاتف واسم صاحب القرار قبل أي تواصل رسمي."],
      ["الترتيب البحثي", "اسم السنتر", "المحافظة", "المدينة/المنطقة", "الهاتف الأساسي"],
      [1, "سنتر المحور التعليمي", "الجيزة", "6 أكتوبر", "01062227298"],
      [2, "سنتر ألفا التعليمي", "الجيزة", "الهرم", "01026113401"],
    ];
    expect(detectHeaderRowIndex(matrix)).toBe(3);
  });

  it("يتخطّى صف عنوان وملاحظة واحدة (شيت أفضل 15 فرصة الحقيقي)", () => {
    const matrix: unknown[][] = [
      ["أفضل 15 فرصة للتواصل الأول"],
      ["ابدأ بهذه الجهات لأنها تجمع بين الحجم الظاهر والتعقيد التشغيلي."],
      ["#", "السنتر", "المحافظة", "الهاتف", "الدرجة", "الأولوية"],
      [1, "سنتر المحور التعليمي", "الجيزة", "01062227298", 100, "A"],
    ];
    expect(detectHeaderRowIndex(matrix)).toBe(2);
  });

  it("ملف فيه صف عنوان واحد بس بدون بيانات بعده → fallback للصف الأول", () => {
    expect(detectHeaderRowIndex([["عنوان وحيد بلا بيانات بعده"]])).toBe(0);
  });

  it("مصفوفة فارغة → 0 بدون استثناء", () => {
    expect(detectHeaderRowIndex([])).toBe(0);
  });
});

describe("parseSpreadsheetFile — ملفات فيها صفوف تمهيدية", () => {
  it("يقرا الجدول بدايةً من صف العناوين الحقيقي مش الصف الأول", () => {
    const buffer = buildXlsxBufferWithPreamble(
      ["NEXVORA | خريطة سوق السناتر", "قائمة بحثية قابلة للبيع"],
      ["اسم السنتر", "المحافظة", "الهاتف الأساسي"],
      [["سنتر المحور التعليمي", "الجيزة", "01062227298"]]
    );
    const { headers, rows, headerRowIndex } = parseSpreadsheetFile(buffer, "xlsx");
    expect(headerRowIndex).toBe(2);
    expect(headers).toEqual(["اسم السنتر", "المحافظة", "الهاتف الأساسي"]);
    expect(rows).toHaveLength(1);
    expect(rows[0]["اسم السنتر"]).toBe("سنتر المحور التعليمي");
  });

  it("ملف بسيط بدون صفوف تمهيدية → headerRowIndex = 0 (سلوك متوافق مع القديم)", () => {
    const buffer = buildXlsxBuffer(["الاسم", "الهاتف"], [["مدرسة النور", "01012345678"]]);
    const { headerRowIndex } = parseSpreadsheetFile(buffer, "xlsx");
    expect(headerRowIndex).toBe(0);
  });
});

describe("listSpreadsheetSheets + اختيار الشيت الافتراضي عبر sheetName", () => {
  it("يسرد كل الشيتات، وrowCount بيتحسب بعد تخطّي صفوف العناوين التمهيدية", () => {
    const buffer = buildMultiSheetXlsxBuffer([
      {
        name: "ملخص تنفيذي",
        matrix: [
          ["NEXVORA | خريطة سوق السناتر"],
          ["قائمة بحثية"],
          ["إجمالي الجهات", "50"],
        ],
      },
      {
        name: "قاعدة السناتر",
        matrix: [
          ["NEXVORA | قاعدة بحثية"],
          ["ملاحظة تمهيدية"],
          ["اسم السنتر", "المحافظة", "الهاتف"],
          ["سنتر 1", "الجيزة", "01062227298"],
          ["سنتر 2", "القاهرة", "01026113401"],
        ],
      },
    ]);
    const sheets = listSpreadsheetSheets(buffer);
    expect(sheets.map((s) => s.name)).toEqual(["ملخص تنفيذي", "قاعدة السناتر"]);
    const dataSheet = sheets.find((s) => s.name === "قاعدة السناتر")!;
    expect(dataSheet.rowCount).toBe(2); // صفّين بيانات بعد تخطّي 2 صف تمهيدي + صف العناوين
  });

  it("parseSpreadsheetFile بدون sheetName يختار تلقائيًا الشيت اللي فيه أكبر عدد صفوف بيانات", () => {
    const buffer = buildMultiSheetXlsxBuffer([
      { name: "ملخص", matrix: [["عنوان"], ["نص طويل واحد"]] },
      {
        name: "بيانات",
        matrix: [
          ["اسم", "هاتف"],
          ["جهة 1", "01012345678"],
          ["جهة 2", "01011111111"],
          ["جهة 3", "01022222222"],
        ],
      },
    ]);
    const { sheetName, rows } = parseSpreadsheetFile(buffer, "xlsx");
    expect(sheetName).toBe("بيانات");
    expect(rows).toHaveLength(3);
  });

  it("تحديد sheetName صراحةً بيفضّله على الاختيار التلقائي", () => {
    const buffer = buildMultiSheetXlsxBuffer([
      {
        name: "الشيت الكبير",
        matrix: [["اسم", "هاتف"], ["أ", "01012345678"], ["ب", "01011111111"], ["ج", "01022222222"]],
      },
      { name: "الشيت الصغير", matrix: [["اسم", "هاتف"], ["د", "01033333333"]] },
    ]);
    const { sheetName, rows } = parseSpreadsheetFile(buffer, "xlsx", "الشيت الصغير");
    expect(sheetName).toBe("الشيت الصغير");
    expect(rows).toHaveLength(1);
  });
});

describe("guessColumnMapping — تعرّف ذكي بمرادفات عربية/إنجليزية", () => {
  it("يطابق عناوين الأعمدة الحقيقية من ملف خريطة سوق السناتر", () => {
    const headers = [
      "الترتيب البحثي",
      "اسم السنتر",
      "المحافظة",
      "المدينة/المنطقة",
      "الفروع المؤكدة (حد أدنى)",
      "المراحل/النطاق",
      "الهاتف الأساسي",
      "هواتف أخرى",
      "البريد",
      "الموقع/الصفحة",
      "دليل الحجم الظاهر",
      "مؤشر النشاط الحالي",
      "فرضية المشكلة",
      "العرض المقترح",
    ];
    const mapping = guessColumnMapping(headers);
    expect(mapping.organization_name).toBe("اسم السنتر");
    expect(mapping.governorate).toBe("المحافظة");
    expect(mapping.city_or_area).toBe("المدينة/المنطقة");
    expect(mapping.branches_count).toBe("الفروع المؤكدة (حد أدنى)");
    expect(mapping.scope_notes).toBe("المراحل/النطاق");
    expect(mapping.primary_phone_raw).toBe("الهاتف الأساسي");
    expect(mapping.secondary_phones).toBe("هواتف أخرى");
    expect(mapping.email).toBe("البريد");
    expect(mapping.website_url).toBe("الموقع/الصفحة");
    expect(mapping.visible_size_evidence).toBe("دليل الحجم الظاهر");
    expect(mapping.activity_signal).toBe("مؤشر النشاط الحالي");
    expect(mapping.pain_hypothesis).toBe("فرضية المشكلة");
    expect(mapping.suggested_offer).toBe("العرض المقترح");
  });

  it("«هواتف أخرى» تتربط بـ secondary_phones مش primary_phone_raw رغم احتوائها على كلمة هاتف", () => {
    const mapping = guessColumnMapping(["الهاتف الأساسي", "هواتف أخرى"]);
    expect(mapping.primary_phone_raw).toBe("الهاتف الأساسي");
    expect(mapping.secondary_phones).toBe("هواتف أخرى");
  });

  it("يطابق عناوين شيت «أفضل 15 فرصة»", () => {
    const mapping = guessColumnMapping(["#", "السنتر", "المحافظة", "الهاتف", "الدرجة", "الأولوية"]);
    expect(mapping.organization_name).toBe("السنتر");
    expect(mapping.research_score).toBe("الدرجة");
    expect(mapping.priority).toBe("الأولوية");
  });

  it("عمود بدون أي تطابق (زي رقم تسلسلي) يُترك بدون ربط", () => {
    const mapping = guessColumnMapping(["#", "اسم السنتر"]);
    expect(mapping.organization_name).toBe("اسم السنتر");
    expect(Object.values(mapping)).not.toContain("#");
  });

  it("عمودين يطابقان نفس الحقل → أول عمود يفوز، الباقي بلا ربط", () => {
    const mapping = guessColumnMapping(["اسم السنتر", "اسم الشركة"]);
    expect(mapping.organization_name).toBe("اسم السنتر");
  });
});
