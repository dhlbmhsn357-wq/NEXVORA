import { describe, expect, it } from "vitest";
import {
  deriveHandoffReadiness, effectivePackageStatus, isPartnerActive, summarizePartners,
  summarizeQuestions, latestDelivery,
} from "./derive";
import { HANDOFF_ITEM_REGISTRY, MANDATORY_HANDOFF_KEYS } from "./types";
import type {
  HandoffItemRow, ExternalPartnerRow, HandoffQuestionRow, HandoffDeliveryRow,
} from "./types";

const NOW = "2026-08-08T10:00:00.000Z";
function item(key: string, status: HandoffItemRow["status"] = "completed"): HandoffItemRow {
  return {
    id: key, packageId: "p", projectId: "x", itemKey: key,
    isMandatory: MANDATORY_HANDOFF_KEYS.includes(key), status,
    contentUrl: null, contentText: "", contentRefType: null, contentRefId: null,
    notes: "", completedAt: NOW, completedBy: null, createdAt: NOW, updatedAt: NOW,
    sourceType: null, sourceVersion: null, sourceHash: null,
    assembledAt: null, assembledBy: null, isManualOverride: false, overrideReason: "",
  };
}
function partner(over: Partial<ExternalPartnerRow>): ExternalPartnerRow {
  return {
    id: "e", projectId: "p", name: "n", organization: "", email: "e@x.com",
    role: "viewer", status: "active", accessToken: "t",
    expiresAt: null, lastSeenAt: null, invitedAt: NOW, invitedBy: null,
    revokedAt: null, revokeReason: "", notes: "", updatedAt: NOW,
    ...over,
  };
}

describe("deriveHandoffReadiness", () => {
  it("فاضي = 0% وليس جاهز", () => {
    const r = deriveHandoffReadiness([]);
    expect(r.mandatoryCompleted).toBe(0);
    expect(r.ready).toBe(false);
    expect(r.missingMandatory.length).toBe(MANDATORY_HANDOFF_KEYS.length);
  });
  it("كل الإلزاميات مكتملة = ready + mandatoryPercent 100", () => {
    const items = MANDATORY_HANDOFF_KEYS.map((k) => item(k));
    const r = deriveHandoffReadiness(items);
    expect(r.ready).toBe(true);
    expect(r.mandatoryPercent).toBe(100);
    expect(r.missingMandatory.length).toBe(0);
    // overall = 100*0.8 + 0*0.2 = 80
    expect(r.overallScore).toBe(80);
  });
  it("skipped يُعامَل كمكتمل", () => {
    const items = MANDATORY_HANDOFF_KEYS.map((k) => item(k, "skipped"));
    const r = deriveHandoffReadiness(items);
    expect(r.ready).toBe(true);
  });
  it("6/7 إلزامي = غير جاهز", () => {
    const items = MANDATORY_HANDOFF_KEYS.slice(0, -1).map((k) => item(k));
    const r = deriveHandoffReadiness(items);
    expect(r.ready).toBe(false);
    expect(r.missingMandatory.length).toBe(1);
  });

  it("0111 — stale detection: item's sourceHash != currentHash marks stale + fails readiness", () => {
    const items = MANDATORY_HANDOFF_KEYS.map((k) => {
      const it = item(k);
      // simulate assembled item with known source hash
      it.sourceType = "brain";
      it.sourceHash = "hash-old";
      return it;
    });
    // one item is stale: current hash differs
    const hashes = new Map<string, string | null>(
      MANDATORY_HANDOFF_KEYS.map((k) => [k, "hash-old"]),
    );
    hashes.set(MANDATORY_HANDOFF_KEYS[0], "hash-new");
    const r = deriveHandoffReadiness(items, hashes);
    expect(r.stale).toBe(1);
    // stale item is not counted as done → ready=false
    expect(r.ready).toBe(false);
    expect(r.mandatoryCompleted).toBe(MANDATORY_HANDOFF_KEYS.length - 1);
  });

  it("0111 — manual override items are never stale", () => {
    const items = MANDATORY_HANDOFF_KEYS.map((k) => {
      const it = item(k);
      it.sourceType = "brain";
      it.sourceHash = "hash-old";
      it.isManualOverride = true;
      return it;
    });
    const hashes = new Map<string, string | null>(
      MANDATORY_HANDOFF_KEYS.map((k) => [k, "hash-new"]),
    );
    const r = deriveHandoffReadiness(items, hashes);
    expect(r.stale).toBe(0);
    expect(r.ready).toBe(true);
  });
});

