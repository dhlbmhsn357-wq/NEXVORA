import { describe, expect, it } from "vitest";
import {
  MAX_ARCHIVE_ENTRIES,
  MAX_COMPRESSION_RATIO,
  MAX_FILE_BYTES,
  describeScan,
  detectType,
  extensionOf,
  scanArchive,
  scanFile,
  unsafePathReason,
} from "./security";

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]);
const EXE = new Uint8Array([0x4d, 0x5a, 0x90, 0x00]);
const ELF = new Uint8Array([0x7f, 0x45, 0x4c, 0x46]);
const ZIP = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

function file(patch: Partial<Parameters<typeof scanFile>[0]> = {}) {
  return scanFile({ fileName: "report.pdf", sizeBytes: 1024, head: PDF, ...patch });
}

describe("كشف النوع بالبصمة", () => {
  it("يمسك الأنواع المعروفة", () => {
    expect(detectType(PDF)?.type).toBe("pdf");
    expect(detectType(EXE)?.type).toBe("exe");
    expect(detectType(ELF)?.type).toBe("elf");
    expect(detectType(ZIP)?.type).toBe("zip");
    expect(detectType(PNG)?.type).toBe("png");
  });

  it("النوع غير المعروف يرجّع null لا يخمّن", () => {
    expect(detectType(new Uint8Array([0x01, 0x02, 0x03]))).toBeNull();
  });

  it("مايقعش على مصفوفة أقصر من البصمة", () => {
    expect(detectType(new Uint8Array([0x25]))).toBeNull();
    expect(detectType(new Uint8Array([]))).toBeNull();
  });
});

describe("فحص الملف", () => {
  it("ملف سليم يعدّي نظيفًا", () => {
    const result = file();
    expect(result.severity).toBe("clean");
    expect(result.allowed).toBe(true);
    expect(result.findings).toEqual([]);
  });

  // أهم فحص: الامتداد بيقوله المستخدم، والبصمة بيقولها الملف.
  it("ملف اسمه PDF ومحتواه تنفيذي يترفض", () => {
    const result = file({ fileName: "invoice.pdf", head: EXE });
    expect(result.allowed).toBe(false);
    expect(result.findings.map((f) => f.code)).toContain("executable_content");
  });

  it("الامتداد التنفيذي يترفض بالاسم حتى لو محتواه سليم", () => {
    const result = file({ fileName: "setup.exe", head: PDF });
    expect(result.allowed).toBe(false);
    expect(result.findings.map((f) => f.code)).toContain("blocked_extension");
  });

  it("تعارض غير تنفيذي يبقى تحذيرًا لا رفضًا", () => {
    // docx متوقَّع يكون zip، وطلع PDF — غريب لكن مش خطر.
    const result = file({ fileName: "doc.docx", head: PDF });
    expect(result.allowed).toBe(true);
    expect(result.severity).toBe("warning");
    expect(result.findings.map((f) => f.code)).toContain("extension_mismatch");
  });

  // `invoice.pdf.exe` بيبان في ويندوز باسم `invoice.pdf` لو الامتدادات مخفية.
  it("الامتداد المزدوج يتكشف", () => {
    const result = file({ fileName: "invoice.pdf.scr", head: PDF });
    expect(result.findings.map((f) => f.code)).toContain("double_extension");
    expect(result.allowed).toBe(false);
  });

  it("الملف الفاضي يترفض", () => {
    expect(file({ sizeBytes: 0 }).allowed).toBe(false);
  });

  it("الحجم فوق الحد يترفض", () => {
    const result = file({ sizeBytes: MAX_FILE_BYTES + 1 });
    expect(result.allowed).toBe(false);
    expect(result.findings.map((f) => f.code)).toContain("size_exceeded");
  });

  it("الحجم على الحد بالظبط يعدّي", () => {
    expect(file({ sizeBytes: MAX_FILE_BYTES }).allowed).toBe(true);
  });

  it("الوصف بيفرّق بين المرفوض والتحذير", () => {
    expect(describeScan(file())).toContain("اجتاز");
    expect(describeScan(file({ fileName: "x.exe" }))).toContain("مرفوض");
    expect(describeScan(file({ fileName: "doc.docx", head: PDF }))).toContain("تحذير");
  });
});

