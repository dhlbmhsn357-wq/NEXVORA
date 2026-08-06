import type { NormalizedObject, NormalizedSchema } from "./schema-model";

/**
 * الكشف الدلالي — **وحدة نقية بلا I/O**.
 *
 * لا نعتمد على أسماء الجداول حرفيًا. «tbl_customer / clients / crm_client
 * / customers» كلها تمثّل كيان **Customer** واحدًا. نفهم المعنى عبر قاموس
 * مرادفات + تسجيل، ونصنّف كل كيان (master/transactional/reference/...).
 */

export type CanonicalEntity =
  | "customer" | "supplier" | "employee" | "user" | "product" | "order"
  | "invoice" | "payment" | "receipt" | "quotation" | "purchase" | "inventory"
  | "asset" | "department" | "role" | "permission" | "account" | "transaction"
  | "category" | "location" | "shipment" | "contract" | "ticket" | "appointment"
  | "student" | "course" | "enrollment" | "patient" | "prescription"
  | "audit_log" | "setting" | "unknown";

export type DataClass =
  | "master" | "reference" | "transactional" | "configuration"
  | "audit" | "log" | "historical" | "temporary" | "unknown";

interface EntitySpec {
  entity: CanonicalEntity;
  display: string;
  dataClass: DataClass;
  /** كلمات مفتاحية (مفردة/جمع، عربي/إنجليزي) — تُطابَق كـtokens. */
  keywords: string[];
}

const ENTITY_SPECS: EntitySpec[] = [
  { entity: "customer", display: "العملاء", dataClass: "master", keywords: ["customer", "customers", "client", "clients", "crm", "buyer", "عميل", "عملاء", "زبون"] },
  { entity: "supplier", display: "الموردون", dataClass: "master", keywords: ["supplier", "suppliers", "vendor", "vendors", "مورد", "موردين"] },
  { entity: "employee", display: "الموظفون", dataClass: "master", keywords: ["employee", "employees", "staff", "worker", "hr", "payroll", "موظف", "موظفين"] },
  { entity: "user", display: "المستخدمون", dataClass: "master", keywords: ["user", "users", "account", "login", "member", "مستخدم"] },
  { entity: "product", display: "المنتجات", dataClass: "master", keywords: ["product", "products", "item", "items", "sku", "goods", "منتج", "صنف", "أصناف"] },
  { entity: "order", display: "الطلبات", dataClass: "transactional", keywords: ["order", "orders", "sale", "sales", "cart", "طلب", "طلبات", "مبيعات"] },
  { entity: "invoice", display: "الفواتير", dataClass: "transactional", keywords: ["invoice", "invoices", "bill", "bills", "billing", "فاتورة", "فواتير"] },
  { entity: "payment", display: "المدفوعات", dataClass: "transactional", keywords: ["payment", "payments", "pay", "دفعة", "مدفوعات", "سداد"] },
  { entity: "receipt", display: "الإيصالات", dataClass: "transactional", keywords: ["receipt", "receipts", "voucher", "إيصال", "سند"] },
  { entity: "quotation", display: "عروض الأسعار", dataClass: "transactional", keywords: ["quotation", "quote", "quotes", "estimate", "عرض", "تسعير"] },
  { entity: "purchase", display: "المشتريات", dataClass: "transactional", keywords: ["purchase", "purchases", "po", "procurement", "مشتريات", "شراء"] },
  { entity: "inventory", display: "المخزون", dataClass: "transactional", keywords: ["inventory", "stock", "warehouse", "مخزون", "مستودع"] },
  { entity: "asset", display: "الأصول", dataClass: "master", keywords: ["asset", "assets", "equipment", "أصل", "أصول"] },
  { entity: "department", display: "الأقسام", dataClass: "reference", keywords: ["department", "departments", "dept", "division", "قسم", "أقسام", "إدارة"] },
  { entity: "role", display: "الأدوار", dataClass: "configuration", keywords: ["role", "roles", "group", "دور", "أدوار"] },
  { entity: "permission", display: "الصلاحيات", dataClass: "configuration", keywords: ["permission", "permissions", "acl", "privilege", "صلاحية", "صلاحيات"] },
  { entity: "account", display: "الحسابات المحاسبية", dataClass: "reference", keywords: ["account", "accounts", "ledger", "gl", "chart", "حساب", "حسابات", "دليل"] },
  { entity: "transaction", display: "القيود/الحركات", dataClass: "transactional", keywords: ["transaction", "transactions", "entry", "journal", "قيد", "حركة", "قيود"] },
  { entity: "category", display: "التصنيفات", dataClass: "reference", keywords: ["category", "categories", "type", "types", "تصنيف", "فئة"] },
  { entity: "location", display: "المواقع", dataClass: "reference", keywords: ["location", "locations", "branch", "city", "region", "موقع", "فرع", "مدينة"] },
  { entity: "shipment", display: "الشحنات", dataClass: "transactional", keywords: ["shipment", "shipping", "delivery", "شحنة", "توصيل"] },
  { entity: "contract", display: "العقود", dataClass: "master", keywords: ["contract", "contracts", "agreement", "عقد", "عقود"] },
  { entity: "ticket", display: "التذاكر", dataClass: "transactional", keywords: ["ticket", "tickets", "support", "issue", "تذكرة", "دعم"] },
  { entity: "appointment", display: "المواعيد", dataClass: "transactional", keywords: ["appointment", "appointments", "booking", "reservation", "موعد", "حجز"] },
  { entity: "student", display: "الطلاب", dataClass: "master", keywords: ["student", "students", "pupil", "طالب", "طلاب"] },
  { entity: "course", display: "المقررات", dataClass: "master", keywords: ["course", "courses", "class", "subject", "مقرر", "مادة", "فصل"] },
  { entity: "enrollment", display: "التسجيلات", dataClass: "transactional", keywords: ["enrollment", "enroll", "registration", "تسجيل", "قيد"] },
  { entity: "patient", display: "المرضى", dataClass: "master", keywords: ["patient", "patients", "مريض", "مرضى"] },
  { entity: "prescription", display: "الوصفات", dataClass: "transactional", keywords: ["prescription", "prescriptions", "diagnosis", "وصفة", "تشخيص"] },
  { entity: "audit_log", display: "سجلّ التدقيق", dataClass: "audit", keywords: ["audit", "auditlog", "history", "log", "logs", "activity", "تدقيق", "سجل"] },
  { entity: "setting", display: "الإعدادات", dataClass: "configuration", keywords: ["setting", "settings", "config", "configuration", "option", "إعداد", "إعدادات"] },
];

