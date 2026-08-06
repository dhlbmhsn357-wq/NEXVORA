import { describe, it, expect } from "vitest";
import { parseCsvDataset, parseJsonDataset, parseDataset } from "./dataset";
import { levenshtein, similarity, tokenSimilarity, phoneticKey, bestMatchScore, normalizeForMatch } from "./fuzzy-match";
import { validateValue, inferValueKind } from "./validators";
import { normalizeValue } from "./normalization";
import { profileDataset } from "./profiling";
import { assessQuality } from "./dimensions";
import { detectDuplicates, pickKeyField } from "./duplicate-detection";
import { validateReferences, inferLinks } from "./business-validation";
import { rulesForDomain, countRulesByType } from "./rules-engine";
import { buildCleaningBlueprint } from "./cleansing-engine";
import { needsReview, REVIEW_THRESHOLD } from "./confidence";

// ============================================================
describe("dataset", () => {
  it("parseCsvDataset يستخرج الحقول والصفوف", () => {
    const ds = parseCsvDataset("name,email\nAli,ali@x.com\nSara,sara@y.com");
    expect(ds.fields).toEqual(["name", "email"]);
    expect(ds.rows).toHaveLength(2);
    expect(ds.rows[0].name).toBe("Ali");
  });
  it("parseJsonDataset يتعامل مع مصفوفة كائنات", () => {
    const ds = parseJsonDataset(JSON.stringify([{ id: 1, name: "x" }, { id: 2, name: "y" }]));
    expect(ds.rows).toHaveLength(2);
    expect(ds.fields.sort()).toEqual(["id", "name"]);
  });
  it("parseDataset يوجّه حسب النوع", () => {
    expect(parseDataset("csv", "a,b\n1,2").rows).toHaveLength(1);
    expect(parseDataset("json", "[{\"a\":1}]").rows).toHaveLength(1);
  });
});

// ============================================================
describe("fuzzy-match", () => {
  it("levenshtein يحسب المسافة", () => {
    expect(levenshtein("kitten", "sitting")).toBe(3);
    expect(levenshtein("abc", "abc")).toBe(0);
  });
  it("normalizeForMatch يوحّد العربية", () => {
    expect(normalizeForMatch("مُحَمَّد")).toBe("محمد");
    expect(normalizeForMatch("علي  ")).toBe("علي");
  });
  it("يكتشف تشابه الأسماء بأشكال مختلفة", () => {
    expect(bestMatchScore("Mohamed Ali", "Mohamad Aly")).toBeGreaterThanOrEqual(80);
    expect(bestMatchScore("محمد علي", "محمد على")).toBeGreaterThanOrEqual(90);
  });
  it("tokenSimilarity يتحمّل اختلاف ترتيب الكلمات", () => {
    expect(tokenSimilarity("محمد علي", "علي محمد")).toBeGreaterThanOrEqual(0.9);
  });
  it("phoneticKey يعطي نفس البصمة لأسماء متقاربة صوتيًا", () => {
    expect(phoneticKey("Ali")).toBe(phoneticKey("Aly"));
  });
  it("قيم مختلفة تعطي تشابهًا منخفضًا", () => {
    expect(bestMatchScore("Ahmed", "Warehouse")).toBeLessThan(50);
    void similarity;
  });
});

// ============================================================
describe("validators", () => {
  it("inferValueKind من اسم الحقل", () => {
    expect(inferValueKind("customer_email")).toBe("email");
    expect(inferValueKind("mobile")).toBe("phone");
    expect(inferValueKind("created_at")).toBe("date");
  });
  it("email غير صالح يُرصَد", () => {
    expect(validateValue("email", "not-an-email").valid).toBe(false);
    expect(validateValue("email", "a@b.com").valid).toBe(true);
  });
  it("phone قصير جدًا يُرصَد", () => {
    expect(validateValue("phone", "123").valid).toBe(false);
    expect(validateValue("phone", "+201234567890").valid).toBe(true);
  });
  it("date غير قياسي يقترح ISO", () => {
    const r = validateValue("date", "25/12/2023");
    expect(r.valid).toBe(false);
    expect(r.suggestion).toBe("2023-12-25");
  });
  it("country يقترح رمز ISO", () => {
    expect(validateValue("country", "Egypt").suggestion).toBe("EG");
  });
  it("enum خارج القيم يُرصَد", () => {
    expect(validateValue("enum", "PAID", ["paid", "unpaid"]).suggestion).toBe("paid");
    expect(validateValue("enum", "weird", ["paid", "unpaid"]).valid).toBe(false);
  });
});

// ============================================================
describe("normalization", () => {
  it("يوحّد الهاتف والبريد والدولة", () => {
    expect(normalizeValue("phone", "0100 123 4567").value.startsWith("+")).toBe(true);
    expect(normalizeValue("email", "  A@B.COM ").value).toBe("a@b.com");
    expect(normalizeValue("country", "egypt").value).toBe("EG");
  });
  it("Title Case للأسماء", () => {
    expect(normalizeValue("customer_name", "ali hassan").value).toBe("Ali Hassan");
  });
});

