import { describe, it, expect } from "vitest";
import { parseDdl } from "@/lib/migration-discovery/schema-model";
import { analyzeDependencies } from "@/lib/migration-discovery/relationship-intelligence";
import { getCanonicalEntity, canonicalEntityLabel, isMappableEntity } from "./canonical-model";
import { matchEntities } from "./entity-matcher";
import { matchFields, detectSplitMerge } from "./field-matcher";
import { inferTransformation } from "./transformation-rules";
import { mapRelationships } from "./relationship-mapper";
import { detectConflicts } from "./conflict-detector";
import { detectSourceSignature } from "./templates";
import { needsReview, confidenceBand, AUTO_APPROVE_THRESHOLD } from "./confidence";
import { buildBlueprint, summarizeBlueprint } from "./blueprint";

const SHOP_DDL = `
CREATE TABLE tbl_customer (
  id INT PRIMARY KEY,
  customer_name VARCHAR(200) NOT NULL,
  email VARCHAR(200),
  mobile VARCHAR(50),
  created_on DATETIME
);
CREATE TABLE crm_client (
  id INT PRIMARY KEY,
  full_name VARCHAR(200),
  city VARCHAR(100)
);
CREATE TABLE orders (
  id INT PRIMARY KEY,
  customer_id INT REFERENCES tbl_customer(id),
  grand_total DECIMAL(10,2),
  status VARCHAR(30),
  payment_status VARCHAR(30),
  order_date DATE
);
CREATE TABLE zzz_mystery (
  id INT PRIMARY KEY,
  blob_data VARCHAR(50)
);
`;

function analyze(ddl: string) {
  const schema = parseDdl(ddl);
  return { schema, deps: analyzeDependencies(schema) };
}

// ============================================================
describe("canonical-model", () => {
  it("يعرّف كيان العميل بحقوله", () => {
    const c = getCanonicalEntity("customer");
    expect(c).toBeDefined();
    expect(c!.fields.some((f) => f.key === "email")).toBe(true);
    expect(canonicalEntityLabel("customer")).toBe("العميل");
  });
  it("isMappableEntity يميّز الكيانات المعرَّفة", () => {
    expect(isMappableEntity("customer")).toBe(true);
    expect(isMappableEntity("unknown")).toBe(false);
  });
});

// ============================================================
describe("entity-matcher", () => {
  it("يربط جداول قديمة متعددة بكيان قياسي واحد (بالمعنى لا الاسم)", () => {
    const { schema } = analyze(SHOP_DDL);
    const { mappings } = matchEntities(schema);
    const customer = mappings.find((m) => m.canonicalEntity === "customer");
    expect(customer).toBeDefined();
    expect(customer!.oldObjects.sort()).toEqual(["crm_client", "tbl_customer"]);
  });
  it("يعرض الجداول التي لا نظير لها بدل تجاهلها", () => {
    const { schema } = analyze(SHOP_DDL);
    const { unmapped } = matchEntities(schema);
    expect(unmapped.some((u) => u.object === "zzz_mystery")).toBe(true);
  });
});

// ============================================================
describe("field-matcher", () => {
  it("يطابق الأعمدة بحقول قياسية دلاليًا", () => {
    const { schema } = analyze(SHOP_DDL);
    const custObj = schema.objects.find((o) => o.name === "tbl_customer")!;
    const fields = matchFields(custObj, "customer");
    expect(fields.find((f) => f.oldField === "customer_name")!.newField).toBe("name");
    expect(fields.find((f) => f.oldField === "email")!.newField).toBe("email");
    expect(fields.find((f) => f.oldField === "mobile")!.newField).toBe("phone");
  });
  it("يقترح تحويلًا للهاتف والتاريخ", () => {
    const { schema } = analyze(SHOP_DDL);
    const custObj = schema.objects.find((o) => o.name === "tbl_customer")!;
    const fields = matchFields(custObj, "customer");
    expect(fields.find((f) => f.oldField === "mobile")!.transformation.kind).toBe("phone_formatting");
    // datetime → timestamp لا يحتاج تحويلًا؛ لكن نصّ → تاريخ يحتاج date_conversion.
    expect(fields.find((f) => f.oldField === "created_on")!.transformation.kind).toBe("none");
    const textDate = inferTransformation(
      { name: "join_date", dataType: "varchar", nullable: true, isPrimaryKey: false, isForeignKey: false, isAutoIncrement: false, defaultValue: null, references: null },
      { key: "hire_date", label: "تاريخ", type: "date", synonyms: [] }
    );
    expect(textDate.kind).toBe("date_conversion");
  });
  it("detectSplitMerge يكتشف multi_source عبر جداول", () => {
    const { schema } = analyze(SHOP_DDL);
    let all = [
      ...matchFields(schema.objects.find((o) => o.name === "tbl_customer")!, "customer"),
      ...matchFields(schema.objects.find((o) => o.name === "crm_client")!, "customer"),
    ];
    all = detectSplitMerge(all);
    // name يأتي من customer_name (tbl_customer) و full_name (crm_client).
    const nameMappings = all.filter((f) => f.newField === "name");
    expect(nameMappings.length).toBeGreaterThanOrEqual(2);
    expect(nameMappings.every((m) => m.kind === "multi_source")).toBe(true);
  });
});

