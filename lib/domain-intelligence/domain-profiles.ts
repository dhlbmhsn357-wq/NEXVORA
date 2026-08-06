import type { ProjectDomain } from "@/lib/types/database";

export interface DomainProfile {
  domain: ProjectDomain;
  label: string;
  /**
   * قائمة الوحدات/الكيانات المتوقّعة لمجال العمل ده — بتُستخدم كفحص
   * حتمي (Presence Check) بمقارنتها بعناوين عُقد المعرفة الموجودة
   * فعليًا في المشروع، مش كفحص AI. ERP هو المثال العميق المطلوب صراحة
   * في المواصفات؛ باقي المجالات قائمة بداية أخف، قابلة للتعميق لاحقًا
   * من غير أي تعديل في القاعدة (نفس الجدول، بيانات إضافية بس).
   */
  expectedItems: string[];
}

export const DOMAIN_PROFILES: Record<ProjectDomain, DomainProfile> = {
  erp: {
    domain: "erp",
    label: "نظام تخطيط موارد المؤسسات (ERP)",
    expectedItems: [
      "Chart of Accounts", "General Ledger", "Inventory", "Sales", "Purchasing",
      "Manufacturing", "HR", "Payroll", "CRM", "Permissions", "Audit Logs",
      "Reports", "Approval Workflows", "Master Data", "Reference Data",
      "Financial Reports", "Stock Reports", "Tax Rules", "User Roles", "Branch Support",
    ],
  },
  crm: {
    domain: "crm",
    label: "إدارة علاقات العملاء (CRM)",
    expectedItems: ["Leads", "Contacts", "Deals/Pipeline", "Activities", "Reports", "User Roles", "Permissions"],
  },
  lms: {
    domain: "lms",
    label: "نظام إدارة تعلّم (LMS)",
    expectedItems: ["Courses", "Enrollments", "Assessments", "Certificates", "Instructors", "Reports", "User Roles"],
  },
  healthcare: {
    domain: "healthcare",
    label: "رعاية صحية",
    expectedItems: ["Patients", "Appointments", "Medical Records", "Prescriptions", "Billing", "User Roles", "Audit Logs"],
  },
  legal: {
    domain: "legal",
    label: "قانوني",
    expectedItems: ["Cases", "Clients", "Documents", "Billing", "Deadlines", "User Roles"],
  },
  construction: {
    domain: "construction",
    label: "مقاولات وإنشاءات",
    expectedItems: ["Projects", "Contractors", "Materials", "Budget", "Schedule", "Reports"],
  },
  hospital: {
    domain: "hospital",
    label: "مستشفى",
    expectedItems: ["Patients", "Doctors", "Appointments", "Medical Records", "Billing", "Inventory", "User Roles", "Audit Logs"],
  },
  ecommerce: {
    domain: "ecommerce",
    label: "تجارة إلكترونية",
    expectedItems: ["Products", "Orders", "Payments", "Inventory", "Shipping", "Customers", "Reports"],
  },
  restaurant: {
    domain: "restaurant",
    label: "مطاعم",
    expectedItems: ["Menu", "Orders", "Tables", "Inventory", "Payments", "Reports"],
  },
  factory: {
    domain: "factory",
    label: "مصنع",
    expectedItems: ["Production", "Inventory", "Quality Control", "Maintenance", "HR", "Reports"],
  },
  clinic: {
    domain: "clinic",
    label: "عيادة",
    expectedItems: ["Patients", "Appointments", "Medical Records", "Billing", "User Roles"],
  },
  school: {
    domain: "school",
    label: "مدرسة",
    expectedItems: ["Students", "Classes", "Attendance", "Grades", "Billing", "User Roles"],
  },
  warehouse: {
    domain: "warehouse",
    label: "مخازن",
    expectedItems: ["Inventory", "Stock Movements", "Suppliers", "Orders", "Reports"],
  },
  accounting: {
    domain: "accounting",
    label: "محاسبة",
    expectedItems: ["Chart of Accounts", "General Ledger", "Invoices", "Payments", "Financial Reports", "Tax Rules"],
  },
  generic: {
    domain: "generic",
    label: "عام",
    expectedItems: [],
  },
};

/**
 * فحص حتمي: أي عنصر متوقّع من مجال المشروع غير موجود (كنص فرعي في
 * عنوان أي عقدة معرفة نشطة)؟ Pure — مفيش أي استدعاء DB/AI هنا.
 */
export function detectDomainGaps(domain: ProjectDomain, activeNodeTitles: string[]): string[] {
  const profile = DOMAIN_PROFILES[domain];
  if (!profile || profile.expectedItems.length === 0) return [];

  const lowerTitles = activeNodeTitles.map((t) => t.toLowerCase());
  return profile.expectedItems.filter(
    (expected) => !lowerTitles.some((title) => title.includes(expected.toLowerCase()))
  );
}