// ============================================================
describe("profiling + dimensions", () => {
  const ds = parseCsvDataset("id,name,email\n1,Ali,ali@x.com\n2,,bad\n3,Sara,sara@y.com\n4,Sara,sara@y.com");
  it("profileDataset يحسب nulls/distinct/invalid", () => {
    const p = profileDataset(ds);
    const email = p.fields.find((f) => f.field === "email")!;
    expect(email.invalid).toBe(1); // "bad"
    const name = p.fields.find((f) => f.field === "name")!;
    expect(name.nulls).toBe(1);
  });
  it("assessQuality يعطي درجة عامة", () => {
    const q = assessQuality(profileDataset(ds));
    expect(q.overall).toBeGreaterThan(0);
    expect(q.overall).toBeLessThanOrEqual(100);
    expect(q.completeness).toBeLessThan(100);
  });
});

// ============================================================
describe("duplicate-detection", () => {
  it("يكتشف العملاء المكرّرين بأسماء مختلفة الكتابة", () => {
    const ds = parseCsvDataset("name\nMohamed Ali\nMohamad Aly\nSara Ahmed\nمحمد علي");
    const groups = detectDuplicates(ds, "name");
    expect(groups.length).toBeGreaterThanOrEqual(1);
    const g = groups[0];
    expect(g.members.length).toBeGreaterThanOrEqual(2);
    expect(["merge", "manual_review"]).toContain(g.suggestedAction);
  });
  it("pickKeyField يفضّل الاسم", () => {
    expect(pickKeyField(["id", "customer_name", "x"])).toBe("customer_name");
  });
});

// ============================================================
describe("business-validation", () => {
  const datasets = {
    customers: parseCsvDataset("id,name\n1,Ali\n2,Sara"),
    orders: parseCsvDataset("id,customer_id,total\n1,1,100\n2,99,200\n3,,300"),
  };
  it("inferLinks يستنتج FK", () => {
    const links = inferLinks(datasets);
    expect(links.some((l) => l.childObject === "orders" && l.parentObject === "customers")).toBe(true);
  });
  it("يكتشف السجلّ اليتيم والمرجع الناقص", () => {
    const issues = validateReferences(datasets);
    expect(issues.some((i) => i.type === "orphan_record" && i.value === "99")).toBe(true);
    expect(issues.some((i) => i.type === "missing_reference")).toBe(true);
  });
});

// ============================================================
describe("rules-engine", () => {
  it("rulesForDomain يجمع قواعد المجال والعامّة", () => {
    const rules = rulesForDomain("accounting");
    expect(rules.some((r) => r.key === "invoice_has_customer")).toBe(true);
    expect(rules.some((r) => r.key === "email_valid")).toBe(true); // generic
    const counts = countRulesByType(rules);
    expect(counts.validation + counts.normalization + counts.business + counts.cleaning).toBe(rules.length);
  });
});

// ============================================================
describe("confidence", () => {
  it("العتبة ٩٥ وما دونها يحتاج مراجعة", () => {
    expect(REVIEW_THRESHOLD).toBe(95);
    expect(needsReview(94)).toBe(true);
    expect(needsReview(95)).toBe(false);
  });
});

// ============================================================
describe("cleansing-engine (Cleaning Blueprint)", () => {
  const datasets = {
    customers: parseCsvDataset("id,name,email,country\n1,Mohamed Ali,ali@x.com,Egypt\n2,Mohamad Aly,bad-email,EG\n3,Sara,,SA\n4,Sara,,SA"),
    orders: parseCsvDataset("id,customer_id,total,status\n1,1,100,paid\n2,99,,paid"),
  };
  it("يبني Blueprint كامل حتمي", () => {
    const b1 = buildCleaningBlueprint(datasets, "crm");
    const b2 = buildCleaningBlueprint(datasets, "crm");
    expect(b1.qualityScore).toBe(b2.qualityScore); // حتمي
    expect(b1.stats.records).toBe(6);
    expect(b1.duplicates.length).toBeGreaterThanOrEqual(1); // Mohamed/Mohamad
    expect(b1.stats.invalid).toBeGreaterThan(0); // bad-email
    expect(b1.stats.businessIssues).toBeGreaterThan(0); // orphan customer_id=99
    expect(b1.rules.length).toBeGreaterThan(0);
    expect(b1.recommendations.length).toBeGreaterThan(0);
  });
  it("لا يطبّق شيئًا تلقائيًا — كل التصحيحات مقترَحة", () => {
    const b = buildCleaningBlueprint(datasets, "crm");
    // المشاكل منخفضة الثقة تحتاج مراجعة.
    expect(b.stats.reviewQueue).toBeGreaterThan(0);
  });
});
