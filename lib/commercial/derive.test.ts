import { describe, expect, it } from "vitest";
import {
  allowedLifecycleTransitions,
  isLifecycleTransitionAllowed,
  deriveEffectivePaymentStatus,
  summarizePayments,
  summarizeContracts,
  formatMoney,
} from "./derive";
import type { ContractRow, PaymentScheduleRow } from "./types";

const NOW = "2026-08-07T10:00:00.000Z";

function pay(over: Partial<PaymentScheduleRow>): PaymentScheduleRow {
  return {
    id: "p", projectId: "prj", contractId: null, installmentNo: 1, title: "دفعة",
    amount: 1000, currency: "EGP", dueDate: null, paidAt: null, status: "pending",
    notes: "", createdAt: NOW, updatedAt: NOW, createdBy: null,
    ...over,
  };
}
function contract(over: Partial<ContractRow>): ContractRow {
  return {
    id: "c", projectId: "prj", title: "عقد", status: "draft", totalAmount: null,
    currency: "EGP", signedAt: null, signedByClient: null, documentUrl: null,
    notes: "", createdAt: NOW, updatedAt: NOW, createdBy: null,
    ...over,
  };
}

describe("lifecycle transitions", () => {
  it("prospect ينتقل لـ active/lost/archived فقط", () => {
    expect(allowedLifecycleTransitions("prospect")).toEqual(["active", "lost", "archived"]);
    expect(isLifecycleTransitionAllowed("prospect", "active")).toBe(true);
    expect(isLifecycleTransitionAllowed("prospect", "completed")).toBe(false);
    expect(isLifecycleTransitionAllowed("prospect", "paused")).toBe(false);
  });
  it("active يقدر يروح paused/completed/lost/archived", () => {
    expect(allowedLifecycleTransitions("active")).toEqual(["paused", "completed", "lost", "archived"]);
  });
  it("completed/lost يروحوا archived بس", () => {
    expect(allowedLifecycleTransitions("completed")).toEqual(["archived"]);
    expect(allowedLifecycleTransitions("lost")).toEqual(["archived"]);
  });
  it("archived نهاية الطريق", () => {
    expect(allowedLifecycleTransitions("archived")).toEqual([]);
  });
});

describe("deriveEffectivePaymentStatus", () => {
  it("paid يفضل paid حتى لو dueDate عدّى", () => {
    expect(deriveEffectivePaymentStatus({ status: "paid", dueDate: "2020-01-01" }, NOW)).toBe("paid");
  });
  it("cancelled يفضل cancelled", () => {
    expect(deriveEffectivePaymentStatus({ status: "cancelled", dueDate: "2020-01-01" }, NOW)).toBe("cancelled");
  });
  it("pending بلا dueDate يفضل pending", () => {
    expect(deriveEffectivePaymentStatus({ status: "pending", dueDate: null }, NOW)).toBe("pending");
  });
  it("pending مع dueDate في المستقبل يفضل pending", () => {
    expect(deriveEffectivePaymentStatus({ status: "pending", dueDate: "2027-01-01" }, NOW)).toBe("pending");
  });
  it("pending مع dueDate عدّى → overdue", () => {
    expect(deriveEffectivePaymentStatus({ status: "pending", dueDate: "2025-01-01" }, NOW)).toBe("overdue");
  });
  it("invoiced مع dueDate عدّى → overdue", () => {
    expect(deriveEffectivePaymentStatus({ status: "invoiced", dueDate: "2025-01-01" }, NOW)).toBe("overdue");
  });
  it("dueDate = اليوم بالظبط → لسه pending", () => {
    expect(deriveEffectivePaymentStatus({ status: "pending", dueDate: "2026-08-07" }, NOW)).toBe("pending");
  });
});

describe("summarizePayments", () => {
  it("مصفوفة فاضية = كل الأصفار", () => {
    const s = summarizePayments([], NOW);
    expect(s.total).toBe(0);
    expect(s.totalAmount).toBe(0);
  });
  it("يجمع الأنواع بالشكل الصح مع كشف overdue", () => {
    const s = summarizePayments([
      pay({ status: "paid", amount: 500 }),
      pay({ status: "pending", amount: 300, dueDate: "2025-01-01" }), // → overdue
      pay({ status: "pending", amount: 200, dueDate: null }),
      pay({ status: "invoiced", amount: 100 }),
      pay({ status: "cancelled", amount: 999 }),
    ], NOW);
    expect(s.total).toBe(5);
    expect(s.paid).toBe(1);
    expect(s.overdue).toBe(1);
    expect(s.pending).toBe(1);
    expect(s.invoiced).toBe(1);
    expect(s.cancelled).toBe(1);
    expect(s.paidAmount).toBe(500);
    expect(s.overdueAmount).toBe(300);
    expect(s.pendingAmount).toBe(300); // 200 + 100
    expect(s.totalAmount).toBe(1100);  // 500 + 300 + 200 + 100 (cancelled يستثنى)
  });
});

describe("summarizeContracts", () => {
  it("يجمع الحالات ويحسب المجموع للموقّعة حسب العملة", () => {
    const s = summarizeContracts([
      contract({ status: "signed", totalAmount: 10000, currency: "EGP" }),
      contract({ status: "signed", totalAmount: 5000, currency: "EGP" }),
      contract({ status: "signed", totalAmount: 2000, currency: "USD" }),
      contract({ status: "draft" }),
      contract({ status: "cancelled" }),
      contract({ status: "sent" }),
    ]);
    expect(s.total).toBe(6);
    expect(s.signed).toBe(3);
    expect(s.draft).toBe(1);
    expect(s.sent).toBe(1);
    expect(s.cancelled).toBe(1);
    expect(s.signedTotalByCurrency).toEqual({ EGP: 15000, USD: 2000 });
  });
  it("عقد موقّع بلا totalAmount ما يتجمعش", () => {
    const s = summarizeContracts([contract({ status: "signed", totalAmount: null })]);
    expect(s.signed).toBe(1);
    expect(s.signedTotalByCurrency).toEqual({});
  });
});

describe("formatMoney", () => {
  it("يعرض العملة مع رمزها", () => {
    // الأرقام قد تكون هندية (ar-EG) أو غربية حسب الـ ICU؛ نتحقق من
    // وجود رمز العملة العربي أو ISO فقط لتفادي التبعية على الأرقام.
    const out = formatMoney(1500, "EGP");
    expect(out).toMatch(/EGP|ج\.م\.|جنيه/);
  });
  it("عملة غير معروفة → fallback بدون رمي خطأ", () => {
    const out = formatMoney(100, "XYZ");
    expect(out).toContain("XYZ");
  });
});
