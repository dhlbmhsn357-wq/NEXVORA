import { describe, expect, it } from "vitest";
import {
  changedFields,
  decideVersion,
  diffVersions,
  hasChanges,
  planRollback,
  type VersionSnapshot,
} from "./versioning";
import { KNOWLEDGE_EVENTS, dedupeKeyFor, invalidatesDownstream } from "./events";
import { normalize, search } from "./search";
import type { KnowledgeObject } from "./model";

function snap(patch: Partial<VersionSnapshot> = {}): VersionSnapshot {
  return {
    itemId: "k-1",
    version: 1,
    title: "قاعدة التسعير",
    content: "الخصم لا يتجاوز عشرين بالمئة.",
    category: "business",
    tags: ["تسعير"],
    confidence: 80,
    metadata: {},
    contentHash: null,
    changeKind: "create",
    changeReason: null,
    createdBy: null,
    createdAt: new Date("2026-01-01"),
    ...patch,
  };
}

describe("الفروق بين الإصدارات", () => {
  it("يمسك التغيير في كل حقل", () => {
    const diffs = diffVersions(snap(), snap({ title: "قاعدة التسعير المحدَّثة" }));
    expect(changedFields(diffs)).toEqual(["title"]);
    expect(hasChanges(diffs)).toBe(true);
  });

  // ترتيب المفاتيح في JavaScript مش مضمون، وعرض بيتغيّر ترتيبه بين
  // مرتين بيبان كأنه اتغيّر وهو ما اتغيّرش.
  it("الوسوم تتقارن بلا حساسية للترتيب", () => {
    const diffs = diffVersions(
      snap({ tags: ["أ", "ب"] }),
      snap({ tags: ["ب", "أ"] })
    );
    expect(hasChanges(diffs)).toBe(false);
  });

  it("ترتيب الحقول ثابت مهما كان ترتيب الكائن", () => {
    const diffs = diffVersions(snap(), snap());
    expect(diffs.map((d) => d.field)).toEqual([
      "title", "content", "category", "tags", "confidence",
    ]);
  });

  it("نفس الإصدار مافيهوش فروق", () => {
    expect(hasChanges(diffVersions(snap(), snap()))).toBe(false);
  });
});

describe("قرار تسجيل الإصدار", () => {
  // إعادة تشغيل الإثراء بتنتج نفس الناتج في الأغلب — تسجيل إصدار لكل
  // تشغيل كان هيملأ التاريخ بضجيج يخفي التغييرات الحقيقية.
  it("مايسجّلش إصدارًا لتعديل بلا تغيير", () => {
    const decision = decideVersion({ current: snap(), next: snap(), currentVersion: 3 });
    expect(decision.action).toBe("skip");
  });

  it("يسجّل ويزوّد الرقم عند التغيير", () => {
    const decision = decideVersion({
      current: snap(),
      next: snap({ confidence: 95 }),
      currentVersion: 3,
    });

    expect(decision).toMatchObject({ action: "record", version: 4, changed: ["confidence"] });
  });

  it("الفرض يسجّل حتى بلا تغيير — الحدث نفسه معلومة", () => {
    const decision = decideVersion({
      current: snap(),
      next: snap(),
      currentVersion: 3,
      force: true,
    });
    expect(decision).toMatchObject({ action: "record", version: 4 });
  });
});

describe("الرجوع لإصدار سابق", () => {
  it("يستعيد المحتوى ويكتب إصدارًا جديدًا فوق الحالي", () => {
    const plan = planRollback({ target: snap({ version: 2, title: "القديم" }), currentVersion: 5 });

    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.restore.title).toBe("القديم");
    // ٦ لا ٢: التاريخ بيفضل كامل، ويبان إن فيه رجوع حصل.
    expect(plan.newVersion).toBe(6);
  });

  it("يرفض إصدارًا غير موجود", () => {
    expect(planRollback({ target: null, currentVersion: 3 })).toMatchObject({ ok: false });
  });

  it("يرفض الرجوع للإصدار الحالي", () => {
    const plan = planRollback({ target: snap({ version: 3 }), currentVersion: 3 });
    expect(plan).toMatchObject({ ok: false });
  });

  it("يرفض الرجوع لإصدار أحدث", () => {
    const plan = planRollback({ target: snap({ version: 9 }), currentVersion: 3 });
    expect(plan).toMatchObject({ ok: false });
  });
});

