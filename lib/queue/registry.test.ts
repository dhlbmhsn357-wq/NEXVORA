import { describe, it, expect, beforeEach } from "vitest";
import {
  DuplicateHandlerError,
  HANDLER_DEFAULTS,
  UnknownJobTypeError,
  __resetRegistryForTests,
  defineJobHandler,
  getJobHandler,
  handlerTypesForWorker,
  isRegisteredType,
  listJobHandlers,
  listWorkerTypes,
  requireJobHandler,
} from "./registry";

/**
 * السجل هو قلب البنية القابلة للتوسيع. الاختبارات دي بتحرس الوعد
 * المعماري: **إضافة عامل جديد = تسجيل فقط**.
 */

const noop = async () => undefined;

beforeEach(() => {
  __resetRegistryForTests();
});

describe("التسجيل", () => {
  it("يسجّل معالجًا ويسترجعه", () => {
    defineJobHandler({ type: "test.alpha", workerType: "test", handler: noop });
    expect(getJobHandler("test.alpha")?.type).toBe("test.alpha");
    expect(isRegisteredType("test.alpha")).toBe(true);
  });

  it("يطبّق الافتراضات على الحقول الغائبة", () => {
    const handler = defineJobHandler({ type: "test.beta", workerType: "test", handler: noop });
    expect(handler.concurrency).toBe(HANDLER_DEFAULTS.concurrency);
    expect(handler.timeoutMs).toBe(HANDLER_DEFAULTS.timeoutMs);
    expect(handler.maxAttempts).toBe(HANDLER_DEFAULTS.maxAttempts);
    expect(handler.defaultPriority).toBe(HANDLER_DEFAULTS.defaultPriority);
  });

  it("القيم الصريحة تغلب الافتراضات", () => {
    const handler = defineJobHandler({
      type: "test.gamma",
      workerType: "test",
      concurrency: 7,
      timeoutMs: 999,
      maxAttempts: 9,
      defaultPriority: "critical",
      handler: noop,
    });
    expect(handler.concurrency).toBe(7);
    expect(handler.timeoutMs).toBe(999);
    expect(handler.maxAttempts).toBe(9);
    expect(handler.defaultPriority).toBe("critical");
  });
});

describe("الرفض", () => {
  it("التسجيل المكرّر يرمي لا يستبدل", () => {
    // الاستبدال الصامت معناه إن ترتيب الاستيراد يقرّر أي معالج يشتغل
    // فعلًا — خطأ يستحيل تشخيصه لاحقًا.
    defineJobHandler({ type: "test.dup", workerType: "test", handler: noop });
    expect(() =>
      defineJobHandler({ type: "test.dup", workerType: "other", handler: noop })
    ).toThrow(DuplicateHandlerError);
  });

  it("يرفض الأسماء المخالفة للاصطلاح", () => {
    const bad = ["nodot", "Two.Caps", "trailing.", ".leading", "has space.x", "a.b.c"];
    for (const type of bad) {
      expect(() => defineJobHandler({ type, workerType: "test", handler: noop })).toThrow();
    }
  });

  it("يقبل الاصطلاح الصحيح", () => {
    const good = ["ai.generate", "knowledge.classify", "browser_check.run", "a.b"];
    for (const type of good) {
      expect(() => defineJobHandler({ type, workerType: "test", handler: noop })).not.toThrow();
    }
  });

  it("requireJobHandler يرمي على النوع غير المسجّل", () => {
    expect(() => requireJobHandler("nope.missing")).toThrow(UnknownJobTypeError);
  });

  it("getJobHandler يرجّع undefined لا يرمي", () => {
    expect(getJobHandler("nope.missing")).toBeUndefined();
  });
});

describe("التوجيه حسب نوع العامل", () => {
  beforeEach(() => {
    defineJobHandler({ type: "ai.generate", workerType: "ai", handler: noop });
    defineJobHandler({ type: "ai.embed", workerType: "ai", handler: noop });
    defineJobHandler({ type: "browser.check", workerType: "browser", handler: noop });
  });

  it("يرجّع أنواع العامل المطلوب فقط", () => {
    expect(handlerTypesForWorker("ai").sort()).toEqual(["ai.embed", "ai.generate"]);
    expect(handlerTypesForWorker("browser")).toEqual(["browser.check"]);
  });

  it("العامل بلا أنواع يرجّع مصفوفة فارغة لا يرمي", () => {
    // وقت التشغيل هو اللي بيرمي عند صفر أنواع، لأن الفشل الصريح هناك
    // أوضح: عامل بيدور فاضي للأبد بيبدو سليمًا في كل المقاييس.
    expect(handlerTypesForWorker("nonexistent")).toEqual([]);
  });

  it("يعدّد أنواع العمال بلا تكرار", () => {
    expect(listWorkerTypes()).toEqual(["ai", "browser"]);
  });
});

describe("الوعد المعماري — الإضافة بلا تعديل", () => {
  it("عامل جديد بالكامل يدخل بتسجيل واحد", () => {
    // ده جوهر المرحلة: لا تعديل على الطابور ولا على وقت التشغيل ولا
    // على قاعدة البيانات — سطر تسجيل واحد وخلاص.
    expect(listJobHandlers()).toHaveLength(0);

    defineJobHandler({
      type: "knowledge.classify",
      workerType: "knowledge",
      concurrency: 5,
      handler: noop,
    });

    expect(listWorkerTypes()).toContain("knowledge");
    expect(handlerTypesForWorker("knowledge")).toEqual(["knowledge.classify"]);
    expect(requireJobHandler("knowledge.classify").concurrency).toBe(5);
  });

  it("قفل المورد وبصمة التكرار يُشتقّان من الحمولة", () => {
    const handler = defineJobHandler<{ projectId: string }>({
      type: "brain.rebuild",
      workerType: "ai",
      lockKey: (p) => `brain:${p.projectId}`,
      dedupeHash: (p) => `brain-rebuild:${p.projectId}`,
      handler: noop,
    });

    expect(handler.lockKey?.({ projectId: "p1" })).toBe("brain:p1");
    expect(handler.dedupeHash?.({ projectId: "p1" })).toBe("brain-rebuild:p1");
  });

  it("قيود الصلاحية جزء من التعريف لا من الطابور", () => {
    const handler = defineJobHandler({
      type: "admin.rebuild",
      workerType: "system",
      allowedRoles: ["owner", "admin"],
      requiresProjectMembership: true,
      handler: noop,
    });
    expect(handler.allowedRoles).toEqual(["owner", "admin"]);
    expect(handler.requiresProjectMembership).toBe(true);
  });
});

describe("معالجات النظام المدمجة", () => {
  it("تُسجَّل عند استيراد ملف المعالجات", async () => {
    __resetRegistryForTests();
    await import("./handlers/system");

    expect(isRegisteredType("system.noop")).toBe(true);
    expect(isRegisteredType("system.stepped")).toBe(true);
    expect(handlerTypesForWorker("system").sort()).toEqual(["system.noop", "system.stepped"]);
  });
});
