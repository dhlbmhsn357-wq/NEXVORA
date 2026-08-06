import type { ProjectDomain } from "@/lib/types/database";

/**
 * كتالوج الوحدات القابلة لإعادة الاستخدام (Business Module Library — النواة
 * الثابتة، pure). كل مجال بيتطلّب مجموعة وحدات (domain → modules)، وكل
 * وحدة ليها ميزات/تقارير/صلاحيات/أخطاء شائعة. ده اللي بيمكّن التحليل
 * العابر للوحدات (ERP ⇒ Accounting ⇒ Chart of Accounts / General Ledger /
 * Trial Balance …) اللي مكانش موجود قبل كده (الـ domain-profiles كانت قوائم
 * نصوص مسطّحة بدون علاقات وحدة↔ميزة أو مجال↔وحدة).
 *
 * المكتبة الحيّة في قاعدة البيانات (business_modules) بتكبر فوق الكتالوج
 * ده من المشاريع الفعلية؛ الكتالوج هو خط الأساس المعرفي.
 */

export interface ModuleDefinition {
  key: string;
  name: string;
  /** الميزات/الوظائف الفرعية المتوقّعة (تُقارَن بعناوين عُقد المعرفة). */
  features: string[];
  requiredReports: string[];
  requiredPermissions: string[];
  commonMistakes: string[];
}

