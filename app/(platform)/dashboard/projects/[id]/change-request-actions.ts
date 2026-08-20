"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/rbac";
import {
  listChangeRequests,
  getChangeRequest,
  createChangeRequest,
  deleteChangeRequest,
  listChangeImpacts,
  updateChangeImpactStatus,
} from "@/lib/sector-standards/change-request-service";
import { runImpactAnalysis } from "@/lib/sector-standards/impact-analysis-pipeline";
import { applyApprovedImpacts, type ApplyApprovedImpactsResult } from "@/lib/sector-standards/apply-changes-service";
import type {
  ChangeRequestRow,
  ChangeImpactRow,
  CreateChangeRequestInput,
  ImpactStatus,
} from "@/lib/sector-standards/change-request-types";

/**
 * Server Actions — Client Change Requests + Impact Analysis (0124، المرحلة ب)
 * نفس نمط ActionResult في sector-standard-actions.ts بالضبط.
 *
 * قرار RBAC (حكم صريح — راجع تقرير المرحلة ب للتفصيل): هذا الكودبيز عنده
 * 4 أدوار بس (owner/admin/supervisor/member)، مفيش دور "Client" منفصل.
 * المواصفة الأصلية بتقول "Client لا يطبّق Product Truth مباشرة" — بنفسّر
 * ده هنا كـ: أي مستخدم داخلي (حتى member) يقدر **يسجّل** طلب تغيير
 * ويشغّل **تحليل** الأثر عليه (ده أبدًا ما بيلمسش بيانات المنتج الحقيقية
 * — راجع impact-analysis-pipeline.ts)، لكن **اعتماد** أثر فردي أو
 * **تطبيقه** فعليًا على بيانات المنتج محصور بـ owner/admin/supervisor —
 * نفس رتبة الكتابة المستخدمة في sector-standard-actions.ts بالضبط.
 */
type ActionResult<T = void> = { ok: true; data?: T } | { ok: false; message: string };

const BROAD_ROLES = ["owner", "admin", "supervisor", "member"] as const;
const WRITE_ROLES = ["owner", "admin", "supervisor"] as const;

async function guardBroad() {
  const g = await requireRole([...BROAD_ROLES]);
  if (!g.ok) return { ok: false as const, message: g.message ?? "غير مصرَّح" };
  return { ok: true as const, userId: g.userId ?? null };
}

async function guardWrite() {
  const g = await requireRole([...WRITE_ROLES]);
  if (!g.ok) return { ok: false as const, message: g.message ?? "غير مصرَّح" };
  return { ok: true as const, userId: g.userId ?? null };
}

// ---------------------------------------------------------------------------
// Change Requests — قراءة/إنشاء متاحة لأي دور مسجّل دخول (BROAD_ROLES).
// ---------------------------------------------------------------------------

export async function listChangeRequestsAction(projectId: string): Promise<ActionResult<ChangeRequestRow[]>> {
  const g = await guardBroad();
  if (!g.ok) return g;
  try {
    const data = await listChangeRequests(projectId);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "فشل جلب طلبات التغيير." };
  }
}

export async function getChangeRequestAction(id: string): Promise<ActionResult<ChangeRequestRow | null>> {
  const g = await guardBroad();
  if (!g.ok) return g;
  try {
    const data = await getChangeRequest(id);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "فشل جلب طلب التغيير." };
  }
}

export async function createChangeRequestAction(
  projectId: string,
  input: CreateChangeRequestInput
): Promise<ActionResult<ChangeRequestRow>> {
  const g = await guardBroad();
  if (!g.ok) return g;
  try {
    const data = await createChangeRequest(projectId, input, g.userId);
    revalidatePath(`/dashboard/projects/${projectId}`);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "فشل إنشاء طلب التغيير." };
  }
}

/** حذف طلب تغيير — محصور بأدوار الكتابة (عملية تنظيف/تصحيح، مش جزء من مسار العمل العادي لأي دور). */
export async function deleteChangeRequestAction(id: string, projectId: string): Promise<ActionResult> {
  const g = await guardWrite();
  if (!g.ok) return g;
  try {
    await deleteChangeRequest(id);
    revalidatePath(`/dashboard/projects/${projectId}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "فشل حذف طلب التغيير." };
  }
}

// ---------------------------------------------------------------------------
// تحليل الأثر — بيُنتج **مقترحات** proposed بس، أبدًا ما بيلمسش بيانات
// المنتج الحقيقية، فمتاح لنفس رتبة الإنشاء (BROAD_ROLES).
// ---------------------------------------------------------------------------

export async function runImpactAnalysisAction(
  projectId: string,
  changeRequestId: string
): Promise<ActionResult<ChangeImpactRow[]>> {
  const g = await guardBroad();
  if (!g.ok) return g;
  try {
    const result = await runImpactAnalysis(projectId, changeRequestId);
    if (!result.ok) return { ok: false, message: result.message };
    revalidatePath(`/dashboard/projects/${projectId}`);
    return { ok: true, data: result.impacts };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "فشل تشغيل تحليل الأثر." };
  }
}

export async function listChangeImpactsAction(changeRequestId: string): Promise<ActionResult<ChangeImpactRow[]>> {
  const g = await guardBroad();
  if (!g.ok) return g;
  try {
    const data = await listChangeImpacts(changeRequestId);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "فشل جلب عناصر تحليل الأثر." };
  }
}

// ---------------------------------------------------------------------------
// اعتماد/رفض أثر فردي + التطبيق الفعلي على بيانات المنتج — WRITE_ROLES فقط
// (owner/admin/supervisor). ده المكان الوحيد اللي ممكن يمسّ بيانات المنتج
// الحقيقية في المرحلة دي كلها.
// ---------------------------------------------------------------------------

export async function reviewChangeImpactAction(
  impactId: string,
  status: Extract<ImpactStatus, "approved" | "rejected">,
  projectId: string
): Promise<ActionResult<ChangeImpactRow>> {
  const g = await guardWrite();
  if (!g.ok) return g;
  try {
    const data = await updateChangeImpactStatus(impactId, status);
    revalidatePath(`/dashboard/projects/${projectId}`);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "فشل تحديث حالة عنصر الأثر." };
  }
}

/** التطبيق الفعلي: يكتب على بيانات المنتج الحقيقية — WRITE_ROLES فقط. */
export async function applyApprovedImpactsAction(
  changeRequestId: string,
  approvedImpactIds: string[],
  projectId: string
): Promise<ActionResult<ApplyApprovedImpactsResult>> {
  const g = await guardWrite();
  if (!g.ok) return g;
  try {
    const data = await applyApprovedImpacts(changeRequestId, approvedImpactIds, g.userId);
    revalidatePath(`/dashboard/projects/${projectId}`);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "فشل تطبيق التغييرات المعتمَدة." };
  }
}
