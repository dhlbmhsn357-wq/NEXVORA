/**
 * NEXVORA Sector Standards — Standard-Based Navigation Badges Data Access
 * (0126، المرحلة د)
 * ============================================================================
 * Server-only. القراءة عبر authenticated client (RLS SELECT). بيحسب عدد
 * change_impacts بحالة 'applied' لكل artifact_type، لمشروع معيّن — عبر
 * join مع client_change_requests.project_id (change_impacts نفسها معندهاش
 * project_id مباشر). يُستخدم لعرض شارات "موروث + N تغييرات" على تبويبات
 * تعريف المنتج/القصص لمشاريع standard_based فقط (راجع page.tsx).
 */
import "server-only";
import { createClient } from "@/lib/supabase/server";

/** خريطة artifact_type → عدد change_impacts المُطبَّقة فعليًا لمشروع معيّن. */
export async function getAppliedImpactCountsByArtifactType(projectId: string): Promise<Record<string, number>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("change_impacts")
    .select("artifact_type, client_change_requests!inner(project_id)")
    .eq("status", "applied")
    .eq("client_change_requests.project_id", projectId);
  if (error) throw error;

  const counts: Record<string, number> = {};
  for (const row of (data as { artifact_type: string }[]) ?? []) {
    counts[row.artifact_type] = (counts[row.artifact_type] ?? 0) + 1;
  }
  return counts;
}