describe("الأحداث", () => {
  it("التغييرات الفعلية بتبطّل مخرَجات المراحل التالية", () => {
    expect(invalidatesDownstream(KNOWLEDGE_EVENTS.CREATED)).toBe(true);
    expect(invalidatesDownstream(KNOWLEDGE_EVENTS.ROLLED_BACK)).toBe(true);
  });

  // حساب الجودة والمراجعة ما بيغيّروش المعرفة نفسها — إبطال المخرَجات
  // بسببهم كان هيعيد توليد كل حاجة بلا سبب.
  it("حساب الجودة والمراجعة مابيبطّلوش", () => {
    expect(invalidatesDownstream(KNOWLEDGE_EVENTS.QUALITY_COMPUTED)).toBe(false);
    expect(invalidatesDownstream(KNOWLEDGE_EVENTS.REVIEWED)).toBe(false);
  });

  it("مفتاح إسقاط التكرار بيجمّع على مستوى المصدر", () => {
    const base = { type: KNOWLEDGE_EVENTS.CREATED, projectId: "p-1", summary: "" } as const;
    const a = dedupeKeyFor({ ...base, sourceId: "s-1", itemId: "k-1" });
    const b = dedupeKeyFor({ ...base, sourceId: "s-1", itemId: "k-2" });

    expect(a).toBe(b);
  });
});

// ============================================================
// البحث
// ============================================================

function obj(patch: Partial<KnowledgeObject> = {}): KnowledgeObject {
  return {
    id: "k-1", projectId: "p-1", workspaceId: "w-1",
    sourceType: "pdf", sourceId: "s-1",
    title: "سياسة التسعير", content: "تفاصيل السياسة", summary: null, language: "ar",
    category: "business", tags: [], status: "indexed",
    confidence: 70, importance: 50, version: 1, contentHash: null,
    visibility: "project", ownerId: null, createdBy: null, updatedBy: null,
    metadata: {}, relationships: [],
    createdAt: new Date("2026-01-01"), updatedAt: new Date("2026-01-01"), reviewedAt: null,
    ...patch,
  };
}

describe("التطبيع العربي", () => {
  // دي مش حالات نادرة — دي الكتابة العربية العادية.
  it("يوحّد الهمزات والتاء المربوطة والألف المقصورة", () => {
    expect(normalize("الإدارة")).toBe(normalize("الاداره"));
    expect(normalize("مستوى")).toBe(normalize("مستوي"));
  });

  it("يشيل التشكيل", () => {
    expect(normalize("سِيَاسَة")).toBe(normalize("سياسه"));
  });
});

describe("البحث", () => {
  it("العنوان يترجّح أعلى من المحتوى", () => {
    const inTitle = obj({ id: "title", title: "الشحن الدولي", content: "لا شيء" });
    const inContent = obj({ id: "content", title: "أخرى", content: "ذكر الشحن مرة" });

    expect(search([inContent, inTitle], { text: "الشحن" })[0].object.id).toBe("title");
  });

  it("يستبعد غير الصالح للاستخدام افتراضيًا", () => {
    const hits = search([obj({ status: "rejected" })], { text: "سياسة" });
    expect(hits).toEqual([]);
  });

  it("يشمل غير الصالح عند طلب التدقيق", () => {
    const hits = search([obj({ status: "rejected" })], { text: "سياسة", includeUnusable: true });
    expect(hits).toHaveLength(1);
  });

  it("يبحث بالمعنى لا باسم الملف", () => {
    const hits = search([obj({ tags: ["تسعير", "خصم"] })], { text: "خصم" });
    expect(hits[0].matchedIn).toContain("tags");
  });

  it("فلتر الوسوم تضييق: كل الوسوم لازم تكون موجودة", () => {
    const objects = [obj({ id: "one", tags: ["أ"] }), obj({ id: "both", tags: ["أ", "ب"] })];
    const hits = search(objects, { tags: ["أ", "ب"] });

    expect(hits.map((h) => h.object.id)).toEqual(["both"]);
  });

  it("بحث بلا نصّ يرتّب بالأهمية", () => {
    const low = obj({ id: "low", importance: 10 });
    const high = obj({ id: "high", importance: 90 });

    expect(search([low, high], {})[0].object.id).toBe("high");
  });

  it("يحترم الحد الأقصى", () => {
    const objects = Array.from({ length: 10 }, (_, i) => obj({ id: `k-${i}` }));
    expect(search(objects, { limit: 3 })).toHaveLength(3);
  });

  it("مايرجّعش نتائج بلا تطابق", () => {
    expect(search([obj()], { text: "كلمة غير موجودة نهائيًا" })).toEqual([]);
  });
});
