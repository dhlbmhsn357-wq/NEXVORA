import { describe, it, expect, beforeAll } from "vitest";
import { parseCsv, parseJson, parseDdl, computeSchemaStats, inferType } from "./schema-model";
import { detectEntities, classifyObject, tokenize } from "./semantic-detection";
import { detectRelationships, detectCircularChains, analyzeDependencies } from "./relationship-intelligence";
import { assessQuality } from "./quality-model";
import { detectRisks, computeRiskScore } from "./risk-model";
import { detectBusinessFlows } from "./business-flow";
import { detectDomains, computeReadiness, estimateComplexity } from "./readiness";
import { analyzeSchema } from "./analysis-engine";
import { parseSourceContent, testConnectionFromContent } from "./connectors";
import { isExecutableNow, isModeSupported, secretFieldKeys } from "./source-types";
import { encryptSecret, decryptSecret, maskSecret, isSecretCryptoConfigured } from "@/lib/security/secret-crypto";

const ERP_DDL = `
CREATE TABLE customers (
  id INT PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  email VARCHAR(200)
);
CREATE TABLE orders (
  id INT PRIMARY KEY,
  customer_id INT NOT NULL,
  total DECIMAL(10,2),
  created_at TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id)
);
CREATE TABLE invoices (
  id INT PRIMARY KEY,
  order_id INT REFERENCES orders(id),
  amount DECIMAL(10,2) NOT NULL
);
CREATE TABLE ghost (
  id INT PRIMARY KEY,
  missing_id INT,
  FOREIGN KEY (missing_id) REFERENCES nonexistent(id)
);
`;

// ============================================================
// schema-model — parsers
// ============================================================

describe("schema-model", () => {
  it("inferType يميّز الأنواع الأساسية", () => {
    expect(inferType("42")).toBe("integer");
    expect(inferType("3.14")).toBe("decimal");
    expect(inferType("true")).toBe("boolean");
    expect(inferType("2024-01-01")).toBe("timestamp");
    expect(inferType("a@b.com")).toBe("email");
  });

  it("parseCsv يستخرج أعمدة وأنواعًا وعدد صفوف", () => {
    const csv = "id,name,age\n1,Ali,30\n2,Sara,25";
    const schema = parseCsv(csv, "people");
    expect(schema.objects).toHaveLength(1);
    expect(schema.objects[0].rowCount).toBe(2);
    const cols = schema.objects[0].columns.map((c) => c.name);
    expect(cols).toEqual(["id", "name", "age"]);
    expect(schema.objects[0].columns.find((c) => c.name === "id")!.isPrimaryKey).toBe(true);
  });

  it("parseCsv يحترم الاقتباس المزدوج مع الفواصل", () => {
    const csv = 'id,label\n1,"a, b, c"';
    const schema = parseCsv(csv, "t");
    expect(schema.objects[0].columns).toHaveLength(2);
    expect(schema.objects[0].rowCount).toBe(1);
  });

  it("parseJson يتعامل مع مصفوفة كائنات", () => {
    const json = JSON.stringify([{ id: 1, name: "x" }, { id: 2, name: "y", extra: true }]);
    const schema = parseJson(json, "records");
    expect(schema.objects[0].columns.map((c) => c.name).sort()).toEqual(["extra", "id", "name"]);
    expect(schema.objects[0].columns.find((c) => c.name === "extra")!.nullable).toBe(true);
  });

  it("parseJson يفكّك كائن جذر بمفاتيح-مصفوفات لكائنات متعددة", () => {
    const json = JSON.stringify({ users: [{ id: 1 }], roles: [{ id: 1, name: "admin" }] });
    const schema = parseJson(json, "root");
    expect(schema.objects.map((o) => o.name).sort()).toEqual(["roles", "users"]);
  });

  it("parseDdl يستخرج جداول وأعمدة ومفاتيح خارجية", () => {
    const schema = parseDdl(ERP_DDL);
    expect(schema.objects.map((o) => o.name).sort()).toEqual(["customers", "ghost", "invoices", "orders"]);
    const orders = schema.objects.find((o) => o.name === "orders")!;
    const custFk = orders.columns.find((c) => c.name === "customer_id")!;
    expect(custFk.isForeignKey).toBe(true);
    expect(custFk.references).toEqual({ table: "customers", column: "id" });
    expect(orders.columns.find((c) => c.name === "id")!.isPrimaryKey).toBe(true);
  });

  it("parseDdl يدعم references المضمّنة في تعريف العمود", () => {
    const schema = parseDdl(ERP_DDL);
    const invoices = schema.objects.find((o) => o.name === "invoices")!;
    expect(invoices.columns.find((c) => c.name === "order_id")!.references).toEqual({ table: "orders", column: "id" });
  });

  it("computeSchemaStats يجمع الأعمدة والجداول", () => {
    const stats = computeSchemaStats(parseDdl(ERP_DDL));
    expect(stats.tables).toBe(4);
    expect(stats.columns).toBeGreaterThan(8);
  });
});

// ============================================================
// semantic-detection
// ============================================================

