import { describe, expect, it } from "vitest";
import { zipSync, strToU8 } from "fflate";
import { extractZip, isSupportedArchive } from "./archive";

function makeZip(files: Record<string, string | Uint8Array>): Uint8Array {
  const input: Record<string, Uint8Array> = {};
  for (const [path, content] of Object.entries(files)) {
    input[path] = typeof content === "string" ? strToU8(content) : content;
  }
  return zipSync(input);
}

const ZIP_HEAD = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);

describe("التعرّف على الأرشيف", () => {
  it("يقبل ZIP", () => {
    expect(isSupportedArchive("docs.zip", ZIP_HEAD)).toBe(true);
  });

  // مستندات Office أرشيفات ZIP في الحقيقة، وفكّها بيدّي XML خام لا نصًّا.
  it("يرفض مستندات Office رغم إنها ZIP", () => {
    expect(isSupportedArchive("report.docx", ZIP_HEAD)).toBe(false);
    expect(isSupportedArchive("sheet.xlsx", ZIP_HEAD)).toBe(false);
  });

  it("يرفض اللي مش بصمته ZIP", () => {
    expect(isSupportedArchive("fake.zip", new Uint8Array([0x25, 0x50]))).toBe(false);
  });
});

describe("فكّ الأرشيف", () => {
  it("يفكّ الملفات السليمة", async () => {
    const zip = makeZip({
      "notes.txt": "محتوى الملاحظات",
      "docs/report.txt": "محتوى التقرير",
    });

    const result = await extractZip(zip);

    expect(result.ok).toBe(true);
    expect(result.entries).toHaveLength(2);
    expect(result.entries.map((e) => e.fileName).sort()).toEqual(["notes.txt", "report.txt"]);
  });

  it("المسار الكامل بيتحفظ جنب الاسم", async () => {
    const result = await extractZip(makeZip({ "a/b/c.txt": "x" }));
    expect(result.entries[0].path).toBe("a/b/c.txt");
    expect(result.entries[0].fileName).toBe("c.txt");
  });

  // ملف واحد خبيث لا يوقف الباقي — طلب صريح في المواصفة.
  it("يستبعد التنفيذي ويكمّل الباقي", async () => {
    const zip = makeZip({
      "good.txt": "محتوى سليم",
      "virus.exe": "MZ محتوى",
    });

    const result = await extractZip(zip);

    expect(result.ok).toBe(true);
    expect(result.entries.map((e) => e.fileName)).toEqual(["good.txt"]);
    expect(result.rejected).toHaveLength(1);
  });

  // البصمة بتكشف اللي الاسم بيخفيه.
  it("يمسك التنفيذي المتنكّر في امتداد سليم", async () => {
    const exeBytes = new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00]);
    const zip = makeZip({ "invoice.pdf": exeBytes, "real.txt": "نصّ" });

    const result = await extractZip(zip);

    expect(result.entries.map((e) => e.fileName)).toEqual(["real.txt"]);
    expect(result.rejected.some((r) => r.path === "invoice.pdf")).toBe(true);
  });

  it("المجلدات تُتجاهَل بلا ضجيج", async () => {
    const zip = makeZip({ "folder/": "", "folder/file.txt": "محتوى" });
    const result = await extractZip(zip);

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].fileName).toBe("file.txt");
  });

  it("الأرشيف الفاضي يترفض برسالة واضحة", async () => {
    const result = await extractZip(makeZip({}));
    expect(result.ok).toBe(false);
    expect(result.message).toContain("مافيهوش ملفات");
  });

  it("الملف التالف يترفض بلا انهيار", async () => {
    const result = await extractZip(new Uint8Array([1, 2, 3, 4, 5]));
    expect(result.ok).toBe(false);
    expect(result.findings[0].code).toBe("unzip_failed");
  });

  it("أرشيف كله مرفوض يرجّع ok=false برسالة مفهومة", async () => {
    const result = await extractZip(makeZip({ "a.exe": "x", "b.dll": "y" }));
    expect(result.ok).toBe(false);
    expect(result.entries).toEqual([]);
  });

  it("الحجم الكلّي بيتحسب من المفكوك فعلًا", async () => {
    const result = await extractZip(makeZip({ "a.txt": "12345", "b.txt": "678" }));
    expect(result.totalBytes).toBe(8);
  });

  it("الرسالة بتقول كام اتفكّ وكام اتستبعد", async () => {
    const result = await extractZip(makeZip({ "ok.txt": "x", "bad.exe": "y" }));
    expect(result.message).toContain("1");
    expect(result.message).toContain("اتستبعد");
  });
});
