import { requireAdmin, requireRole } from "@/lib/auth/rbac";

/**
 * صلاحيات Engineering QA — بتعيد استخدام نظام RBAC الحالي بالكامل
 * (lib/auth/rbac.ts، 3 أدوار: owner/admin/member) — صفر نظام صلاحيات
 * جديد. كل دالة هنا اسمها بيوضّح الصلاحية المطلوبة بالضبط زي المذكور
 * في المواصفات، حتى لو أكتر من واحدة بترجع لنفس فحص الدور تحت الغطاء.
 *
 * التصنيف: العمليات اللي بتغيّر حالة مراجعة حقيقية (تشغيل/إلغاء/إعادة
 * محاولة/إدارة عامة) محصورة على owner/admin (نفس مستوى requireAdmin
 * المستخدم في باقي إعدادات النظام الحساسة). عرض التقارير والشهادات
 * متاح لأي عضو داخلي مسجّل دخول (owner/admin/member) — نفس نمط باقي
 * لوحات المشروع للقراءة.
 */

export const requireStartReview = () => requireAdmin();
export const requireCancelReview = () => requireAdmin();
export const requireRetryStage = () => requireAdmin();
export const requireManageQA = () => requireAdmin();
export const requireViewQAReports = () => requireRole(["owner", "admin", "member"]);
export const requireViewQACertificates = () => requireRole(["owner", "admin", "member"]);