describe("effectivePackageStatus", () => {
  it("finalized لا يتغيّر", () => {
    const r = deriveHandoffReadiness([]);
    expect(effectivePackageStatus("finalized", r)).toBe("finalized");
  });
  it("draft + ready = ready", () => {
    const items = MANDATORY_HANDOFF_KEYS.map((k) => item(k));
    const r = deriveHandoffReadiness(items);
    expect(effectivePackageStatus("draft", r)).toBe("ready");
  });
  it("draft + غير جاهز = draft", () => {
    const r = deriveHandoffReadiness([]);
    expect(effectivePackageStatus("draft", r)).toBe("draft");
  });
});

describe("Partners", () => {
  it("isPartnerActive: revoked = false", () => {
    expect(isPartnerActive(partner({ revokedAt: NOW }), NOW)).toBe(false);
    expect(isPartnerActive(partner({ status: "suspended" }), NOW)).toBe(false);
    expect(isPartnerActive(partner({ expiresAt: "2020-01-01T00:00:00Z" }), NOW)).toBe(false);
    expect(isPartnerActive(partner({ status: "active" }), NOW)).toBe(true);
    expect(isPartnerActive(partner({ status: "invited" }), NOW)).toBe(true);
  });
  it("summarizePartners يحسب كل الحالات", () => {
    const s = summarizePartners([
      partner({ status: "active" }),
      partner({ status: "invited" }),
      partner({ status: "suspended" }),
      partner({ status: "revoked" }),
      partner({ status: "active", expiresAt: "2020-01-01T00:00:00Z" }),
    ], NOW);
    expect(s.active).toBe(1);
    expect(s.invited).toBe(1);
    expect(s.suspended).toBe(1);
    expect(s.revoked).toBe(1);
    expect(s.expired).toBe(1);
  });
});

function question(over: Partial<HandoffQuestionRow> = {}): HandoffQuestionRow {
  return {
    id: "q", projectId: "p", packageId: "pk", partnerId: null,
    question: "؟", answer: "",
    status: "open", priority: "medium",
    askedBy: null, assignedTo: null, answeredBy: null,
    askedAt: NOW, answeredAt: null, closedAt: null,
    createdAt: NOW, updatedAt: NOW,
    ...over,
  };
}
function delivery(over: Partial<HandoffDeliveryRow> = {}): HandoffDeliveryRow {
  return {
    id: "d", projectId: "p", packageId: "pk", partnerId: null,
    partnerName: "شريك", receiptStatus: "pending",
    sentAt: null, sentBy: null, receivedAt: null,
    acceptedAt: null, rejectedAt: null, statusUpdatedBy: null, notes: "",
    createdAt: NOW, updatedAt: NOW,
    ...over,
  };
}

describe("Handoff Questions/Deliveries (0107)", () => {
  it("summarizeQuestions يعد كل الحالات", () => {
    const s = summarizeQuestions([
      question({ status: "open" }),
      question({ status: "answered" }),
      question({ status: "needs_clarification" }),
      question({ status: "closed" }),
      question({ status: "open" }),
    ]);
    expect(s.total).toBe(5);
    expect(s.open).toBe(2);
    expect(s.answered).toBe(1);
    expect(s.needsClarification).toBe(1);
    expect(s.closed).toBe(1);
  });

  it("latestDelivery يرجّع الأحدث زمنيًا", () => {
    expect(latestDelivery([])).toBeNull();
    const d1 = delivery({ id: "d1", updatedAt: "2026-08-01T00:00:00Z" });
    const d2 = delivery({ id: "d2", updatedAt: "2026-08-08T00:00:00Z" });
    const d3 = delivery({ id: "d3", updatedAt: "2026-08-05T00:00:00Z" });
    expect(latestDelivery([d1, d2, d3])?.id).toBe("d2");
  });
});

describe("Registry integrity", () => {
  it("7 إلزامية product-focused + بقية اختيارية", () => {
    // 7 mandatory + 22 optional = 29 total (0106 review fixes)
    expect(HANDOFF_ITEM_REGISTRY.length).toBe(29);
    expect(MANDATORY_HANDOFF_KEYS.length).toBe(7);
    // نتأكّد أن المفاتيح الإلزامية الجديدة موجودة
    for (const k of [
      "problem_brief","scope_mvp","user_stories","acceptance_criteria",
      "prototype_link","prd_final","product_evaluation_guide",
    ]) {
      expect(MANDATORY_HANDOFF_KEYS).toContain(k);
    }
  });
  it("كل item_key فريد", () => {
    const keys = HANDOFF_ITEM_REGISTRY.map((i) => i.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
