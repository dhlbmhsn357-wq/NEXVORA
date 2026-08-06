import { requireAdmin, requireRole } from "@/lib/auth/rbac";

/**
 * صلاحيات Production Monitoring — نفس نظام RBAC الحالي بالضبط
 * (lib/auth/rbac.ts، 3 أدوار فقط)، صفر نظام صلاحيات جديد. نفس نمط
 * lib/engineering-qa/permissions.ts بالظبط لكن ملف منفصل لأن المراقبة
 * مش جزء من دورة حياة مراجعة EQA (مستمرة بعد النشر، مش مرة واحدة قبله).
 */
export const requireRunCheck = () => requireAdmin();
export const requireManageIncidents = () => requireAdmin();
export const requireViewMonitoring = () => requireRole(["owner", "admin", "member"]);