describe("سلامة المسار", () => {
  it("يرفض الخروج من المجلد", () => {
    expect(unsafePathReason("../../etc/passwd")).toBeTruthy();
    expect(unsafePathReason("docs/../../secret")).toBeTruthy();
    expect(unsafePathReason("a\\..\\..\\b")).toBeTruthy();
  });

  it("يرفض المسارات المطلقة", () => {
    expect(unsafePathReason("/etc/passwd")).toBeTruthy();
    expect(unsafePathReason("C:\\Windows\\System32")).toBeTruthy();
  });

  // التطبيع نفسه ممكن يخفي الهجوم، فالفحص على النصّ الخام.
  it("يرفض الترميز المزدوج", () => {
    expect(unsafePathReason("..%2f..%2fetc")).toBeTruthy();
    expect(unsafePathReason("%2e%2e/secret")).toBeTruthy();
  });

  it("يرفض البايت الصفري والمسار الفاضي", () => {
    expect(unsafePathReason("file\0.txt")).toBeTruthy();
    expect(unsafePathReason("")).toBeTruthy();
    expect(unsafePathReason("   ")).toBeTruthy();
  });

  it("يقبل المسارات النسبية السليمة", () => {
    expect(unsafePathReason("docs/report.pdf")).toBeNull();
    expect(unsafePathReason("a/b/c/file.txt")).toBeNull();
    // اسم فيه نقطتين متتاليتين وسط الكلمة مش خروجًا من المجلد
    expect(unsafePathReason("my..file.txt")).toBeNull();
  });
});

describe("فحص الأرشيف", () => {
  const entry = (path: string, uncompressed = 1000, compressed = 500) => ({
    path,
    uncompressedBytes: uncompressed,
    compressedBytes: compressed,
  });

  it("أرشيف سليم يعدّي بكل مدخلاته", () => {
    const result = scanArchive([entry("a.pdf"), entry("docs/b.txt")]);
    expect(result.allowed).toBe(true);
    expect(result.safeEntries).toHaveLength(2);
  });

  // ملف واحد خبيث لا يُسقط الأرشيف كله — نفس مبدأ «فشل ملف واحد لا
  // يوقف البقية» في المواصفة.
  it("يستبعد الخبيث ويكمّل الباقي", () => {
    const result = scanArchive([entry("good.pdf"), entry("../evil.txt"), entry("virus.exe")]);

    expect(result.allowed).toBe(true);
    expect(result.safeEntries).toEqual(["good.pdf"]);
    expect(result.rejectedEntries).toHaveLength(2);
  });

  it("قنبلة الضغط تُرفض بالكامل", () => {
    const bomb = entry("bomb.txt", 1_000_000_000, 1000);
    const result = scanArchive([bomb]);

    expect(result.allowed).toBe(false);
    expect(result.findings.map((f) => f.code)).toContain("compression_bomb");
    // الرفض الكلّي بيفضّي القائمة الآمنة — مافيش مدخل بيعدّي من أرشيف مرفوض.
    expect(result.safeEntries).toEqual([]);
  });

  it("النسبة تُحسب على الأرشيف كله لا على مدخل واحد", () => {
    // نصّ صغير بيتضغط بنسبة عالية وهو بريء؛ التجميع بيوازن.
    const result = scanArchive([
      entry("tiny.txt", 100_000, 100),
      entry("big.pdf", 50_000_000, 40_000_000),
    ]);
    expect(result.allowed).toBe(true);
  });

  it("العدد فوق الحد يُرفض", () => {
    const many = Array.from({ length: MAX_ARCHIVE_ENTRIES + 1 }, (_, i) => entry(`f${i}.txt`));
    const result = scanArchive(many);

    expect(result.allowed).toBe(false);
    expect(result.findings.map((f) => f.code)).toContain("too_many_entries");
  });

  it("أرشيف كل مدخلاته مرفوضة مايعدّيش", () => {
    const result = scanArchive([entry("a.exe"), entry("b.dll")]);
    expect(result.allowed).toBe(false);
  });

  it("أرشيف فاضي مايعدّيش", () => {
    expect(scanArchive([]).allowed).toBe(false);
  });

  it("النسبة على الحد بالظبط تعدّي", () => {
    const result = scanArchive([entry("x.txt", MAX_COMPRESSION_RATIO * 1000, 1000)]);
    expect(result.allowed).toBe(true);
  });
});

describe("استخراج الامتداد", () => {
  it("يشيل معاملات الرابط", () => {
    expect(extensionOf("file.pdf?v=2")).toBe("pdf");
    expect(extensionOf("file.PDF")).toBe("pdf");
  });

  it("مافيش امتداد يرجّع فاضي", () => {
    expect(extensionOf("README")).toBe("");
    expect(extensionOf("file.")).toBe("");
  });
});
