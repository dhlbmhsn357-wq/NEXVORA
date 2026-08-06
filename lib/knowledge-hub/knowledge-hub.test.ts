import { describe, it, expect } from "vitest";
import {
  acceptedExtensions,
  checkFileSize,
  classifyFile,
  fileExtension,
  isExtractable,
  isReprocessableSource,
  unsupportedReason,
  MAX_AI_NATIVE_BYTES,
  MAX_FILE_BYTES,
} from "./file-types";
import { chunkText, describeLocator } from "./chunking";

describe("fileExtension", () => {
  it("يستخرج الامتداد بحروف صغيرة", () => {
    expect(fileExtension("Policy.PDF")).toBe("pdf");
    expect(fileExtension("سياسة الخصم.docx")).toBe("docx");
  });

  it("يتعامل مع الأسماء اللي فيها أكتر من نقطة", () => {
    expect(fileExtension("api.v2.spec.json")).toBe("json");
  });

  it("يرجّع نص فاضي لما مفيش امتداد", () => {
    expect(fileExtension("README")).toBe("");
    expect(fileExtension("trailing.")).toBe("");
  });
});

describe("classifyFile", () => {
  it("يصنّف المستندات النصية للقراءة المباشرة", () => {
    expect(classifyFile("notes.md").method).toBe("text");
    expect(classifyFile("data.csv").method).toBe("text");
    expect(classifyFile("schema.sql").method).toBe("text");
  });

  it("يوجّه docx لـ mammoth", () => {
    expect(classifyFile("sop.docx").method).toBe("docx");
  });

  it("يوجّه PDF والوسائط للقراءة بالذكاء الاصطناعي", () => {
    expect(classifyFile("manual.pdf").method).toBe("ai_native");
    expect(classifyFile("flow.png").method).toBe("ai_native");
    expect(classifyFile("call.mp3").method).toBe("ai_native");
    expect(classifyFile("demo.mp4").method).toBe("ai_native");
  });

  it("يعلن doc القديم غير مدعوم بدل ما يوجّهه لـ mammoth", () => {
    // mammoth بتفكّ docx بس — لو وجّهنا doc ليها كان هيفشل وقت الاستخراج.
    expect(classifyFile("old.doc").method).toBe("unsupported");
  });

  it("يعلن الأرشيف كنوع مستقل", () => {
    expect(classifyFile("bundle.zip").method).toBe("archive");
    expect(classifyFile("bundle.rar").method).toBe("archive");
  });

  it("يقدّم الامتداد على الـ MIME العام", () => {
    // المتصفح بيرجّع octet-stream لـ drawio — الامتداد هو اللي يحكم.
    expect(classifyFile("arch.drawio", "application/octet-stream").method).toBe("text");
  });

  it("يرجع للـ MIME لما الامتداد مش معروف", () => {
    expect(classifyFile("blob", "image/png").method).toBe("ai_native");
    expect(classifyFile("blob", "text/plain").method).toBe("text");
    expect(classifyFile("blob", "application/pdf").method).toBe("ai_native");
  });

  it("يرجّع غير معروف لما مفيش امتداد ولا MIME مفيد", () => {
    expect(classifyFile("mystery").method).toBe("unsupported");
  });
});

describe("isExtractable و unsupportedReason", () => {
  it("يعتبر النص وdocx والوسائط قابلة للاستخراج", () => {
    expect(isExtractable(classifyFile("a.txt"))).toBe(true);
    expect(isExtractable(classifyFile("a.docx"))).toBe(true);
    expect(isExtractable(classifyFile("a.pdf"))).toBe(true);
  });

  it("يعتبر الأرشيف وغير المدعوم غير قابلين للاستخراج", () => {
    expect(isExtractable(classifyFile("a.zip"))).toBe(false);
    expect(isExtractable(classifyFile("a.xls"))).toBe(false); // Excel القديم الثنائي
  });

  it("يستخرج Excel الحديث (xlsx) عبر jszip", () => {
    expect(isExtractable(classifyFile("a.xlsx"))).toBe(true);
    expect(classifyFile("a.xlsx").method).toBe("xlsx");
  });

  it("يشرح للمستخدم سبب عدم التحليل ويقترح بديلًا", () => {
    const zip = unsupportedReason(classifyFile("a.zip"));
    expect(zip).toContain("فُكّ الضغط");

    const xls = unsupportedReason(classifyFile("a.xls"));
    expect(xls).toContain("Excel");
    expect(xls).toContain("PDF");
  });

  it("مايرجّعش سبب للأنواع المدعومة", () => {
    expect(unsupportedReason(classifyFile("a.pdf"))).toBeNull();
  });
});

describe("isReprocessableSource", () => {
  it("الفاشل قابل دائمًا لإعادة المعالجة", () => {
    expect(isReprocessableSource("failed", "file", "a.pdf", null, 0)).toBe(true);
    expect(isReprocessableSource("failed", "url", null, null, 500)).toBe(true);
  });

  it("الجاهز بلا نص قابل، وبنص غير قابل", () => {
    expect(isReprocessableSource("ready", "file", "a.docx", null, 0)).toBe(true);
    expect(isReprocessableSource("ready", "file", "a.docx", null, 1200)).toBe(false);
  });

  it("المتخطّى (xlsx) صار قابلًا بعد دعم Excel", () => {
    expect(isReprocessableSource("skipped_duplicate", "file", "السيارات.xlsx", null, 0)).toBe(true);
  });

  it("المتخطّى لنوع غير مدعوم يظل غير قابل", () => {
    expect(isReprocessableSource("skipped_duplicate", "file", "a.xls", null, 0)).toBe(false);
    expect(isReprocessableSource("skipped_duplicate", "file", "a.zip", null, 0)).toBe(false);
  });

  it("قيد المعالجة أو الجاهز-بنص لا يُعاد", () => {
    expect(isReprocessableSource("pending", "file", "a.pdf", null, 0)).toBe(false);
    expect(isReprocessableSource("extracting", "file", "a.pdf", null, 0)).toBe(false);
  });
});

