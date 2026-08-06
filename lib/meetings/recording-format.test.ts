import { describe, expect, it } from "vitest";
import {
  MAX_INLINE_AUDIO_BYTES,
  baseMimeType,
  checkRecordingSize,
  describeMicError,
  formatRecordingDuration,
  pickRecordingMimeType,
  recordingFileExtension,
} from "./recording-format";

describe("pickRecordingMimeType", () => {
  it("يختار opus/webm لما يكون مدعومًا (Chrome)", () => {
    expect(pickRecordingMimeType((m) => m === "audio/webm;codecs=opus")).toBe("audio/webm;codecs=opus");
  });

  it("يرجع لـ mp4 لما webm/ogg مش مدعومين (Safari)", () => {
    expect(pickRecordingMimeType((m) => m === "audio/mp4")).toBe("audio/mp4");
  });

  it("يرجّع null لو مفيش أي صيغة مدعومة", () => {
    expect(pickRecordingMimeType(() => false)).toBeNull();
  });

  it("يحترم ترتيب الأفضلية لما أكتر من صيغة مدعومة", () => {
    expect(pickRecordingMimeType(() => true)).toBe("audio/webm;codecs=opus");
  });
});

describe("baseMimeType", () => {
  it("يشيل لاحقة codecs", () => {
    expect(baseMimeType("audio/webm;codecs=opus")).toBe("audio/webm");
  });

  it("يسيب النوع الأساسي زي ما هو", () => {
    expect(baseMimeType("audio/mp4")).toBe("audio/mp4");
  });
});

describe("recordingFileExtension", () => {
  it("يطابق الامتداد للنوع", () => {
    expect(recordingFileExtension("audio/webm;codecs=opus")).toBe("webm");
    expect(recordingFileExtension("audio/mp4")).toBe("m4a");
    expect(recordingFileExtension("audio/ogg;codecs=opus")).toBe("ogg");
  });
});

describe("checkRecordingSize", () => {
  it("يرفض التسجيل الفارغ", () => {
    const r = checkRecordingSize(0);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/فارغ/);
  });

  it("يقبل حجمًا تحت السقف", () => {
    expect(checkRecordingSize(5 * 1024 * 1024).ok).toBe(true);
  });

  it("يرفض حجمًا فوق السقف برسالة فيها حل عملي", () => {
    const r = checkRecordingSize(MAX_INLINE_AUDIO_BYTES + 1);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/تليجرام|قسّم/);
  });
});

describe("describeMicError", () => {
  it("يفرّق بين الرفض المؤقت والرفض المحفوظ", () => {
    const once = describeMicError("NotAllowedError", false);
    expect(once.retryable).toBe(true);

    const remembered = describeMicError("NotAllowedError", true);
    expect(remembered.retryable).toBe(false);
    expect(remembered.message).toMatch(/إعدادات|القفل/);
  });

  it("يشرح غياب الميكروفون", () => {
    const r = describeMicError("NotFoundError");
    expect(r.message).toMatch(/مفيش ميكروفون/);
    expect(r.retryable).toBe(true);
  });

  it("يشرح انشغال الميكروفون ببرنامج تاني", () => {
    expect(describeMicError("NotReadableError").message).toMatch(/مشغول/);
  });

  it("يعتبر خطأ الأمان غير قابل لإعادة المحاولة", () => {
    expect(describeMicError("SecurityError").retryable).toBe(false);
  });

  it("يرجّع رسالة عامة لأي خطأ غير معروف", () => {
    const r = describeMicError(undefined);
    expect(r.message.length).toBeGreaterThan(0);
    expect(r.retryable).toBe(true);
  });
});

describe("formatRecordingDuration", () => {
  it("يصيغ الساعات والدقائق والثواني", () => {
    expect(formatRecordingDuration(0)).toBe("00:00:00");
    expect(formatRecordingDuration(65_000)).toBe("00:01:05");
    expect(formatRecordingDuration(3_661_000)).toBe("01:01:01");
  });

  it("يتعامل مع القيم السالبة كصفر", () => {
    expect(formatRecordingDuration(-5)).toBe("00:00:00");
  });
});
