import { requireAdmin, requireRole } from "@/lib/auth/rbac";

/**
 * Organizational Intelligence مش جزء من Engineering QA (مش مراجعة نقطة-
 * في-الزمن لمشروع واحد) — طبقة مستقلة عابرة لكل المشاريع، فليها ملف
 * صلاحيات خاص بيها بس (نفس قرار Production Monitoring في Phase 5).
 */
export const requireViewKnowledge = () => requireRole(["owner", "admin", "member"]);
export const requireManageKnowledge = () => requireAdmin();
export const requireTriggerExtraction = () => requireAdmin();