export const MODULE_CATALOG: Record<string, ModuleDefinition> = {
  auth: {
    key: "auth",
    name: "المصادقة والصلاحيات (Authentication)",
    features: ["Login", "User Roles", "Permissions", "Password Policy", "Session Management", "Audit Logs"],
    requiredReports: ["Access Report", "Audit Log Report"],
    requiredPermissions: ["manage_users", "manage_roles"],
    commonMistakes: ["نسيان قفل الحساب بعد محاولات فاشلة", "عدم تسجيل أحداث الدخول في Audit Log"],
  },
  accounting: {
    key: "accounting",
    name: "المحاسبة (Accounting)",
    features: [
      "Chart of Accounts", "Journal Entries", "General Ledger", "Cost Centers", "Currencies",
      "Trial Balance", "Profit & Loss", "Balance Sheet", "Tax Rules", "Fiscal Periods",
    ],
    requiredReports: ["Trial Balance", "Profit & Loss", "Balance Sheet", "General Ledger", "Tax Report"],
    requiredPermissions: ["post_journal_entries", "approve_journal_entries", "view_financial_reports", "close_fiscal_period"],
    commonMistakes: ["نسيان مراكز التكلفة", "عدم دعم عملات متعددة", "غياب قفل الفترات المالية", "نسيان قيود الضريبة"],
  },
  inventory: {
    key: "inventory",
    name: "المخزون (Inventory)",
    features: ["Items", "Warehouses", "Stock Movements", "Stock Adjustments", "Reorder Levels", "Batch/Serial Tracking"],
    requiredReports: ["Stock Report", "Stock Movement Report", "Reorder Report"],
    requiredPermissions: ["manage_inventory", "adjust_stock"],
    commonMistakes: ["نسيان تتبّع الدفعات/الأرقام التسلسلية", "غياب حدود إعادة الطلب"],
  },
  sales: {
    key: "sales",
    name: "المبيعات (Sales)",
    features: ["Quotations", "Sales Orders", "Invoices", "Customers", "Discounts", "Returns"],
    requiredReports: ["Sales Report", "Customer Statement", "Returns Report"],
    requiredPermissions: ["create_sales_order", "approve_discount"],
    commonMistakes: ["نسيان مرتجعات المبيعات", "عدم ربط الفاتورة بالمخزون والمحاسبة"],
  },
  purchasing: {
    key: "purchasing",
    name: "المشتريات (Purchasing)",
    features: ["Purchase Requests", "Purchase Orders", "Suppliers", "Goods Receipt", "Supplier Invoices"],
    requiredReports: ["Purchase Report", "Supplier Statement"],
    requiredPermissions: ["create_purchase_order", "approve_purchase_order"],
    commonMistakes: ["غياب استلام البضاعة (Goods Receipt)", "نسيان سلسلة اعتماد أوامر الشراء"],
  },
  hr: {
    key: "hr",
    name: "الموارد البشرية (HR)",
    features: ["Employees", "Departments", "Attendance", "Leaves", "Contracts"],
    requiredReports: ["Attendance Report", "Leave Balance Report"],
    requiredPermissions: ["manage_employees", "approve_leaves"],
    commonMistakes: ["نسيان أرصدة الإجازات", "عدم ربط الحضور بالرواتب"],
  },
  payroll: {
    key: "payroll",
    name: "الرواتب (Payroll)",
    features: ["Salary Structure", "Allowances", "Deductions", "Payslips", "Payroll Run"],
    requiredReports: ["Payroll Report", "Payslip"],
    requiredPermissions: ["run_payroll", "approve_payroll"],
    commonMistakes: ["نسيان الاستقطاعات/التأمينات", "عدم ربط الرواتب بقيود المحاسبة"],
  },
  crm: {
    key: "crm",
    name: "إدارة علاقات العملاء (CRM)",
    features: ["Leads", "Contacts", "Deals/Pipeline", "Activities", "Follow-ups"],
    requiredReports: ["Pipeline Report", "Conversion Report"],
    requiredPermissions: ["manage_leads", "manage_deals"],
    commonMistakes: ["غياب متابعة الأنشطة", "عدم قياس معدل التحويل"],
  },
  reporting: {
    key: "reporting",
    name: "التقارير ولوحات المعلومات (Reporting)",
    features: ["Dashboards", "Custom Reports", "Export", "Scheduled Reports"],
    requiredReports: ["Executive Dashboard"],
    requiredPermissions: ["view_reports", "export_reports"],
    commonMistakes: ["غياب التصدير", "عدم وجود لوحة تنفيذية"],
  },
  notifications: {
    key: "notifications",
    name: "الإشعارات (Notifications)",
    features: ["In-App Notifications", "Email Notifications", "Reminders", "Escalations"],
    requiredReports: [],
    requiredPermissions: ["manage_notifications"],
    commonMistakes: ["غياب التصعيد التلقائي", "عدم دعم قنوات متعددة"],
  },
  approval: {
    key: "approval",
    name: "سلاسل الاعتماد (Approval System)",
    features: ["Approval Chains", "Multi-level Approval", "Delegation", "Approval History"],
    requiredReports: ["Approval Audit Report"],
    requiredPermissions: ["configure_approvals", "approve_requests"],
    commonMistakes: ["غياب التفويض عند الغياب", "عدم تسجيل تاريخ الاعتمادات"],
  },
  documents: {
    key: "documents",
    name: "إدارة المستندات (Document Management)",
    features: ["Upload", "Versioning", "Access Control", "Search"],
    requiredReports: [],
    requiredPermissions: ["manage_documents"],
    commonMistakes: ["غياب التحكّم في الوصول", "عدم دعم الإصدارات"],
  },
  support: {
    key: "support",
    name: "مركز الدعم (Support Center)",
    features: ["Tickets", "SLA", "Knowledge Base", "Escalation"],
    requiredReports: ["SLA Report", "Ticket Volume Report"],
    requiredPermissions: ["manage_tickets"],
    commonMistakes: ["غياب SLA", "عدم ربط الدعم بقاعدة المعرفة"],
  },
};

/**
 * خريطة المجال → الوحدات المطلوبة (التحليل العابر للوحدات). ERP هو
 * الأعمق كما تطلب المواصفة صراحةً.
 */
