import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * التحديث التزايدي لمعرفة المجال (الجزء الموسّع).
 *
 * ## الفلسفة (من المواصفة)
 *
 * «إذا أضاف المدير ERP Standard جديدًا أو عدّل حزمة، لا تعالج كل
 * المشاريع. حدّد فقط المشاريع التي يمكن أن تستفيد، وأخبر المدير — مع
 * إمكانية التطبيق أو التجاهل.»
 *
 * التحديد حتمي: المشاريع اللي اختارت الحزمة بالفعل، أو مشاريع بنفس مجال
 * الحزمة (مرشّحة للاستفادة). القرار (تطبيق/تجاهل) للمدير — مافيش إعادة
 * معالجة تلقائية.
 */

const UNDEFINED_TABLE = "42P01";

export interface AffectedProject {
  projectId: string;
  projectName: string;
  reason: "already_selected" | "domain_match";
}

/**
 * يجد المشاريع المتأثّرة بتغيير حزمة — للإخطار لا للتطبيق التلقائي.
 */
export async function findAffectedProjects(
  packageId: string,
  client?: SupabaseClient
): Promise<AffectedProject[]> {
  const db = client ?? createServiceClient();

  const pkg = await db.from("domain_packages").select("domain").eq("id", packageId).maybeSingle();
  if (pkg.error?.code === UNDEFINED_TABLE) return [];
  const domain = (pkg.data?.domain as string | null) ?? null;

  const affected = new Map<string, AffectedProject>();

  // ١) المشاريع اللي اختارت الحزمة بالفعل.
  const { data: selected } = await db
    .from("project_domain_packages")
    .select("project_id, projects(name)")
    .eq("package_id", packageId)
    .limit(500);
  for (const r of (selected ?? []) as Array<{ project_id: string; projects: unknown }>) {
    const name = projectName(r.projects);
    if (name) affected.set(r.project_id, { projectId: r.project_id, projectName: name, reason: "already_selected" });
  }

  // ٢) مشاريع بنفس المجال لم تختر الحزمة بعد — مرشّحة للاستفادة.
  if (domain) {
    const { data: sameDomain } = await db
      .from("projects")
      .select("id, name")
      .eq("domain", domain)
      .limit(500);
    for (const p of (sameDomain ?? []) as Array<{ id: string; name: string }>) {
      if (!affected.has(p.id) && p.name) {
        affected.set(p.id, { projectId: p.id, projectName: p.name, reason: "domain_match" });
      }
    }
  }

  return [...affected.values()];
}

function projectName(rel: unknown): string | null {
  if (Array.isArray(rel)) return (rel[0] as { name?: string } | undefined)?.name ?? null;
  return (rel as { name?: string } | null)?.name ?? null;
}
