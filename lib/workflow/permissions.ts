import { requireRole, type RequireRoleResult } from "@/lib/auth/rbac";
import type { UserRole } from "@/lib/types/database";
import { getStageDefinition } from "./registry";
import type { WorkflowAction, WorkflowRole, WorkflowStageKey } from "./types";

/**
 * الـ Registry بيوصف صلاحيات بـ 6 أدوار (admin/pm/reviewer/developer/
 * qa/support) زي ما طُلب — لكن جدول profiles.role النهاردة عنده 3 بس
 * (owner/admin/member). التفعيل الفعلي هنا بيربط الـ 6 بالـ 3 الموجودين
 * فعلًا، لحدّ ما قرار تنظيمي (مين فعليًا Reviewer/Developer/QA/Support
 * في فريقك) يتاخد ويتضاف جدول تعيين أدوار حقيقي — موضّح كتوصية Phase 2
 * في تقرير الترحيل. حاليًا: admin → owner/admin، وكل باقي الأدوار
 * (pm/reviewer/developer/qa/support) → member (أي مستخدم مسجّل دخول
 * مش owner/admin يعدّي، زي ما كانت الحماية الفعلية قبل كده تمامًا).
 */
function mapToUserRoles(roles: WorkflowRole[]): UserRole[] {
  const out = new Set<UserRole>();
  for (const role of roles) {
    if (role === "admin") {
      out.add("owner");
      out.add("admin");
    } else {
      out.add("member");
    }
  }
  return Array.from(out);
}

export function getAllowedWorkflowRoles(stageKey: WorkflowStageKey, action: WorkflowAction): WorkflowRole[] {
  return getStageDefinition(stageKey)?.permissions[action] ?? [];
}

/** تتحقق إن المستخدم الحالي مسموح له بالفعل ده على المرحلة دي — بتستدعي requireRole الموجودة أصلًا، من غير أي إعادة بناء لـ RBAC. */
export async function requireStageAction(stageKey: WorkflowStageKey, action: WorkflowAction): Promise<RequireRoleResult> {
  const allowedWorkflowRoles = getAllowedWorkflowRoles(stageKey, action);
  if (allowedWorkflowRoles.length === 0) {
    return { ok: false, message: "الفعل ده غير معرّف لهذه المرحلة." };
  }
  return requireRole(mapToUserRoles(allowedWorkflowRoles));
}
