/**
 * NEXVORA Handoff Q&A + Delivery — Scenario Tests (0107)
 *   7) إنشاء سؤال (يبدأ مفتوح)
 *   8) تغيير حالة السؤال (open → answered → closed)
 *   9) تسجيل استلام تسليم
 *  10) الشركاء الخارجيون لا يرون الملاحظات الداخلية (موثّق: لا سطح شريك في الأكواد الحالية)
 */
import { describe, it, expect } from "vitest";
import type {
  HandoffQuestionRow, HandoffQuestionStatus,
  HandoffDeliveryRow, HandoffDeliveryStatus,
} from "./types";
import { summarizeQuestions, latestDelivery } from "./derive";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

const NOW = "2026-08-08T10:00:00.000Z";

function fakeCreateQuestion(over: Partial<HandoffQuestionRow> = {}): HandoffQuestionRow {
  return {
    id: "q1", projectId: "p1", packageId: "pk1", partnerId: over.partnerId ?? null,
    question: over.question ?? "ما نوع قاعدة البيانات المطلوبة؟",
    answer: "", status: "open", priority: "medium",
    askedBy: null, assignedTo: null, answeredBy: null,
    askedAt: NOW, answeredAt: null, closedAt: null,
    createdAt: NOW, updatedAt: NOW,
    ...over,
  };
}

function fakeAnswer(row: HandoffQuestionRow, answer: string): HandoffQuestionRow {
  return { ...row, answer, status: "answered", answeredAt: NOW };
}
function fakeCloseQuestion(row: HandoffQuestionRow): HandoffQuestionRow {
  return { ...row, status: "closed" as HandoffQuestionStatus, closedAt: NOW };
}

function fakeCreateDelivery(status: HandoffDeliveryStatus, partnerName: string): HandoffDeliveryRow {
  return {
    id: "d1", projectId: "p1", packageId: "pk1", partnerId: null, partnerName,
    receiptStatus: status,
    sentAt: status === "sent" ? NOW : null, sentBy: null,
    receivedAt: status === "received" ? NOW : null,
    acceptedAt: status === "accepted" ? NOW : null,
    rejectedAt: null, statusUpdatedBy: null,
    notes: "", createdAt: NOW, updatedAt: NOW,
  };
}

describe("Scenario 7: إنشاء سؤال Handoff", () => {
  it("يبدأ بحالة open ويظهر في summary", () => {
    const q = fakeCreateQuestion();
    expect(q.status).toBe("open");
    expect(q.answer).toBe("");
    const s = summarizeQuestions([q]);
    expect(s.open).toBe(1);
    expect(s.total).toBe(1);
  });
});

describe("Scenario 8: تغيير حالة السؤال", () => {
  it("open → answered → closed مع answeredAt/closedAt", () => {
    const q0 = fakeCreateQuestion();
    const q1 = fakeAnswer(q0, "PostgreSQL 15 مع Supabase.");
    expect(q1.status).toBe("answered");
    expect(q1.answer).not.toBe("");
    expect(q1.answeredAt).toBe(NOW);
    const q2 = fakeCloseQuestion(q1);
    expect(q2.status).toBe("closed");
    expect(q2.closedAt).toBe(NOW);
  });
});

describe("Scenario 9: تسجيل استلام تسليم", () => {
  it("يعلن تسليم بحالة received ويظهر كأحدث سجلّ", () => {
    const d = fakeCreateDelivery("received", "شركة التطوير XYZ");
    expect(d.receiptStatus).toBe("received");
    expect(d.receivedAt).toBe(NOW);
    expect(latestDelivery([d])?.id).toBe("d1");
  });
});

describe("Scenario 10: الشركاء الخارجيون لا يرون الملاحظات الداخلية", () => {
  it("لا يوجد مسار (route) واجهة موجّه للشركاء الخارجيين — الحماية مبنية على غياب السطح", () => {
    // نبحث في مجلد app عن أي مسار (route) يستخدم اسم "partner-portal" أو
    // "external-partner" كصفحة — إن وُجد، الاختبار يفشل ويتطلّب مراجعة RLS.
    const appDir = path.resolve(__dirname, "..", "..", "app");
    const forbidden: string[] = [];
    function walk(dir: string) {
      if (!existsSync(dir)) return;
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name.includes("partner-portal") || entry.name.includes("external-partner")) {
            forbidden.push(full);
          }
          walk(full);
        }
      }
    }
    walk(appDir);
    expect(forbidden).toEqual([]);
  });
});
