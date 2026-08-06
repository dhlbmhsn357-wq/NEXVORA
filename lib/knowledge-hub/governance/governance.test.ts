import { describe, expect, it } from "vitest";
import {
  evaluateRetention,
  summarizeRetention,
  type GovernableObject,
  type RetentionPolicy,
} from "./retention";
import { detectPii, maskPii, summarizePii } from "../security/pii";
import { buildQaReport, qaVerdict, type QaIssue } from "../qa/qa-model";
import { buildPackage, validatePackage, PACKAGE_FORMAT_VERSION } from "../package/package-model";

// ============================================================
// retention
// ============================================================

function obj(partial: Partial<GovernableObject> & { id: string }): GovernableObject {
  return { status: "active", confidence: 80, ageDays: 10, idleDays: 5, ...partial };
}

const archivePolicy: RetentionPolicy = {
  policyType: "archive",
  scope: "all",
  enabled: true,
  enforcement: "suggest",
  config: { maxIdleDays: 90 },
};

describe("evaluateRetention", () => {
  it("لا قرار للكائن الذي لم يستوفِ أي سياسة", () => {
    const decisions = evaluateRetention([obj({ id: "a", idleDays: 10 })], [archivePolicy]);
    expect(decisions).toHaveLength(0);
  });

  it("يقترح الأرشفة للكائن الخامل طويلًا", () => {
    const decisions = evaluateRetention([obj({ id: "a", idleDays: 120 })], [archivePolicy]);
    expect(decisions).toHaveLength(1);
    expect(decisions[0].action).toBe("archive");
    expect(decisions[0].automatic).toBe(false);
  });

  it("السياسة المعطّلة تُتجاهل", () => {
    const decisions = evaluateRetention(
      [obj({ id: "a", idleDays: 120 })],
      [{ ...archivePolicy, enabled: false }]
    );
    expect(decisions).toHaveLength(0);
  });

  it("الأخطر يفوز: الحذف يتغلّب على الأرشفة", () => {
    const del: RetentionPolicy = {
      policyType: "deletion", scope: "all", enabled: true, enforcement: "automatic",
      config: { appliesToStatuses: ["rejected"], maxAgeDays: 30 },
    };
    const decisions = evaluateRetention(
      [obj({ id: "a", status: "rejected", ageDays: 60, idleDays: 120 })],
      [archivePolicy, del]
    );
    expect(decisions[0].action).toBe("delete");
    expect(decisions[0].automatic).toBe(true);
  });

  it("سياسة الثقة تمسك العناصر منخفضة الثقة فقط", () => {
    const lowConf: RetentionPolicy = {
      policyType: "archive", scope: "all", enabled: true, enforcement: "suggest",
      config: { minConfidence: 40 },
    };
    const decisions = evaluateRetention(
      [obj({ id: "high", confidence: 80 }), obj({ id: "low", confidence: 20 })],
      [lowConf]
    );
    expect(decisions.map((d) => d.objectId)).toEqual(["low"]);
  });

  it("سياسة بلا شروط لا تطبّق على الكل عشوائيًا", () => {
    const noConfig: RetentionPolicy = {
      policyType: "archive", scope: "all", enabled: true, enforcement: "suggest", config: {},
    };
    const decisions = evaluateRetention([obj({ id: "a" })], [noConfig]);
    expect(decisions).toHaveLength(0);
  });

  it("summarizeRetention يعدّ الأنواع", () => {
    const del: RetentionPolicy = {
      policyType: "deletion", scope: "all", enabled: true, enforcement: "suggest",
      config: { maxAgeDays: 30 },
    };
    const decisions = evaluateRetention(
      [obj({ id: "a", ageDays: 40, idleDays: 120 }), obj({ id: "b", idleDays: 120 })],
      [archivePolicy, del]
    );
    const s = summarizeRetention(decisions);
    expect(s.needsApproval).toBe(2);
    expect(s.delete).toBeGreaterThanOrEqual(1);
  });
});

// ============================================================
// pii
// ============================================================

describe("detectPii", () => {
  it("يكتشف البريد", () => {
    const m = detectPii("راسلني على ahmed@example.com من فضلك");
    expect(m.some((x) => x.kind === "email")).toBe(true);
  });

  it("يكتشف بطاقة صالحة بـ Luhn ويتجاهل الأرقام العشوائية", () => {
    const valid = detectPii("البطاقة 4242 4242 4242 4242");
    expect(valid.some((x) => x.kind === "credit_card")).toBe(true);
    const invalid = detectPii("الرقم 1234 5678 9012 3456");
    expect(invalid.some((x) => x.kind === "credit_card")).toBe(false);
  });

  it("يكتشف مفتاح API", () => {
    const m = detectPii("المفتاح sk-abcdefghijklmnop1234567890");
    expect(m.some((x) => x.kind === "api_key")).toBe(true);
  });

  it("يكتشف الرقم القومي المصري (١٤ رقمًا)", () => {
    const m = detectPii("الرقم القومي 29801011234567");
    expect(m.some((x) => x.kind === "national_id")).toBe(true);
  });

  it("لا تطابقات في نصّ نظيف", () => {
    expect(detectPii("هذا نصّ عادي بلا بيانات حسّاسة")).toHaveLength(0);
  });

  it("summarizePii يعدّ لكل نوع", () => {
    const s = summarizePii("a@b.com و c@d.com");
    expect(s.email).toBe(2);
  });
});

