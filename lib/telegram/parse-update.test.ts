import { describe, expect, it } from "vitest";
import { extractAudioMessage, extractProjectCode } from "./parse-update";

describe("extractAudioMessage", () => {
  it("extracts a voice message", () => {
    const update = {
      message: {
        chat: { id: 123 },
        caption: "PRJ-A7X2",
        voice: { file_id: "abc", mime_type: "audio/ogg" },
      },
    };
    const result = extractAudioMessage(update);
    expect(result).toEqual({
      chatId: 123,
      fileId: "abc",
      mimeType: "audio/ogg",
      caption: "PRJ-A7X2",
    });
  });

  it("extracts an audio message", () => {
    const update = {
      message: { chat: { id: 1 }, audio: { file_id: "xyz", mime_type: "audio/mp3" } },
    };
    expect(extractAudioMessage(update)?.fileId).toBe("xyz");
  });

  it("extracts an audio document but not a non-audio document", () => {
    const audioDoc = {
      message: { chat: { id: 1 }, document: { file_id: "d1", mime_type: "audio/mpeg" } },
    };
    expect(extractAudioMessage(audioDoc)?.fileId).toBe("d1");

    const pdfDoc = {
      message: { chat: { id: 1 }, document: { file_id: "d2", mime_type: "application/pdf" } },
    };
    expect(extractAudioMessage(pdfDoc)).toBeNull();
  });

  it("returns null for a text-only message", () => {
    const update = { message: { chat: { id: 1 }, text: "hello" } };
    expect(extractAudioMessage(update)).toBeNull();
  });

  it("returns null when there is no message at all", () => {
    expect(extractAudioMessage({})).toBeNull();
    expect(extractAudioMessage(null)).toBeNull();
  });

  it("defaults mime type to audio/ogg when Telegram doesn't provide one", () => {
    const update = { message: { chat: { id: 1 }, voice: { file_id: "v1" } } };
    expect(extractAudioMessage(update)?.mimeType).toBe("audio/ogg");
  });
});

describe("extractProjectCode", () => {
  it("extracts a standalone project code", () => {
    expect(extractProjectCode("PRJ-A7X2")).toBe("PRJ-A7X2");
  });

  it("extracts a project code embedded in a longer caption", () => {
    expect(extractProjectCode("اجتماع اليوم PRJ-B3K9 مع العميل")).toBe("PRJ-B3K9");
  });

  it("is case-insensitive", () => {
    expect(extractProjectCode("prj-a7x2")).toBe("PRJ-A7X2");
  });

  it("returns null when no code is present", () => {
    expect(extractProjectCode("اجتماع عادي بدون كود")).toBeNull();
    expect(extractProjectCode(null)).toBeNull();
  });
});
