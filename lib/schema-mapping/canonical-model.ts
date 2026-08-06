import type { CanonicalEntity } from "@/lib/migration-discovery/semantic-detection";

/**
 * النموذج القياسي للنظام الجديد — **وحدة نقية بلا I/O**.
 *
 * ## لماذا نموذج قياسي؟
 *
 * الترحيل لا يعتمد على تشابه أسماء الجداول، بل على **المعنى**. «النظام
 * الجديد» هنا ليس قاعدة بيانات محدّدة، بل **نموذج معرفي قياسي** لكل مجال:
 * كيانات قياسية + حقولها القياسية. فيصبح الـMapping = من أي مصدر قديم إلى
 * هذا النموذج — وده اللي يخلّي VELORA تتعامل مع أي ERP/CRM/LMS حتى لو لم
 * تره من قبل: لا تطابق أسماء، بل تطابق دلالي مع النموذج القياسي.
 *
 * يُبنى فوق كيانات المرحلة ١ (CanonicalEntity) — لا يعيد تعريفها.
 */

export type FieldType =
  | "text" | "integer" | "decimal" | "boolean" | "date" | "timestamp"
  | "email" | "phone" | "currency" | "enum" | "uuid" | "reference" | "json";

export interface CanonicalField {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  /** مرادفات أسماء الحقول (عربي/إنجليزي) — للتطابق الدلالي. */
  synonyms: string[];
  /** لو enum/status: القيم القياسية المتوقّعة. */
  enumValues?: string[];
}

export interface CanonicalEntityDef {
  entity: CanonicalEntity;
  label: string;
  fields: CanonicalField[];
}

function f(key: string, label: string, type: FieldType, synonyms: string[], extra: Partial<CanonicalField> = {}): CanonicalField {
  return { key, label, type, synonyms, ...extra };
}

/** حقول مشتركة تقريبًا في كل كيان. */
const AUDIT_FIELDS: CanonicalField[] = [
  f("id", "المعرّف", "uuid", ["id", "code", "key", "pk", "رقم", "معرف"]),
  f("created_at", "تاريخ الإنشاء", "timestamp", ["created", "created_at", "createdon", "date_created", "insert_date", "تاريخ_الانشاء"]),
  f("updated_at", "تاريخ التحديث", "timestamp", ["updated", "updated_at", "modified", "last_modified", "تاريخ_التعديل"]),
];

/**
 * كتالوج الكيانات القياسية وحقولها. قابل للتوسّع: أي كيان/حقل جديد يُضاف
 * هنا فيصير هدفًا صالحًا للـMapping بلا تعديل منطق.
 */
