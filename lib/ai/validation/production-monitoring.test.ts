import { describe, expect, it } from "vitest";
import { validateIncidentAnalysis } from "./production-monitoring";

function validIncidentsPayload(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    incidents: [
      {
        incident_key: "homepage-slow-response",
        category: "performance",
        severity: "high",
        title: "بطء واضح في استجابة الصفحة الرئيسية",
        description: "زمن الاستجابة تجاوز 3 ثواني على الصفحة الرئيسية بشكل متكرر.",
        root_cause: "غير واضح من الأدلة المتاحة حاليًا — محتاج فحص لوجات الـ Backend.",
        confidence_score: 65,
        patch_proposal: "",
        refactoring_proposal: "",
        performance_proposal: "إضافة caching على مستوى الـ CDN.",
        security_proposal: "",
        ux_proposal: "",
        similar_past_incident_index: null,
        similarity_reason: "",
        ...overrides,
      },
    ],
  });
}

describe("validateIncidentAnalysis", () => {
  it("يرفض رد فاضي أو null", () => {
    expect(validateIncidentAnalysis(null).ok).toBe(false);
    expect(validateIncidentAnalysis("").ok).toBe(false);
    expect(validateIncidentAnalysis("   ").ok).toBe(false);
  });

  it("يرفض JSON غير صالح", () => {
    expect(validateIncidentAnalysis("not json at all").ok).toBe(false);
  });

  it("يرفض لو الرد مصفوفة مش كائن", () => {
    expect(validateIncidentAnalysis("[]").ok).toBe(false);
  });

  it("يرفض لو incidents مفقود أو مش مصفوفة", () => {
    expect(validateIncidentAnalysis(JSON.stringify({})).ok).toBe(false);
    expect(validateIncidentAnalysis(JSON.stringify({ incidents: "not-an-array" })).ok).toBe(false);
  });

  it("يقبل incidents فاضية (مفيش مشاكل مكتشفة)", () => {
    const result = validateIncidentAnalysis(JSON.stringify({ incidents: [] }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toEqual([]);
  });

  it("يقبل incident صالح كامل ويحافظ على كل الحقول", () => {
    const result = validateIncidentAnalysis(validIncidentsPayload());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toHaveLength(1);
      const incident = result.data[0];
      expect(incident.incident_key).toBe("homepage-slow-response");
      expect(incident.category).toBe("performance");
      expect(incident.severity).toBe("high");
      expect(incident.confidence_score).toBe(65);
      expect(incident.similar_past_incident_index).toBeNull();
    }
  });

  it("يرفض category غير مدعوم", () => {
    expect(validateIncidentAnalysis(validIncidentsPayload({ category: "not_real" })).ok).toBe(false);
  });

  it("يرفض severity غير مدعوم", () => {
    expect(validateIncidentAnalysis(validIncidentsPayload({ severity: "catastrophic" })).ok).toBe(false);
  });

  it("يرفض incident_key أو title أو description أو root_cause الفاضيين", () => {
    expect(validateIncidentAnalysis(validIncidentsPayload({ incident_key: "" })).ok).toBe(false);
    expect(validateIncidentAnalysis(validIncidentsPayload({ title: "  " })).ok).toBe(false);
    expect(validateIncidentAnalysis(validIncidentsPayload({ description: "" })).ok).toBe(false);
    expect(validateIncidentAnalysis(validIncidentsPayload({ root_cause: "" })).ok).toBe(false);
  });

  it("يرفض confidence_score خارج نطاق 0-100", () => {
    expect(validateIncidentAnalysis(validIncidentsPayload({ confidence_score: -1 })).ok).toBe(false);
    expect(validateIncidentAnalysis(validIncidentsPayload({ confidence_score: 101 })).ok).toBe(false);
    expect(validateIncidentAnalysis(validIncidentsPayload({ confidence_score: "not-a-number" })).ok).toBe(false);
  });

  it("يقبل الحقول الاختيارية (proposals) الفاضية ويحوّلها لسلسلة فاضية", () => {
    const payload = validIncidentsPayload({ patch_proposal: undefined, ux_proposal: null });
    const result = validateIncidentAnalysis(payload);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data[0].patch_proposal).toBe("");
      expect(result.data[0].ux_proposal).toBe("");
    }
  });

  it("يرفض similar_past_incident_index سالب أو غير رقمي", () => {
    expect(validateIncidentAnalysis(validIncidentsPayload({ similar_past_incident_index: -1 })).ok).toBe(false);
    expect(validateIncidentAnalysis(validIncidentsPayload({ similar_past_incident_index: "abc" })).ok).toBe(false);
  });

  it("يقبل similar_past_incident_index رقم صحيح صالح مع similarity_reason", () => {
    const result = validateIncidentAnalysis(
      validIncidentsPayload({ similar_past_incident_index: 2, similarity_reason: "نفس نمط بطء الاستجابة اللي حصل الأسبوع اللي فات." })
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data[0].similar_past_incident_index).toBe(2);
      expect(result.data[0].similarity_reason).toContain("بطء");
    }
  });

  it("يقبل الحقول الغنية الجديدة (affected_components/risk_level/workaround/...) ويحافظ عليها", () => {
    const result = validateIncidentAnalysis(
      validIncidentsPayload({
        affected_components: ["checkout-api", "orders-db"],
        risk_level: "high",
        workaround: "إعادة تشغيل الـ Worker يدويًا مؤقتًا",
        permanent_solution: "إضافة فهرس + connection pooling",
        estimated_fix_time_hours: 3.5,
        priority: "critical",
        affected_users_estimate: "حوالي 200 مستخدم نشط",
      })
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      const incident = result.data[0];
      expect(incident.affected_components).toEqual(["checkout-api", "orders-db"]);
      expect(incident.risk_level).toBe("high");
      expect(incident.workaround).toBe("إعادة تشغيل الـ Worker يدويًا مؤقتًا");
      expect(incident.permanent_solution).toBe("إضافة فهرس + connection pooling");
      expect(incident.estimated_fix_time_hours).toBe(3.5);
      expect(incident.priority).toBe("critical");
      expect(incident.affected_users_estimate).toBe("حوالي 200 مستخدم نشط");
    }
  });

  it("يتجاهل risk_level/priority غير صالحين (يرجعوا null) بدل ما يفشل التحقق كله", () => {
    const result = validateIncidentAnalysis(validIncidentsPayload({ risk_level: "catastrophic", priority: "urgent" }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data[0].risk_level).toBeNull();
      expect(result.data[0].priority).toBeNull();
    }
  });

  it("الحقول الغنية غير موجودة أصلًا → قيم افتراضية آمنة (مصفوفة/سلسلة فاضية أو null)", () => {
    const result = validateIncidentAnalysis(validIncidentsPayload());
    expect(result.ok).toBe(true);
    if (result.ok) {
      const incident = result.data[0];
      expect(incident.affected_components).toEqual([]);
      expect(incident.risk_level).toBeNull();
      expect(incident.workaround).toBe("");
      expect(incident.permanent_solution).toBe("");
      expect(incident.estimated_fix_time_hours).toBeNull();
      expect(incident.priority).toBeNull();
      expect(incident.affected_users_estimate).toBe("");
    }
  });

  it("يرفض أول incident غير صالح في مصفوفة فيها أكتر من incident واحد", () => {
    const payload = JSON.stringify({
      incidents: [
        { incident_key: "ok-one", category: "api", severity: "low", title: "t", description: "d", root_cause: "r", confidence_score: 50 },
        { incident_key: "", category: "api", severity: "low", title: "t2", description: "d2", root_cause: "r2", confidence_score: 50 },
      ],
    });
    expect(validateIncidentAnalysis(payload).ok).toBe(false);
  });
});
