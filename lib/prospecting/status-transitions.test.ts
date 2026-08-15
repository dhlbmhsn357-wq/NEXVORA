import { describe, expect, it } from "vitest";
import { validateStatusTransition } from "./status-transitions";

describe("validateStatusTransition — contacted", () => {
  it("يرفض التحول إلى contacted بدون تأكيد صريح (فتح واتساب فقط)", () => {
    const r = validateStatusTransition({ currentStatus: "ready_to_contact", targetStatus: "contacted", hasConvertedLeadId: false, confirmedSent: false });
    expect(r.ok).toBe(false);
  });

  it("يقبل التحول إلى contacted بعد تأكيد صريح من حالة مصدر صالحة", () => {
    const r = validateStatusTransition({ currentStatus: "ready_to_contact", targetStatus: "contacted", hasConvertedLeadId: false, confirmedSent: true });
    expect(r.ok).toBe(true);
  });

  it("يرفض التحول إلى contacted من حالة غير منطقية (interested) حتى مع تأكيد", () => {
    const r = validateStatusTransition({ currentStatus: "interested", targetStatus: "contacted", hasConvertedLeadId: false, confirmedSent: true });
    expect(r.ok).toBe(false);
  });
});

describe("validateStatusTransition — converted", () => {
  it("يرفض التحول إلى converted بدون Lead مرتبط", () => {
    const r = validateStatusTransition({ currentStatus: "interested", targetStatus: "converted", hasConvertedLeadId: false });
    expect(r.ok).toBe(false);
  });

  it("يقبل التحول إلى converted مع Lead مرتبط", () => {
    const r = validateStatusTransition({ currentStatus: "interested", targetStatus: "converted", hasConvertedLeadId: true });
    expect(r.ok).toBe(true);
  });

  it("يرفض تحويل مزدوج (الحالة الحالية بالفعل converted)", () => {
    const r = validateStatusTransition({ currentStatus: "converted", targetStatus: "converted", hasConvertedLeadId: true });
    expect(r.ok).toBe(false);
  });
});

describe("validateStatusTransition — إعادة فتح not_fit/archived", () => {
  it("يرفض الخروج من archived بدون إجراء إعادة فتح صريح", () => {
    const r = validateStatusTransition({ currentStatus: "archived", targetStatus: "ready_to_contact", hasConvertedLeadId: false });
    expect(r.ok).toBe(false);
  });

  it("يقبل الخروج من archived مع explicitReopen", () => {
    const r = validateStatusTransition({ currentStatus: "archived", targetStatus: "ready_to_contact", hasConvertedLeadId: false, explicitReopen: true });
    expect(r.ok).toBe(true);
  });

  it("يرفض الخروج من not_fit بدون إجراء إعادة فتح صريح", () => {
    const r = validateStatusTransition({ currentStatus: "not_fit", targetStatus: "follow_up", hasConvertedLeadId: false });
    expect(r.ok).toBe(false);
  });
});

describe("validateStatusTransition — انتقالات عادية مسموحة", () => {
  it("يقبل انتقال بسيط بلا شروط خاصة (replied → interested)", () => {
    const r = validateStatusTransition({ currentStatus: "replied", targetStatus: "interested", hasConvertedLeadId: false });
    expect(r.ok).toBe(true);
  });
});
