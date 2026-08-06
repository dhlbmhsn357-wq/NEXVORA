import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import type { ProjectDomain, BusinessModule } from "@/lib/types/database";
import { MODULE_CATALOG, analyzeArchitecture } from "./module-catalog";

/**
 * خدمة مكتبة الوحدات (Business Module Library) — بتعيد استخدام عُقد
 * المعرفة المشتقّة من الـ Brain (knowledge_nodes) لاكتشاف الوحدات
 * الموجودة/الناقصة لكل مشروع، وبتنمّي المكتبة org-wide مع كل مشروع.
 * كل شيء best-effort — فشلها لا يكسر اعتماد الـ Brain.
 */

/** يجيب عناوين عُقد المعرفة النشطة لمشروع (المصدر: Brain v2). */
export async function getActiveNodeTitles(projectId: string): Promise<string[]> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("knowledge_nodes")
    .select("title")
    .eq("project_id", projectId)
    .eq("status", "active");
  return ((data ?? []) as { title: string }[]).map((r) => r.title).filter(Boolean);
}

async function getProjectDomain(projectId: string): Promise<ProjectDomain> {
  const supabase = createServiceClient();
  const { data } = await supabase.from("projects").select("domain").eq("id", projectId).maybeSingle();
  return ((data as { domain?: ProjectDomain } | null)?.domain ?? "generic") as ProjectDomain;
}

/**
 * يكتشف وحدات المشروع من عناوين عُقده، يخزّن project_module_detections،
 * وينمّي business_modules (occurrence_count + دمج source_project_ids).
 */
export async function detectAndUpsertModules(projectId: string): Promise<{ ok: boolean; detected: number }> {
  const supabase = createServiceClient();
  const [domain, titles] = await Promise.all([getProjectDomain(projectId), getActiveNodeTitles(projectId)]);
  if (titles.length === 0) return { ok: true, detected: 0 };

  const analysis = analyzeArchitecture(domain, titles);
  let detected = 0;

  for (const presence of analysis.presentModules) {
    const def = MODULE_CATALOG[presence.key];
    if (!def) continue;
    detected++;

    // 1) اكتشاف على مستوى المشروع (upsert)
    await supabase.from("project_module_detections").upsert(
      {
        project_id: projectId,
        module_key: presence.key,
        present: true,
        detected_features: presence.detectedFeatures,
        missing_features: presence.missingFeatures,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "project_id,module_key" }
    );

    // 2) تنمية المكتبة org-wide
    const { data: existing } = await supabase
      .from("business_modules")
      .select("id, source_project_ids, occurrence_count, features")
      .eq("module_key", presence.key)
      .maybeSingle();

    if (existing) {
      const ids = new Set<string>([...(existing.source_project_ids ?? []), projectId]);
      const isNewProject = !(existing.source_project_ids ?? []).includes(projectId);
      const mergedFeatures = [...new Set<string>([...(existing.features ?? []), ...presence.detectedFeatures])];
      await supabase
        .from("business_modules")
        .update({
          source_project_ids: [...ids],
          occurrence_count: (existing.occurrence_count ?? 1) + (isNewProject ? 1 : 0),
          features: mergedFeatures,
          status: ids.size >= 2 ? "validated" : "candidate",
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
    } else {
      await supabase.from("business_modules").insert({
        module_key: def.key,
        name: def.name,
        primary_domain: domain,
        features: presence.detectedFeatures.length ? presence.detectedFeatures : def.features,
        required_permissions: def.requiredPermissions,
        required_reports: def.requiredReports,
        common_mistakes: def.commonMistakes,
        source_project_ids: [projectId],
        occurrence_count: 1,
        status: "candidate",
      });
    }
  }

  return { ok: true, detected };
}

/** مكتبة الوحدات كاملة (org-wide) — للوحة الذكاء المعماري. */
export async function listBusinessModules(): Promise<BusinessModule[]> {
  const supabase = createServiceClient();
  const { data } = await supabase.from("business_modules").select("*").order("occurrence_count", { ascending: false });
  return (data ?? []) as BusinessModule[];
}