describe("maskPii", () => {
  it("يُخفي البريد مع إبقاء النطاق", () => {
    const { masked, count } = maskPii("راسلني ahmed@example.com");
    expect(count).toBe(1);
    expect(masked).toContain("@example.com");
    expect(masked).not.toContain("ahmed@example.com");
  });

  it("النصّ النظيف لا يتغيّر", () => {
    const { masked, count } = maskPii("نصّ عادي");
    expect(count).toBe(0);
    expect(masked).toBe("نصّ عادي");
  });
});

// ============================================================
// qa-model
// ============================================================

describe("buildQaReport", () => {
  const dims = { completeness: 80, consistency: 70 };

  it("بلا مشاكل، الدرجة = درجة الجودة", () => {
    const r = buildQaReport({ qualityOverall: 85, dimensions: dims, issues: [], piiFlagCount: 0 });
    expect(r.overallScore).toBe(85);
    expect(r.issueCount).toBe(0);
  });

  it("المشكلة الحرجة تخصم أكثر من المنخفضة", () => {
    const crit: QaIssue = { type: "contradiction", severity: "critical", detail: "x" };
    const low: QaIssue = { type: "low_confidence", severity: "low", detail: "y" };
    const rc = buildQaReport({ qualityOverall: 90, dimensions: dims, issues: [crit], piiFlagCount: 0 });
    const rl = buildQaReport({ qualityOverall: 90, dimensions: dims, issues: [low], piiFlagCount: 0 });
    expect(rc.overallScore).toBeLessThan(rl.overallScore);
  });

  it("العقوبة متشبّعة عند ٤٠", () => {
    const many: QaIssue[] = Array(20).fill({ type: "contradiction", severity: "critical", detail: "x" });
    const r = buildQaReport({ qualityOverall: 90, dimensions: dims, issues: many, piiFlagCount: 0 });
    expect(r.overallScore).toBe(50); // 90 - 40
  });

  it("يرتّب المشاكل بالشدّة ويعدّ الحرجة", () => {
    const issues: QaIssue[] = [
      { type: "low_confidence", severity: "low", detail: "a" },
      { type: "contradiction", severity: "critical", detail: "b" },
    ];
    const r = buildQaReport({ qualityOverall: 80, dimensions: dims, issues, piiFlagCount: 3 });
    expect(r.issues[0].severity).toBe("critical");
    expect(r.criticalCount).toBe(1);
    expect(r.piiFlagCount).toBe(3);
  });

  it("qaVerdict يصنّف", () => {
    expect(qaVerdict(80)).toBe("pass");
    expect(qaVerdict(60)).toBe("warn");
    expect(qaVerdict(30)).toBe("fail");
  });
});

// ============================================================
// package-model
// ============================================================

describe("package-model", () => {
  const objects = [
    { type: "entity", sourceId: "e1", data: { name: "المبيعات" } },
    { type: "requirement", sourceId: "r1", data: { statement: "س" } },
  ];
  const relations = [
    { fromType: "entity", fromSourceId: "e1", toType: "requirement", toSourceId: "r1", relationType: "relates" },
  ];

  it("buildPackage يحسب العدّادات والإصدار", () => {
    const pkg = buildPackage({
      projectId: "p", projectName: "مشروع", generatedAt: "2026-07-28T00:00:00Z",
      piiMasked: false, objects, relations,
    });
    expect(pkg.formatVersion).toBe(PACKAGE_FORMAT_VERSION);
    expect(pkg.counts.entity).toBe(1);
    expect(pkg.counts.relations).toBe(1);
  });

  it("validatePackage يقبل حزمة صالحة", () => {
    const pkg = buildPackage({
      projectId: "p", projectName: "م", generatedAt: "t", piiMasked: false, objects, relations,
    });
    const r = validatePackage(JSON.parse(JSON.stringify(pkg)));
    expect(r.ok).toBe(true);
  });

  it("يرفض صيغة أحدث من المدعومة", () => {
    const r = validatePackage({ formatVersion: 99, objects, relations });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("أحدث");
  });

  it("يرفض حزمة بلا كائنات", () => {
    const r = validatePackage({ formatVersion: 1, objects: [], relations: [] });
    expect(r.ok).toBe(false);
  });

  it("يُسقط العلاقة التي طرفها ليس في الحزمة", () => {
    const r = validatePackage({
      formatVersion: 1,
      objects: [{ type: "entity", sourceId: "e1", data: {} }],
      relations: [{ fromType: "entity", fromSourceId: "e1", toType: "entity", toSourceId: "ghost", relationType: "x" }],
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.package.relations).toHaveLength(0);
  });
});