// ============================================================
describe("transformation-rules", () => {
  it("يستنتج boolean_mapping مع خريطة قيم", () => {
    const rule = inferTransformation(
      { name: "active", dataType: "int", nullable: false, isPrimaryKey: false, isForeignKey: false, isAutoIncrement: false, defaultValue: null, references: null },
      { key: "is_active", label: "نشط", type: "boolean", synonyms: [] }
    );
    expect(rule.kind).toBe("boolean_mapping");
    expect(rule.valueMap).toBeDefined();
  });
  it("يستنتج status_mapping لأعمدة الحالة", () => {
    const rule = inferTransformation(
      { name: "status", dataType: "varchar", nullable: true, isPrimaryKey: false, isForeignKey: false, isAutoIncrement: false, defaultValue: null, references: null },
      { key: "status", label: "الحالة", type: "enum", synonyms: [], enumValues: ["draft", "completed"] }
    );
    expect(rule.kind).toBe("status_mapping");
  });
});

// ============================================================
describe("relationship-mapper", () => {
  it("يترجم parent_child إلى one_to_many بين الكيانات", () => {
    const { schema, deps } = analyze(SHOP_DDL);
    const { mappings } = matchEntities(schema);
    const rels = mapRelationships(deps.relationships, mappings);
    const oc = rels.find((r) => r.fromObject === "orders" && r.toObject === "tbl_customer");
    expect(oc?.newKind).toBe("one_to_many");
    expect(oc?.fromEntity).toBe("order");
    expect(oc?.toEntity).toBe("customer");
  });
});

// ============================================================
describe("conflict-detector", () => {
  it("يرصد الحقول غير المطابَقة والجداول غير المستخدمة", () => {
    const { schema } = analyze(SHOP_DDL);
    const { mappings, unmapped } = matchEntities(schema);
    const fields = schema.objects.flatMap((o) => {
      const em = mappings.find((m) => m.oldObjects.includes(o.name));
      return em ? matchFields(o, em.canonicalEntity) : [];
    });
    const conflicts = detectConflicts(mappings, fields, unmapped);
    expect(conflicts.some((c) => c.type === "unused_old" && c.subject === "zzz_mystery")).toBe(true);
  });
});

// ============================================================
describe("templates", () => {
  it("يكتشف بصمة Odoo", () => {
    const schema = parseDdl("CREATE TABLE res_partner (id INT PRIMARY KEY); CREATE TABLE sale_order (id INT PRIMARY KEY);");
    const sig = detectSourceSignature(schema);
    expect(sig?.key).toBe("odoo_to_erp");
  });
  it("لا بصمة لأسماء عامة", () => {
    expect(detectSourceSignature(parseDdl("CREATE TABLE customers (id INT PRIMARY KEY);"))).toBeNull();
  });
});

// ============================================================
describe("confidence", () => {
  it("العتبة ٩٠ وما دونها يحتاج مراجعة", () => {
    expect(AUTO_APPROVE_THRESHOLD).toBe(90);
    expect(needsReview(89)).toBe(true);
    expect(needsReview(90)).toBe(false);
    expect(confidenceBand(95)).toBe("high");
    expect(confidenceBand(70)).toBe("medium");
    expect(confidenceBand(40)).toBe("low");
  });
});

// ============================================================
describe("blueprint", () => {
  it("يبني مخطّطًا كاملًا حتميًا", () => {
    const { schema, deps } = analyze(SHOP_DDL);
    const b1 = buildBlueprint({ schema, dependencies: deps });
    const b2 = buildBlueprint({ schema, dependencies: deps });
    expect(b1.stats.confidenceAvg).toBe(b2.stats.confidenceAvg); // حتمي
    expect(b1.entityMappings.length).toBeGreaterThan(0);
    expect(b1.stats.mappedFields).toBeGreaterThan(0);
    expect(b1.stats.objects).toBe(4);
    // business rule من orders (status + payment_status)
    expect(b1.businessRules.length).toBeGreaterThan(0);
    // recommendations + complexity present
    expect(b1.recommendations.length).toBeGreaterThan(0);
    expect(["low", "medium", "high", "very_high"]).toContain(b1.complexity);
  });
  it("summarizeBlueprint ينتج نصًّا للـAI", () => {
    const { schema, deps } = analyze(SHOP_DDL);
    const text = summarizeBlueprint(buildBlueprint({ schema, dependencies: deps }));
    expect(text).toContain("الكيانات");
    expect(text).toContain("الحقول");
  });
});
