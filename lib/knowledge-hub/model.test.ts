import { describe, expect, it } from "vitest";
import {
  KNOWLEDGE_STATUSES,
  allowedTransitions,
  canTransition,
  categoryLabel,
  isTerminal,
  isUsable,
  rankForContext,
  selectForContext,
  sourceGroup,
  type KnowledgeObject,
  type KnowledgeStatus,
} from "./model";

function obj(patch: Partial<KnowledgeObject> = {}): KnowledgeObject {
  return {
    id: "k-1",
    projectId: "p-1",
    workspaceId: "w-1",
    sourceType: "pdf",
    sourceId: "s-1",
    title: "قاعدة عمل",
    content: "المحتوى الكامل للقاعدة",
    summary: null,
    language: "ar",
    category: "business",
    tags: [],
    status: "indexed",
    confidence: 70,
    importance: 50,
    version: 1,
    contentHash: null,
    visibility: "project",
    ownerId: null,
    createdBy: null,
    updatedBy: null,
    metadata: {},
    relationships: [],
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    reviewedAt: null,
    ...patch,
  };
}

describe("تجميع المصادر", () => {
  it("يوزّع الأنواع على مجموعات المعالجة الصحيحة", () => {
    expect(sourceGroup("pdf")).toBe("document");
    expect(sourceGroup("excel")).toBe("structured");
    expect(sourceGroup("audio")).toBe("media");
    expect(sourceGroup("meeting")).toBe("internal");
    expect(sourceGroup("git_repository")).toBe("external");
  });

  // القائمة هتكبر، والنوع الجديد مايصحّش يوقّع الحساب.
  it("نوع غير معروف ياخد مجموعة افتراضية بدل ما ينهار", () => {
    expect(sourceGroup("something_new")).toBe("document");
  });
});

describe("آلة الحالات", () => {
  it("المعرفة المحذوفة نهائية — مافيش خروج منها", () => {
    expect(isTerminal("deleted")).toBe(true);
    expect(allowedTransitions("deleted")).toEqual([]);
  });

  // ده الفرق اللي المواصفة أصرّت عليه: القديم مش غلط، والمرفوض مش قديم.
  it("القديم يقدر يرجع للمراجعة، والمرفوض يقدر يرجع للمراجعة كمان", () => {
    expect(canTransition("outdated", "needs_review")).toBe(true);
    expect(canTransition("rejected", "needs_review")).toBe(true);
  });

  it("مايصحّش القفز من الانتظار للتأكيد بلا معالجة", () => {
    expect(canTransition("pending", "verified")).toBe(false);
  });

  it("كل حالة غير نهائية ليها مخرج واحد على الأقل", () => {
    for (const status of KNOWLEDGE_STATUSES) {
      if (status === "deleted") continue;
      expect(allowedTransitions(status).length, `${status} مقفولة`).toBeGreaterThan(0);
    }
  });

  it("مافيش حالة تنتقل لنفسها", () => {
    for (const status of KNOWLEDGE_STATUSES) {
      expect(canTransition(status, status), `${status} بتنتقل لنفسها`).toBe(false);
    }
  });
});

describe("الصلاحية للاستخدام", () => {
  // «تحتاج مراجعة» مشمولة عن قصد — استبعادها كان بيهمل معرفة صحيحة
  // لمجرد إن محدش فتحها.
  it("المفهرَسة والمؤكَّدة واللي تحتاج مراجعة كلها صالحة", () => {
    expect(isUsable("indexed")).toBe(true);
    expect(isUsable("verified")).toBe(true);
    expect(isUsable("needs_review")).toBe(true);
  });

  it("المرفوضة والقديمة والمحذوفة مش صالحة", () => {
    for (const status of ["rejected", "outdated", "deleted", "archived", "pending"] as KnowledgeStatus[]) {
      expect(isUsable(status), status).toBe(false);
    }
  });
});

describe("ترتيب السياق", () => {
  it("الأهمية تسبق الثقة، والثقة تسبق الحداثة", () => {
    const low = obj({ id: "low", importance: 10, confidence: 99, updatedAt: new Date("2026-06-01") });
    const high = obj({ id: "high", importance: 90, confidence: 40, updatedAt: new Date("2020-01-01") });

    expect(rankForContext([low, high])[0].id).toBe("high");
  });

  it("عند تساوي الأهمية، الثقة تحسم", () => {
    const a = obj({ id: "a", importance: 50, confidence: 40 });
    const b = obj({ id: "b", importance: 50, confidence: 90 });

    expect(rankForContext([a, b])[0].id).toBe("b");
  });

  it("عند تساوي الأهمية والثقة، الأحدث يسبق", () => {
    const older = obj({ id: "older", updatedAt: new Date("2026-01-01") });
    const newer = obj({ id: "newer", updatedAt: new Date("2026-06-01") });

    expect(rankForContext([older, newer])[0].id).toBe("newer");
  });

  it("مايعدّلش المصفوفة الأصلية", () => {
    const list = [obj({ id: "a", importance: 10 }), obj({ id: "b", importance: 90 })];
    rankForContext(list);
    expect(list[0].id).toBe("a");
  });
});

describe("اختيار السياق بميزانية", () => {
  it("يستبعد غير الصالح قبل أي حساب", () => {
    const result = selectForContext(
      [obj({ id: "ok" }), obj({ id: "bad", status: "rejected" })],
      10_000
    );
    expect(result.selected.map((o) => o.id)).toEqual(["ok"]);
  });

  it("مايتجاوزش الميزانية", () => {
    const objects = Array.from({ length: 20 }, (_, i) =>
      obj({ id: `k-${i}`, content: "x".repeat(100) })
    );
    const result = selectForContext(objects, 350);

    expect(result.usedChars).toBeLessThanOrEqual(350);
    expect(result.selected.length).toBe(3);
    expect(result.droppedCount).toBe(17);
  });

  // القطع على حدود الكائنات لا في نصّها: نصّ قاعدة عمل مقطوع أخطر من
  // غيابها، لأنه بيبان كاملًا وهو ناقص.
  it("مايقطعش محتوى عنصر في النص", () => {
    const big = obj({ id: "big", content: "x".repeat(500) });
    const small = obj({ id: "small", content: "y".repeat(50), importance: 10 });
    const result = selectForContext([big, small], 100);

    expect(result.selected.map((o) => o.id)).toEqual(["small"]);
    expect(result.usedChars).toBe(50);
  });

  it("يستخدم الملخّص لو موجود بدل المحتوى الكامل", () => {
    const withSummary = obj({ content: "x".repeat(1000), summary: "ملخّص قصير" });
    const result = selectForContext([withSummary], 100);

    expect(result.selected).toHaveLength(1);
    expect(result.usedChars).toBe("ملخّص قصير".length);
  });

  it("ميزانية صفر تعطي اختيارًا فاضيًا بلا انهيار", () => {
    const result = selectForContext([obj()], 0);
    expect(result.selected).toEqual([]);
    expect(result.droppedCount).toBe(1);
  });
});

describe("تسميات التصنيفات", () => {
  it("يترجم التصنيفات المعروفة", () => {
    expect(categoryLabel("business")).toBe("الأعمال");
    expect(categoryLabel("unknown")).toBe("غير مصنَّف");
  });

  // التصنيف الجديد اللي النظام اتعلّمه لازم يبان باسمه لا بفراغ.
  it("التصنيف غير المعروف يظهر كما هو", () => {
    expect(categoryLabel("custom_domain")).toBe("custom_domain");
  });
});
