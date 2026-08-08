"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/rbac";
import { createClient } from "@/lib/supabase/server";
import { advanceProjectStage } from "@/lib/projects/advance-stage";
import { knownStages } from "@/lib/projects/stage-labels";

type Result = { ok: true } | { ok: false; message: string };

/**
 * تحديث مرحلة المشروع يدويًا من هيدر الصفحة (StageSelector).
 * الصلاحيات: owner / admin / supervisor فقط — viewer/member/guest
 * يشوفوا المرحلة كنص بدون قدرة تعديل.
 *
 * السلوك: بننادي advanceProjectStage الأول (بيتقدّم للأمام في التسلسل
 * الطبيعي فقط، وبيسجّل التوقيت الصح). لو مقدّرش يقدّم (مثلاً المستخدم
 * اختار مرحلة أبكر من المرحلة الحالية — override يدوي عن قصد من مسؤول)،
 * بنعمل update مباشر عشان الاختيار اليدوي يفضل مُطاع كـ authoritative
 * admin override.
 */
export async function updateProjectStageAction(
  projectId: string,
  newStage: string
): Promise<Result> {
  const guard = await requireRole(["owner", "admin", "supervisor"]);
  if (!guard.ok) return { ok: false, message: guard.message ?? "غير مصرَّح" };

  if (!knownStages.includes(newStage as (typeof knownStages)[number])) {
    return { ok: false, message: "مرحلة غير معروفة." };
  }

  const supabase = await createClient();

  // نحاول التقديم الطبيعي أولًا (بيحدّث stage_changed_at لو الـ trigger شغّال).
  await advanceProjectStage(supabase, projectId, newStage);

  // نتأكد من الحالة النهائية — لو advanceProjectStage تخطّى (retreat يدوي)،
  // بنطبّق التغيير مباشرة كـ manual override.
  const { data: after } = await supabase
    .from("projects")
    .select("stage")
    .eq("id", projectId)
    .maybeSingle();
  if (!after) return { ok: false, message: "المشروع غير موجود." };

  if (after.stage !== newStage) {
    const { error } = await supabase
      .from("projects")
      .update({ stage: newStage, stage_changed_at: new Date().toISOString() })
      .eq("id", projectId);
    if (error) return { ok: false, message: error.message };
  }

  revalidatePath(`/dashboard/projects/${projectId}`);
  return { ok: true };
}