export const CANONICAL_ENTITIES: CanonicalEntityDef[] = [
  {
    entity: "customer",
    label: "العميل",
    fields: [
      f("name", "الاسم", "text", ["name", "fullname", "customer_name", "client_name", "title", "الاسم", "اسم"], { required: true }),
      f("email", "البريد", "email", ["email", "mail", "e_mail", "بريد", "ايميل"]),
      f("phone", "الهاتف", "phone", ["phone", "mobile", "tel", "telephone", "contact", "جوال", "هاتف", "موبايل"]),
      f("address", "العنوان", "text", ["address", "addr", "location", "street", "عنوان"]),
      f("city", "المدينة", "text", ["city", "town", "مدينة"]),
      f("country", "الدولة", "text", ["country", "nation", "دولة", "بلد"]),
      f("tax_number", "الرقم الضريبي", "text", ["tax", "vat", "tax_number", "vat_no", "ضريبي"]),
      ...AUDIT_FIELDS,
    ],
  },
  {
    entity: "supplier",
    label: "المورّد",
    fields: [
      f("name", "الاسم", "text", ["name", "supplier_name", "vendor_name", "الاسم"], { required: true }),
      f("email", "البريد", "email", ["email", "mail", "بريد"]),
      f("phone", "الهاتف", "phone", ["phone", "mobile", "tel", "هاتف"]),
      f("tax_number", "الرقم الضريبي", "text", ["tax", "vat", "ضريبي"]),
      ...AUDIT_FIELDS,
    ],
  },
  {
    entity: "product",
    label: "المنتج",
    fields: [
      f("name", "الاسم", "text", ["name", "product_name", "item_name", "title", "اسم", "الصنف"], { required: true }),
      f("sku", "الرمز", "text", ["sku", "code", "barcode", "item_code", "رمز", "باركود"]),
      f("price", "السعر", "currency", ["price", "unit_price", "cost", "amount", "سعر"]),
      f("quantity", "الكمية", "integer", ["qty", "quantity", "stock", "كمية", "رصيد"]),
      f("category", "التصنيف", "reference", ["category", "type", "group", "تصنيف", "فئة"]),
      ...AUDIT_FIELDS,
    ],
  },
  {
    entity: "order",
    label: "الطلب",
    fields: [
      f("order_number", "رقم الطلب", "text", ["order_no", "number", "order_number", "ref", "رقم"], { required: true }),
      f("customer_id", "العميل", "reference", ["customer", "customer_id", "client_id", "عميل"]),
      f("total", "الإجمالي", "currency", ["total", "amount", "grand_total", "اجمالي", "المجموع"]),
      f("status", "الحالة", "enum", ["status", "state", "حالة"], { enumValues: ["draft", "confirmed", "completed", "cancelled"] }),
      f("order_date", "التاريخ", "date", ["date", "order_date", "تاريخ"]),
      ...AUDIT_FIELDS,
    ],
  },
  {
    entity: "invoice",
    label: "الفاتورة",
    fields: [
      f("invoice_number", "رقم الفاتورة", "text", ["invoice_no", "number", "invoice_number", "bill_no", "رقم"], { required: true }),
      f("customer_id", "العميل", "reference", ["customer", "customer_id", "client_id", "عميل"]),
      f("amount", "المبلغ", "currency", ["amount", "total", "value", "مبلغ", "قيمة"]),
      f("tax", "الضريبة", "currency", ["tax", "vat", "ضريبة"]),
      f("status", "الحالة", "enum", ["status", "state", "payment_status", "حالة"], { enumValues: ["unpaid", "partial", "paid", "cancelled"] }),
      f("issue_date", "تاريخ الإصدار", "date", ["date", "issue_date", "invoice_date", "تاريخ"]),
      ...AUDIT_FIELDS,
    ],
  },
  {
    entity: "payment",
    label: "الدفعة",
    fields: [
      f("amount", "المبلغ", "currency", ["amount", "value", "paid", "مبلغ"], { required: true }),
      f("method", "الطريقة", "enum", ["method", "payment_method", "type", "طريقة"], { enumValues: ["cash", "card", "transfer", "cheque"] }),
      f("invoice_id", "الفاتورة", "reference", ["invoice", "invoice_id", "فاتورة"]),
      f("payment_date", "التاريخ", "date", ["date", "payment_date", "تاريخ"]),
      ...AUDIT_FIELDS,
    ],
  },
  {
    entity: "employee",
    label: "الموظف",
    fields: [
      f("name", "الاسم", "text", ["name", "employee_name", "full_name", "اسم"], { required: true }),
      f("email", "البريد", "email", ["email", "mail", "بريد"]),
      f("phone", "الهاتف", "phone", ["phone", "mobile", "هاتف"]),
      f("department_id", "القسم", "reference", ["department", "dept", "قسم"]),
      f("salary", "الراتب", "currency", ["salary", "wage", "راتب"]),
      f("hire_date", "تاريخ التعيين", "date", ["hire_date", "join_date", "start_date", "تعيين"]),
      ...AUDIT_FIELDS,
    ],
  },
  {
    entity: "user",
    label: "المستخدم",
    fields: [
      f("username", "اسم المستخدم", "text", ["username", "login", "user", "مستخدم"], { required: true }),
      f("email", "البريد", "email", ["email", "mail", "بريد"]),
      f("role_id", "الدور", "reference", ["role", "role_id", "group", "دور"]),
      f("is_active", "نشط", "boolean", ["active", "is_active", "enabled", "status", "نشط"]),
      ...AUDIT_FIELDS,
    ],
  },
  {
    entity: "student",
    label: "الطالب",
    fields: [
      f("name", "الاسم", "text", ["name", "student_name", "اسم"], { required: true }),
      f("email", "البريد", "email", ["email", "mail", "بريد"]),
      f("enrollment_number", "رقم القيد", "text", ["enrollment_no", "student_id", "number", "قيد"]),
      ...AUDIT_FIELDS,
    ],
  },
  {
    entity: "patient",
    label: "المريض",
    fields: [
      f("name", "الاسم", "text", ["name", "patient_name", "اسم"], { required: true }),
      f("national_id", "الهوية", "text", ["national_id", "id_number", "mrn", "هوية"]),
      f("phone", "الهاتف", "phone", ["phone", "mobile", "هاتف"]),
      f("date_of_birth", "الميلاد", "date", ["dob", "birth_date", "date_of_birth", "ميلاد"]),
      ...AUDIT_FIELDS,
    ],
  },
  {
    entity: "account",
    label: "الحساب المحاسبي",
    fields: [
      f("account_code", "رقم الحساب", "text", ["code", "account_code", "gl_code", "رقم"], { required: true }),
      f("account_name", "اسم الحساب", "text", ["name", "account_name", "اسم"]),
      f("account_type", "النوع", "enum", ["type", "account_type", "نوع"], { enumValues: ["asset", "liability", "equity", "revenue", "expense"] }),
      f("balance", "الرصيد", "currency", ["balance", "amount", "رصيد"]),
      ...AUDIT_FIELDS,
    ],
  },
  {
    entity: "transaction",
    label: "الحركة/القيد",
    fields: [
      f("amount", "المبلغ", "currency", ["amount", "value", "debit", "credit", "مبلغ"], { required: true }),
      f("account_id", "الحساب", "reference", ["account", "account_id", "حساب"]),
      f("transaction_date", "التاريخ", "date", ["date", "transaction_date", "تاريخ"]),
      f("description", "الوصف", "text", ["description", "memo", "note", "بيان", "وصف"]),
      ...AUDIT_FIELDS,
    ],
  },
];

const BY_ENTITY = new Map(CANONICAL_ENTITIES.map((e) => [e.entity, e]));

export function getCanonicalEntity(entity: CanonicalEntity): CanonicalEntityDef | undefined {
  return BY_ENTITY.get(entity);
}

export function canonicalEntityLabel(entity: CanonicalEntity): string {
  return BY_ENTITY.get(entity)?.label ?? entity;
}

/** كيان قياسي معرَّف بحقول (قابل كهدف Mapping)؟ */
export function isMappableEntity(entity: CanonicalEntity): boolean {
  return BY_ENTITY.has(entity);
}
