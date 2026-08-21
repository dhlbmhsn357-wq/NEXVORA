/**
 * NEXVORA Sector Standards — Standard Learning Signals
 * Data Access (0125، المرحلة ج)
 * ============================================================================
 * Server-only. القراءة عبر authenticated client (RLS SELECT). الكتابة عبر
 * service client (RBAC مطبّق في server actions المستدعية).
 *
 * بذرة بيانات خام بس — مفيش أي منطق تجميع/تحليل هنا. الهدف الوحيد لهذه
 * المرحلة: التأكد إن الصفوف بتتسجّل صح وبالشكل الصحيح لمرحلة قادمة تقدر
 * تستهلكها.
 *
 * **أمان اتجاه الاستخدام**: recordLearningSignal لازم تكون آمنة تمامًا
 * (مفيش throw) لأي مشروع Client Variant مالوش ربط Standard فعلي — مش كل
 * مشروع Change Request بالضرورة مبني من Sector Standard.
 */
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getProjectStandardLink } from "./service";
import { getChangeRequest } from "./change-request-service";
import type { ChangeImpactRow } from "./change-request-types";
import type { StandardLearningSignalRow } from "./prototype-prompt-types";

type DbStandardLearningSignal = {
  id: string;
  standard_project_id: string | null;
  client_project_id: string;
  change_request_id: string;
  change_type: string;
  artifact_type: string;
  impact_type: string;
  title: string;
  recorded_at: string;
};

function mapSignal(r: DbStandardLearningSignal): StandardLearningSignalRow {
  return {
    id: r.id,
    standardProjectId: r.standard_project_id,
    clientProjectId: r.client_project_id,
    changeRequestId: r.change_request_id,
    changeType: r.change_type,
    artifactType: r.artifact_type,
    impactType: r.impact_type,
    title: r.title,
    recordedAt: r.recorded_at,
  };
}

/**
 * يسجّل إشارة تعلّم واحدة لأثر تغيير مُطبَّق فعليًا. بيتصرّف بصمت
 * (بدون throw) في حالتين متوقعتين وطبيعيتين:
 *   - طلب التغيير نفسه مش موجود (سباق نادر) — مفيش حاجة نسجّلها.
 *   - المشروع مش Client Variant مبني من Sector Standard أصلًا (مفيش
 *     project_standard_links له) — مفيش standard_project_id نربط بيه
 *     الإشارة، والتسجيل هنا غير منطقي أصلًا لمشروع full_discovery عادي.
 * أي خطأ حقيقي تاني (فشل كتابة قاعدة بيانات فعلي) بيتصعّد عاديًا —
 * الاستدعاء المسؤول (applyApprovedImpacts) بيتعامل معاه كخطأ غير حرج.
 */
export async function recordLearningSignal(changeRequestId: string, impact: ChangeImpactRow): Promise<void> {
  const changeRequest = await getChangeRequest(changeRequestId);
  if (!changeRequest) return;

  const link = await getProjectStandardLink(changeRequest.projectId);
  if (!link) return;

  const svc = createServiceClient();
  const { error } = await svc.from("standard_learning_signals").insert({
    standard_project_id: link.standardProjectId,
    client_project_id: changeRequest.projectId,
    change_request_id: changeRequestId,
    change_type: changeRequest.type,
    artifact_type: impact.artifactType,
    impact_type: impact.impactType,
    title: changeRequest.title,
  });
  if (error) throw error;
}

export async function listLearningSignalsForStandard(standardProjectId: string): Promise<StandardLearningSignalRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("standard_learning_signals")
    .select("*")
    .eq("standard_project_id", standardProjectId)
    .order("recorded_at", { ascending: false });
  if (error) throw error;
  return (data as DbStandardLearningSignal[]).map(mapSignal);
}