describe("checkFileSize", () => {
  const pdf = classifyFile("a.pdf");
  const txt = classifyFile("a.txt");

  it("يرفض الملف الفاضي", () => {
    const r = checkFileSize(0, txt);
    expect(r.ok).toBe(false);
  });

  it("يقبل الحجم العادي", () => {
    expect(checkFileSize(5000, txt).ok).toBe(true);
  });

  it("يرفض ما يتجاوز الحد العام", () => {
    const r = checkFileSize(MAX_FILE_BYTES + 1, txt);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain("الحد المسموح");
  });

  it("يطبّق حدًا أضيق على الملفات اللي بتتبعت للنموذج", () => {
    const size = MAX_AI_NATIVE_BYTES + 1;
    expect(checkFileSize(size, txt).ok).toBe(true);
    const r = checkFileSize(size, pdf);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain("الذكاء الاصطناعي");
  });
});

describe("acceptedExtensions", () => {
  it("يرجّع امتدادات مسبوقة بنقطة ومرتّبة", () => {
    const list = acceptedExtensions();
    expect(list).toContain(".pdf");
    expect(list).toContain(".docx");
    expect(list.every((e) => e.startsWith("."))).toBe(true);
    expect([...list].sort()).toEqual(list);
  });
});

describe("chunkText", () => {
  it("يرجّع مصفوفة فاضية للنص الفاضي", () => {
    expect(chunkText("")).toEqual([]);
    expect(chunkText("   \n\n  ")).toEqual([]);
  });

  it("يرجّع مقطعًا واحدًا للنص القصير", () => {
    const chunks = chunkText("فقرة قصيرة عن سياسة الخصم.");
    expect(chunks).toHaveLength(1);
    expect(chunks[0].index).toBe(0);
    expect(chunks[0].char_count).toBe(chunks[0].content.length);
  });

  it("يحمل مسار عناوين Markdown مع المقطع", () => {
    const text = ["# السياسات", "", "## الخصم", "", "الخصم الأقصى عشرة بالمئة."].join("\n");
    const chunks = chunkText(text);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].locator.heading_path).toEqual(["السياسات", "الخصم"]);
  });

  it("يستبدل العنوان الشقيق بدل ما يراكمه", () => {
    const text = [
      "# السياسات",
      "",
      "## الخصم",
      "",
      "نص الخصم.",
      "",
      "## الاسترجاع",
      "",
      "نص الاسترجاع.",
    ].join("\n");
    const chunks = chunkText(text);
    expect(chunks).toHaveLength(2);
    expect(chunks[0].locator.heading_path).toEqual(["السياسات", "الخصم"]);
    expect(chunks[1].locator.heading_path).toEqual(["السياسات", "الاسترجاع"]);
  });

  it("يقفل المقطع عند العنوان عشان ما يخلطش قسمين", () => {
    const chunks = chunkText("# أ\n\nنص أ.\n\n# ب\n\nنص ب.");
    expect(chunks).toHaveLength(2);
    expect(chunks[0].content).toBe("نص أ.");
    expect(chunks[1].content).toBe("نص ب.");
  });

  it("يجمّع الفقرات القصيرة لحد الحجم المستهدف", () => {
    const text = Array.from({ length: 6 }, (_, i) => `فقرة رقم ${i}.`).join("\n\n");
    const chunks = chunkText(text, { targetChars: 1000 });
    expect(chunks).toHaveLength(1);
  });

  it("يبدأ مقطعًا جديدًا لما يتعدّى الحجم المستهدف", () => {
    const para = "ا".repeat(400);
    const text = Array.from({ length: 5 }, () => para).join("\n\n");
    const chunks = chunkText(text, { targetChars: 900 });
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => c.char_count <= 900)).toBe(true);
  });

  it("يقسّم الفقرة الأطول من الحد الأقصى", () => {
    const chunks = chunkText("ا".repeat(5000), { targetChars: 1000, maxChars: 1200 });
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => c.char_count <= 1200)).toBe(true);
  });

  it("يرقّم المقاطع بالتتابع من الصفر", () => {
    const para = "ا".repeat(400);
    const chunks = chunkText(Array.from({ length: 6 }, () => para).join("\n\n"), {
      targetChars: 900,
    });
    expect(chunks.map((c) => c.index)).toEqual(chunks.map((_, i) => i));
  });

  it("يوحّد نهايات أسطر ويندوز", () => {
    const chunks = chunkText("سطر أول.\r\n\r\nسطر تاني.");
    expect(chunks).toHaveLength(1);
    expect(chunks[0].content).not.toContain("\r");
  });
});

describe("describeLocator", () => {
  it("يوصّف مسار العناوين", () => {
    expect(describeLocator({ heading_path: ["السياسات", "الخصم"] })).toBe("السياسات ← الخصم");
  });

  it("يضيف الصفحة وورقة العمل", () => {
    const text = describeLocator({ heading_path: ["أ"], page: 3, sheet: "المبيعات" });
    expect(text).toContain("صفحة 3");
    expect(text).toContain("ورقة المبيعات");
  });

  it("يرجّع وصفًا مفهومًا لما مفيش موضع", () => {
    expect(describeLocator({ heading_path: [] })).toBe("بداية المستند");
  });
});
