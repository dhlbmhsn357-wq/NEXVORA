import { describe, expect, it } from "vitest";
import { isRunnableStatus, shouldDiscardCallback } from "./cancellation";

describe("isRunnableStatus", () => {
  it("queued/running قابلة للتشغيل افتراضيًا", () => {
    expect(isRunnableStatus("queued")).toBe(true);
    expect(isRunnableStatus("running")).toBe(true);
  });

  it("أي حالة نهائية مش قابلة للتشغيل", () => {
    for (const s of ["completed", "failed", "cancelled", "cancelling", "pending"]) {
      expect(isRunnableStatus(s)).toBe(false);
    }
  });

  it("يحترم مجموعة runnable مخصصة", () => {
    expect(isRunnableStatus("generating", ["generating"])).toBe(true);
    expect(isRunnableStatus("running", ["generating"])).toBe(false);
  });
});

describe("shouldDiscardCallback", () => {
  const exec = "exec-123";

  it("الصف اختفى → تجاهل", () => {
    expect(shouldDiscardCallback(null, exec)).toBe(true);
  });

  it("نفس execution_id وحالة running → لا تتجاهل (اكتب النتيجة)", () => {
    expect(shouldDiscardCallback({ status: "running", execution_id: exec }, exec)).toBe(false);
  });

  it("المراجعة اتلغت (cancelled) → تجاهل النتيجة المتأخرة", () => {
    expect(shouldDiscardCallback({ status: "cancelled", execution_id: exec }, exec)).toBe(true);
  });

  it("المراجعة في cancelling → تجاهل", () => {
    expect(shouldDiscardCallback({ status: "cancelling", execution_id: exec }, exec)).toBe(true);
  });

  it("execution_id اتغيّر (تنفيذ أحدث حجز مكانه) → تجاهل حتى لو الحالة running", () => {
    expect(shouldDiscardCallback({ status: "running", execution_id: "newer-exec" }, exec)).toBe(true);
  });

  it("اكتملت بالفعل → تجاهل (لا كتابة مزدوجة)", () => {
    expect(shouldDiscardCallback({ status: "completed", execution_id: exec }, exec)).toBe(true);
  });
});