export const DOMAIN_MODULE_MAP: Record<ProjectDomain, string[]> = {
  erp: ["auth", "accounting", "inventory", "sales", "purchasing", "hr", "payroll", "crm", "reporting", "notifications", "approval"],
  accounting: ["auth", "accounting", "reporting"],
  crm: ["auth", "crm", "sales", "reporting", "notifications"],
  lms: ["auth", "reporting", "notifications"],
  healthcare: ["auth", "reporting", "notifications", "documents"],
  hospital: ["auth", "inventory", "reporting", "notifications", "documents"],
  clinic: ["auth", "reporting", "notifications"],
  legal: ["auth", "documents", "reporting"],
  construction: ["auth", "purchasing", "inventory", "reporting", "approval"],
  ecommerce: ["auth", "sales", "inventory", "reporting", "notifications"],
  restaurant: ["auth", "inventory", "sales", "reporting"],
  factory: ["auth", "inventory", "purchasing", "hr", "reporting"],
  school: ["auth", "reporting", "notifications"],
  warehouse: ["auth", "inventory", "purchasing", "reporting"],
  generic: ["auth", "reporting"],
};

export function getRequiredModules(domain: ProjectDomain): ModuleDefinition[] {
  return (DOMAIN_MODULE_MAP[domain] ?? DOMAIN_MODULE_MAP.generic)
    .map((k) => MODULE_CATALOG[k])
    .filter(Boolean);
}

/** هل النص الفرعي موجود في أي عنوان عقدة نشطة؟ (نفس تقنية detectDomainGaps). */
function presentIn(titles: string[], needle: string): boolean {
  const n = needle.toLowerCase();
  return titles.some((t) => t.includes(n));
}

export interface ModulePresence {
  key: string;
  name: string;
  present: boolean;
  detectedFeatures: string[];
  missingFeatures: string[];
}

/** يحلّل وجود وحدة واحدة من عناوين عُقد المعرفة النشطة. */
export function detectModule(def: ModuleDefinition, activeTitles: string[]): ModulePresence {
  const lower = activeTitles.map((t) => t.toLowerCase());
  const detected = def.features.filter((f) => presentIn(lower, f));
  const missing = def.features.filter((f) => !presentIn(lower, f));
  // الوحدة "موجودة" لو اتحقق منها ميزة واحدة على الأقل أو اسمها ظهر.
  const present = detected.length > 0 || presentIn(lower, def.key);
  return { key: def.key, name: def.name, present, detectedFeatures: detected, missingFeatures: missing };
}

export interface DeterministicArchitectureAnalysis {
  domain: ProjectDomain;
  presentModules: ModulePresence[];
  missingModules: { module_key: string; name: string; reason: string }[];
  missingFeatures: { module_key: string; feature: string }[];
  /** درجة الجاهزية الحتمية (نسبة الميزات المطلوبة المتحقّقة). */
  readinessScore: number;
}

/**
 * التحليل الحتمي العابر للوحدات — بدون AI. يقرّر أي وحدات مطلوبة موجودة/
 * ناقصة وأي ميزات فرعية ناقصة داخل الوحدات الموجودة.
 */
export function analyzeArchitecture(domain: ProjectDomain, activeTitles: string[]): DeterministicArchitectureAnalysis {
  const required = getRequiredModules(domain);
  const presentModules: ModulePresence[] = [];
  const missingModules: { module_key: string; name: string; reason: string }[] = [];
  const missingFeatures: { module_key: string; feature: string }[] = [];

  let totalFeatures = 0;
  let coveredFeatures = 0;

  for (const def of required) {
    const presence = detectModule(def, activeTitles);
    totalFeatures += def.features.length;
    coveredFeatures += presence.detectedFeatures.length;
    if (presence.present) {
      presentModules.push(presence);
      for (const f of presence.missingFeatures) missingFeatures.push({ module_key: def.key, feature: f });
    } else {
      missingModules.push({ module_key: def.key, name: def.name, reason: `وحدة مطلوبة لمجال ${domain} وغير موجودة في المشروع` });
    }
  }

  const readinessScore = totalFeatures === 0 ? 100 : Math.round((coveredFeatures / totalFeatures) * 100);
  return { domain, presentModules, missingModules, missingFeatures, readinessScore };
}
