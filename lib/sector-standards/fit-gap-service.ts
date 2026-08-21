/**
 * NEXVORA Sector Standards — Fit/Gap Notes + Convert-to-Full-Discovery
 * Data Access (0126، المرحلة د)
 * ============================================================================
 * Server-only. القراءة عبر authenticated client (RLS SELECT). الكتابة عبر
 * service client (RBAC مطبّق في server actions). نفس نمط
 * change-request-service.ts بالضبط.
 */
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import type { FitGapNotesRow, FitGapNotesInput } from "./fit-gap-types";

type DbFitGapNotes = {
  id: string;
  project_id: string;
  stays_as_is: string;
  needs_adding: string;
  needs_modifying: string;
  needs_removing: string;
  operational_differences: string;
  updated_at: string;
  updated_by: string | null;
};

function mapFitGapNotes(r: DbFitGapNotes): FitGapNotesRow {
  return {
    id: r.id,
    projectId: r.project_id,
    staysAsIs: r.stays_as_is,
    needsAdding: r.needs_adding,
    needsModifying: r.needs_modifying,
    needsRemoving: r.needs_removing,
    operationalDifferences: r.operational_differences,
    updatedAt: r.updated_at,
    updatedBy: r.updated_by,
  };
}

/** يرجّع ملاحظات Fit/Gap لمشروع معيّن — null لو لسه ما اتسجّلش أي ملاحظة. */
export async function getFitGapNotes(projectId: string): Promise<FitGapNotesRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("fit_gap_notes")
    .select("*")
    .eq("project_id", projectId)
    .maybeSingle();
  if (error) throw error;
  return data ? mapFitGapNotes(data as DbFitGapNotes) : null;
}

/**
 * يحفظ (ينشئ أو يحدّث) ملاحظات Fit/Gap لمشروع معيّن — upsert على
 * project_id (unique). صف واحد فقط لكل مشروع، مفيش تاريخ نُسخ (MVP).
 */
export async function upsertFitGapNotes(
  projectId: string,
  input: FitGapNotesInput,
  actorId: string | null
): Promise<FitGapNotesRow> {
  const svc = createServiceClient();
  const { data, error } = await svc
    .from("fit_gap_notes")
    .upsert(
      {
        project_id: projectId,
        stays_as_is: input.staysAsIs ?? "",
        needs_adding: input.needsAdding ?? "",
        needs_modifying: input.needsModifying ?? "",
        needs_removing: input.needsRemoving ?? "",
        operational_differences: input.operationalDifferences ?? "",
        updated_at: new Date().toISOString(),
        updated_by: actorId,
      },
      { onConflict: "project_id" }
    )
    .select("*")
    .single();
  if (error) throw error;
  return mapFitGapNotes(data as DbFitGapNotes);
}

/**
 * "تحويل إلى Full Discovery": يحوّل workflow_mode للمشروع إلى
 * 'full_discovery' — بدون حذف project_standard_links (السجل التاريخي
 * لأصل الاستنساخ بيفضل موجود عمدًا). عملية أحادية الاتجاه من ناحية
 * التأثير على واجهة المستخدم (تظهر كل تبويبات Full Discovery)، لكن
 * تقنيًا رجوعية (ممكن تتحدّث تاني لـ 'standard_based' يدويًا لو احتاج
 * الأمر — مفيش قفل).
 */
export async function convertToFullDiscovery(projectId: string): Promise<void> {
  const svc = createServiceClient();
  const { error } = await svc
    .from("projects")
    .update({ workflow_mode: "full_discovery" })
    .eq("id", projectId);
  if (error) throw error;
}
