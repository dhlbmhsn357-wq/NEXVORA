/**
 * NEXVORA Product Decisions — Scenario Tests (0107)
 * الاختبارات دي pure — بتغطّي أول 4 سيناريوهات من المتطلبات:
 *   1) إنشاء افتراض
 *   2) ربط مخاطرة بمتطلب
 *   3) إغلاق سؤال مفتوح
 *   4) إنشاء قرار موثّق (بتاريخ + قرار)
 * بدل الاعتماد على DB، بنُغلّف حالة داخلية بسيطة (in-memory store) عشان
 * نختبر شكل الـ input/output والحالات الانتقالية اللي تتوقّعها الخدمة.
 */
import { describe, it, expect } from "vitest";
import type {
  ProductDecisionItemRow, ItemType, ItemStatus, ItemPriority,
} from "./types";
import { countOpen, countCriticalOpenRisks } from "./derive";

interface CreateInput {
  itemType: ItemType;
  title: string;
  description?: string;
  status?: ItemStatus;
  priority?: ItemPriority;
  dueDate?: string | null;
  linkedRequirementId?: string | null;
  resolution?: string;
  decisionDate?: string | null;
  mitigation?: string;
}

let counter = 0;
const NOW = "2026-08-08T10:00:00.000Z";

/** محاكاة لسلوك service.createItem — بيملأ الحقول بالافتراضات. */
function fakeCreate(projectId: string, input: CreateInput): ProductDecisionItemRow {
  counter++;
  return {
    id: `it-${counter}`,
    projectId,
    itemType: input.itemType,
    title: input.title,
    description: input.description ?? "",
    status: input.status ?? "open",
    priority: input.priority ?? "medium",
    ownerId: null,
    dueDate: input.dueDate ?? null,
    impact: "",
    mitigation: input.mitigation ?? "",
    resolution: input.resolution ?? "",
    decisionDate: input.decisionDate ?? null,
    linkedRequirementId: input.linkedRequirementId ?? null,
    linkedStoryId: null,
    linkedScopeItemId: null,
    stageKey: null,
    createdBy: null,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

/** محاكاة لسلوك service.setStatus — يعيد row جديد بحالة جديدة. */
function fakeSetStatus(row: ProductDecisionItemRow, status: ItemStatus): ProductDecisionItemRow {
  return { ...row, status, updatedAt: NOW };
}

describe("Scenario 1: إنشاء افتراض", () => {
  it("ينشئ عنصرًا بنوع assumption وحالة open ومحسوب مع الـ open count", () => {
    const row = fakeCreate("p1", { itemType: "assumption", title: "المستخدمون العرب يفضّلون الدارك مود" });
    expect(row.itemType).toBe("assumption");
    expect(row.status).toBe("open");
    expect(countOpen([row])).toBe(1);
  });
});

describe("Scenario 2: ربط مخاطرة بمتطلب", () => {
  it("يخزّن linkedRequirementId ويظهر كمخاطرة حرجة", () => {
    const row = fakeCreate("p1", {
      itemType: "risk", priority: "critical", title: "الاعتماد على مزوّد خارجي غير مستقر",
      mitigation: "الاحتفاظ بمزوّد بديل جاهز",
      linkedRequirementId: "req-42",
    });
    expect(row.itemType).toBe("risk");
    expect(row.linkedRequirementId).toBe("req-42");
    expect(row.mitigation).not.toBe("");
    expect(countCriticalOpenRisks([row])).toBe(1);
  });
});

describe("Scenario 3: إغلاق سؤال مفتوح", () => {
  it("انتقال open → resolved بعد إجابة السؤال", () => {
    const row = fakeCreate("p1", { itemType: "open_question", title: "ما المتصفحات المدعومة؟" });
    expect(row.status).toBe("open");
    const closed = fakeSetStatus({ ...row, resolution: "دعم آخر إصدارين من Chrome/Safari/Firefox" }, "resolved");
    expect(closed.status).toBe("resolved");
    // بعد الإغلاق ما يُعدّش ضمن الـ open
    expect(countOpen([closed])).toBe(0);
  });
});

describe("Scenario 4: إنشاء قرار موثّق", () => {
  it("يخزّن decisionDate و resolution ويصبح status confirmed", () => {
    const row = fakeCreate("p1", {
      itemType: "decision",
      title: "اعتماد Supabase Auth بدل بناء نظام مصادقة داخلي",
      resolution: "أوفر وقت + أعلى مستوى أمان جاهز",
      decisionDate: "2026-08-08",
      status: "confirmed",
    });
    expect(row.itemType).toBe("decision");
    expect(row.decisionDate).toBe("2026-08-08");
    expect(row.status).toBe("confirmed");
    expect(row.resolution.length).toBeGreaterThan(0);
  });
});