describe("semantic-detection", () => {
  it("tokenize يفصل snake/camel ويزيل الضوضاء", () => {
    expect(tokenize("tbl_CustomerOrders")).toEqual(["customer", "orders"]);
  });

  it("يطابق مرادفات مختلفة لنفس الكيان", () => {
    for (const name of ["customers", "tbl_customer", "crm_client", "clients"]) {
      const hit = classifyObject({ name, kind: "table", schema: null, columns: [], rowCount: null });
      expect(hit?.spec.entity).toBe("customer");
    }
  });

  it("يدمج جداول متعددة في كيان واحد", () => {
    const schema = parseDdl("CREATE TABLE customers (id INT PRIMARY KEY); CREATE TABLE crm_client (id INT PRIMARY KEY);");
    const entities = detectEntities(schema);
    const customer = entities.find((e) => e.entity === "customer")!;
    expect(customer.sourceObjects.sort()).toEqual(["crm_client", "customers"]);
  });

  it("يصنّف الكائن غير المعروف بطبقة بيانات مستنتَجة", () => {
    const entities = detectEntities(parseDdl("CREATE TABLE zzz_widget (id INT PRIMARY KEY);"));
    const unknown = entities.find((e) => e.displayName === "zzz_widget")!;
    expect(unknown.entity).toBe("unknown");
    expect(unknown.dataClass).toBe("reference");
  });

  it("جدول باسم يحمل log يُصنَّف سجلّ تدقيق دلاليًا", () => {
    const entities = detectEntities(parseDdl("CREATE TABLE activity_log (id INT PRIMARY KEY);"));
    expect(entities.some((e) => e.entity === "audit_log")).toBe(true);
  });
});

// ============================================================
// relationship-intelligence
// ============================================================

describe("relationship-intelligence", () => {
  it("يكتشف parent_child من مفتاح خارجي صريح", () => {
    const rels = detectRelationships(parseDdl(ERP_DDL));
    const oc = rels.find((r) => r.from === "orders" && r.to === "customers");
    expect(oc?.kind).toBe("parent_child");
  });

  it("يعلّم المفتاح الخارجي المكسور broken", () => {
    const rels = detectRelationships(parseDdl(ERP_DDL));
    expect(rels.some((r) => r.from === "ghost" && r.kind === "broken")).toBe(true);
  });

  it("يكتشف الدورات", () => {
    const cyclic = parseDdl(`
      CREATE TABLE a (id INT PRIMARY KEY, b_id INT REFERENCES b(id));
      CREATE TABLE b (id INT PRIMARY KEY, a_id INT REFERENCES a(id));
    `);
    const chains = detectCircularChains(detectRelationships(cyclic));
    expect(chains.length).toBeGreaterThan(0);
  });

  it("analyzeDependencies يصنّف الجداول الحرجة وغير المستخدمة", () => {
    const deps = analyzeDependencies(parseDdl(ERP_DDL + "CREATE TABLE lonely (id INT PRIMARY KEY);"));
    expect(deps.unusedTables).toContain("lonely");
    expect(deps.criticalTables).toBeDefined();
  });
});

// ============================================================
// quality / risk / readiness / flows
// ============================================================

describe("quality/risk/readiness", () => {
  it("assessQuality يعاقب المفاتيح الخارجية المكسورة على السلامة", () => {
    const schema = parseDdl(ERP_DDL);
    const deps = analyzeDependencies(schema);
    const q = assessQuality({ schema, dependencies: deps });
    expect(q.integrity).toBeLessThan(100);
    expect(q.overall).toBeGreaterThan(0);
  });

  it("detectRisks يرصد المفتاح الخارجي المكسور كخطر حرج", () => {
    const schema = parseDdl(ERP_DDL);
    const risks = detectRisks({ schema, dependencies: analyzeDependencies(schema) });
    const broken = risks.find((r) => r.code === "broken_foreign_keys");
    expect(broken?.severity).toBe("critical");
    expect(computeRiskScore(risks)).toBeGreaterThan(0);
  });

  it("detectDomains يستنتج المجال من الكيانات", () => {
    const entities = detectEntities(parseDdl(ERP_DDL));
    const domains = detectDomains(entities);
    expect(domains.domains.length).toBeGreaterThan(0);
    expect(domains.systemType).toBeTruthy();
  });

  it("detectBusinessFlows يكتشف دورة المبيعات", () => {
    const entities = detectEntities(parseDdl(ERP_DDL));
    const flows = detectBusinessFlows(entities);
    expect(flows.some((f) => f.name === "دورة المبيعات")).toBe(true);
  });

  it("computeReadiness يعطي درجة وتفسيرًا وقائمة مراجعة", () => {
    const schema = parseDdl(ERP_DDL);
    const deps = analyzeDependencies(schema);
    const entities = detectEntities(schema);
    const quality = assessQuality({ schema, dependencies: deps });
    const risks = detectRisks({ schema, dependencies: deps });
    const r = computeReadiness({ schema, entities, dependencies: deps, quality, risks });
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
    expect(r.explanation).toContain("الجاهزية");
    expect(r.humanReviewNeeded.length).toBeGreaterThan(0); // بسبب FK المكسور
  });

  it("computeReadiness على بنية فارغة = غير جاهز", () => {
    const r = computeReadiness({
      schema: { objects: [], dialect: null, encoding: null, collation: null },
      entities: [],
      dependencies: { relationships: [], circularChains: [], criticalTables: [], coreEntities: [], sharedTables: [], unusedTables: [], deadTables: [] },
      quality: { completeness: 0, consistency: 0, integrity: 0, structure: 0, overall: 0, signals: [] },
      risks: [],
    });
    expect(r.level).toBe("not_ready");
    expect(r.score).toBe(0);
  });

  it("estimateComplexity يعلو مع عدد الجداول والعلاقات", () => {
    const schema = parseDdl(ERP_DDL);
    expect(estimateComplexity(schema, analyzeDependencies(schema))).toBeTruthy();
  });
});

