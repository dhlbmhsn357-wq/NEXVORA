import type { UserRole, UserStatus } from "@/lib/types/database";

/**
 * التسلسل الهرمي للأدوار (Enterprise IAM) — وحدة نقية بدون أي I/O.
 *
 * لماذا هرمي؟ فيه ~120 موضع Server Action بينادوا requireRole بمصفوفات
 * ثابتة زي ["owner","admin"] أو ["owner","admin","member"]. بدل تعديلهم
 * كلهم عند إضافة دور جديد (supervisor)، بنحسب "أقل رتبة مطلوبة" من
 * المصفوفة وبنقارن رتبة المستخدم بيها — فالدور الجديد بيندمج تلقائيًا
 * في كل الفحوصات القديمة من غير أي تعديل عليها.
 */
export const ROLE_TIER: Record<UserRole, number> = {
  owner: 3, // مسؤول النظام (System Administrator)
  admin: 2, // مسؤول (Administrator)
  supervisor: 1, // مشرف (Supervisor)
  member: 0, // منفّذ (Executor)
};

export const ROLE_LABELS: Record<UserRole, string> = {
  owner: "مسؤول النظام",
  admin: "مسؤول",
  supervisor: "مشرف",
  member: "منفّذ",
};

export const STATUS_LABELS: Record<UserStatus, string> = {
  active: "نشط",
  inactive: "غير نشط",
  locked: "مقفول",
  suspended: "موقوف",
  pending: "بانتظار الدعوة",
  deleted: "محذوف",
};

export const ALL_ROLES: UserRole[] = ["owner", "admin", "supervisor", "member"];

/** أقل رتبة تحقق شرط "مسموح" — min(tier) للمصفوفة. مصفوفة فاضية = أعلى رتبة (owner فقط). */
export function requiredTier(allowed: UserRole[]): number {
  if (allowed.length === 0) return ROLE_TIER.owner;
  return Math.min(...allowed.map((r) => ROLE_TIER[r]));
}

/** هل دور المستخدم يحقق شرط الأدوار المسموحة (هرميًا)؟ */
export function roleSatisfies(role: UserRole, allowed: UserRole[]): boolean {
  return ROLE_TIER[role] >= requiredTier(allowed);
}

/** الحالات المسموح لها بتسجيل الدخول/تنفيذ عمليات. */
export function isStatusAllowed(status: UserStatus): boolean {
  return status === "active";
}

/** رسالة عربية واضحة لكل حالة حساب ممنوعة. */
export function statusBlockMessage(status: UserStatus): string {
  switch (status) {
    case "locked":
      return "الحساب مقفول بسبب محاولات دخول فاشلة متكررة. تواصل مع مسؤول النظام لفتحه.";
    case "inactive":
      return "الحساب معطّل. تواصل مع مسؤول النظام.";
    case "suspended":
      return "الحساب موقوف مؤقتًا. تواصل مع مسؤول النظام.";
    case "pending":
      return "الحساب لسه بانتظار تفعيل الدعوة.";
    case "deleted":
      return "الحساب محذوف.";
    default:
      return "الحساب غير نشط.";
  }
}
