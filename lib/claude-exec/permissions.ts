import { requireAdmin, requireRole } from "@/lib/auth/rbac";

/**
 * AI Code Execution Engine بيكتب كود فعليًا ويستهلك تكلفة حقيقية
 * (Claude API) — صلاحيات أشد تحفّظًا من أي محرك مراجعة عادي (مراجعة
 * بس بتقرأ، ده بيكتب على GitHub الحقيقي).
 */
export const requireStartExecution = () => requireAdmin();
export const requireViewExecution = () => requireRole(["owner", "admin", "member"]);
