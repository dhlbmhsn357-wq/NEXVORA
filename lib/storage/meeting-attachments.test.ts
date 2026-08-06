import { describe, expect, it } from "vitest";
import { detectAttachmentFileType } from "./meeting-attachments";

describe("detectAttachmentFileType", () => {
  it("يتعرّف على الصور", () => {
    expect(detectAttachmentFileType("png")).toBe("image");
    expect(detectAttachmentFileType("JPG")).toBe("image");
  });
  it("يتعرّف على PDF", () => {
    expect(detectAttachmentFileType("pdf")).toBe("pdf");
  });
  it("يتعرّف على DOCX/DOC", () => {
    expect(detectAttachmentFileType("docx")).toBe("docx");
    expect(detectAttachmentFileType("doc")).toBe("docx");
  });
  it("يتعرّف على XLSX/XLS", () => {
    expect(detectAttachmentFileType("xlsx")).toBe("xlsx");
    expect(detectAttachmentFileType("xls")).toBe("xlsx");
  });
  it("يتعرّف على CSV", () => {
    expect(detectAttachmentFileType("csv")).toBe("csv");
  });
  it("امتداد غير معروف → other", () => {
    expect(detectAttachmentFileType("zip")).toBe("other");
  });
});