// ============================================================
// analysis-engine (التركيب الكامل)
// ============================================================

describe("analysis-engine", () => {
  it("analyzeSchema يرجّع تحليلًا كاملًا حتميًا", () => {
    const a1 = analyzeSchema(parseDdl(ERP_DDL));
    const a2 = analyzeSchema(parseDdl(ERP_DDL));
    expect(a1.entities.length).toBe(a2.entities.length);
    expect(a1.readiness.score).toBe(a2.readiness.score); // حتمي
    expect(a1.stats.tables).toBe(4);
    expect(a1.domains.domains.length).toBeGreaterThan(0);
    expect(a1.risks.some((r) => r.code === "broken_foreign_keys")).toBe(true);
  });
});

// ============================================================
// connectors
// ============================================================

describe("connectors", () => {
  it("parseSourceContent يوجّه DDL عبر schema_upload", () => {
    const r = parseSourceContent("postgresql", "schema_upload", ERP_DDL);
    expect(r.ok).toBe(true);
    expect(r.schema.objects.length).toBe(4);
  });

  it("parseSourceContent يوجّه CSV عبر file_upload", () => {
    const r = parseSourceContent("csv", "file_upload", "id,name\n1,x");
    expect(r.ok).toBe(true);
  });

  it("testConnectionFromContent للاتصال الحيّ = غير مُهيَّأ بأمان بلا رمي", () => {
    const t = testConnectionFromContent("postgresql", "live_connection", "");
    expect(t.configured).toBe(false);
    expect(t.ok).toBe(false);
    expect(t.issues[0]).toContain("غير مفعَّل");
  });

  it("testConnectionFromContent لملف صالح ناجح", () => {
    const t = testConnectionFromContent("csv", "file_upload", "id,name\n1,x");
    expect(t.ok).toBe(true);
    expect(t.tableCount).toBe(1);
  });
});

// ============================================================
// source-types catalog
// ============================================================

describe("source-types", () => {
  it("الملفات قابلة للتنفيذ اليوم، والاتصال الحيّ للقواعد لا", () => {
    expect(isExecutableNow("csv", "file_upload")).toBe(true);
    expect(isExecutableNow("postgresql", "schema_upload")).toBe(true);
    expect(isExecutableNow("postgresql", "live_connection")).toBe(false);
  });

  it("isModeSupported يحترم أوضاع كل نوع", () => {
    expect(isModeSupported("csv", "file_upload")).toBe(true);
    expect(isModeSupported("csv", "live_connection")).toBe(false);
  });

  it("secretFieldKeys يعيد الحقول السرّية فقط", () => {
    expect(secretFieldKeys("postgresql")).toContain("password");
    expect(secretFieldKeys("csv")).toEqual([]);
  });
});

// ============================================================
// secret-crypto (roundtrip)
// ============================================================

describe("secret-crypto", () => {
  beforeAll(() => {
    process.env.MIGRATION_SECRET_KEY = "test-key-for-unit-tests-only-not-prod";
  });

  it("مُهيَّأ عند وجود المفتاح", () => {
    expect(isSecretCryptoConfigured()).toBe(true);
  });

  it("encrypt/decrypt roundtrip", () => {
    const secret = "postgres://user:p@ssw0rd@db:5432/prod";
    const enc = encryptSecret(secret);
    expect(enc).toMatch(/^v1:/);
    expect(enc).not.toContain("p@ssw0rd");
    expect(decryptSecret(enc)).toBe(secret);
  });

  it("نفس النصّ يعطي تشفيرًا مختلفًا (IV عشوائي)", () => {
    expect(encryptSecret("same")).not.toBe(encryptSecret("same"));
  });

  it("فكّ بيانات متلاعَب بها يفشل", () => {
    const enc = encryptSecret("secret");
    const tampered = enc.slice(0, -4) + "AAAA";
    expect(() => decryptSecret(tampered)).toThrow();
  });

  it("maskSecret يُبقي ذيلًا قصيرًا فقط", () => {
    expect(maskSecret("supersecretvalue")).toMatch(/•+alue$/);
    expect(maskSecret("")).toBe("");
  });
});