/** بادئات/لواحق شائعة تُزال قبل المطابقة. */
const NOISE_TOKENS = new Set(["tbl", "table", "tb", "t", "sys", "dbo", "public", "data", "master", "dim", "fact", "vw", "view", "ref"]);

/** يفكّك اسم كائن إلى tokens مطبَّعة (يفصل snake/camel/kebab). */
export function tokenize(name: string): string[] {
  return name
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .split(/[\s_\-.]+/)
    .map((t) => t.toLowerCase().trim())
    .filter((t) => t.length > 0 && !NOISE_TOKENS.has(t));
}

/** يجرّد لاحقة الجمع البسيطة للمطابقة (customers→customer). */
function singularize(t: string): string {
  if (t.length > 4 && t.endsWith("ies")) return t.slice(0, -3) + "y";
  if (t.length > 3 && t.endsWith("s") && !t.endsWith("ss")) return t.slice(0, -1);
  return t;
}

export interface DetectedEntity {
  entity: CanonicalEntity;
  displayName: string;
  dataClass: DataClass;
  sourceObjects: string[];
  confidence: number;
}

/**
 * يطابق كائنًا واحدًا مع أفضل كيان قياسي. يعيد null لو لا تطابق واثق.
 * الثقة تعلو مع تطابق token كامل ومع دلائل الأعمدة.
 */
export function classifyObject(object: NormalizedObject): { spec: EntitySpec; confidence: number } | null {
  const tokens = new Set(tokenize(object.name).map(singularize));
  let best: { spec: EntitySpec; score: number } | null = null;

  for (const spec of ENTITY_SPECS) {
    let score = 0;
    for (const kw of spec.keywords) {
      const k = singularize(kw.toLowerCase());
      if (tokens.has(k)) score += 3;
      else if ([...tokens].some((t) => t.includes(k) || k.includes(t))) score += 1;
    }
    if (score > 0 && (!best || score > best.score)) best = { spec, score };
  }

  if (!best) return null;
  const confidence = Math.min(95, 40 + best.score * 12);
  return { spec: best.spec, confidence };
}

/** يصنّف الطبقة الافتراضية لكائن غير معروف من دلائل بنيوية. */
export function inferDataClass(object: NormalizedObject): DataClass {
  const tokens = tokenize(object.name);
  if (tokens.some((t) => ["log", "logs", "audit", "history", "activity"].includes(t))) return "audit";
  if (tokens.some((t) => ["temp", "tmp", "staging", "stage"].includes(t))) return "temporary";
  if (tokens.some((t) => ["config", "setting", "settings", "option", "param"].includes(t))) return "configuration";
  const cols = object.columns.length;
  const hasFk = object.columns.some((c) => c.isForeignKey);
  const hasAmountsOrDates = object.columns.some((c) => /(amount|total|price|date|time|qty|quantity)/i.test(c.name));
  if (hasFk && hasAmountsOrDates) return "transactional";
  if (cols <= 4 && !hasFk) return "reference";
  return "master";
}

/**
 * الكشف الدلالي الكامل: يمرّ على كل كائنات البنية، يطابق كلًّا مع كيان
 * قياسي، ويدمج الكائنات المتعدّدة لنفس الكيان في صفّ واحد (customers +
 * crm_client → كيان Customer من جدولين).
 */
export function detectEntities(schema: NormalizedSchema): DetectedEntity[] {
  const byEntity = new Map<CanonicalEntity, DetectedEntity>();
  const unmatched: DetectedEntity[] = [];

  for (const obj of schema.objects) {
    const hit = classifyObject(obj);
    if (hit) {
      const existing = byEntity.get(hit.spec.entity);
      if (existing) {
        existing.sourceObjects.push(obj.name);
        existing.confidence = Math.max(existing.confidence, hit.confidence);
      } else {
        byEntity.set(hit.spec.entity, {
          entity: hit.spec.entity,
          displayName: hit.spec.display,
          dataClass: hit.spec.dataClass,
          sourceObjects: [obj.name],
          confidence: hit.confidence,
        });
      }
    } else {
      unmatched.push({
        entity: "unknown",
        displayName: obj.name,
        dataClass: inferDataClass(obj),
        sourceObjects: [obj.name],
        confidence: 25,
      });
    }
  }

  return [...byEntity.values(), ...unmatched].sort((a, b) => b.confidence - a.confidence);
}
