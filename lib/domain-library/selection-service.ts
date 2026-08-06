import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { selectDomainPackages, type CandidatePackage } from "./selection";

/**
 * خدمة اختيار حزم المجال للمشروع — الاختيار الذكي (الجزء الموسّع).
 *
 * بتقرأ مجال المشروع وكلمات معرفته، بترشّح الحزم المنشورة المناسبة عبر
 * `selectDomainPackages` النقي، وبتخزّن الاختيار مع درجة الملاءمة
 * وتزوّد عدّاد استخدام الحزمة.
 */

const UNDEFINED_TABLE = "42P01";

export interface SelectionOutcome {
  status: "ok" | "unavailable";
  selected: number;
  message?: string;
}

/**
 * يختار الحزم المناسبة للمشروع تلقائيًا ويخزّنها.
 */
export async function selectPackagesForProject(
  projectId: string,
  client?: SupabaseClient
): Promise<SelectionOutcome> {
  const db = client ?? createServiceClient();

  const project = await db.from("projects").select("domain").eq("id", projectId).maybeSingle();
  const projectDomain = ((project.data?.domain as string | null) ?? "generic").trim() || "generic";

  // كلمات معرفة المشروع: أسماء الكيانات + وحدات المتطلبات (لو الجداول موجودة).
  const projectKeywords = await gatherProjectKeywords(db, projectId);

  // الحزم المنشورة كمرشّحين مع كلماتها المفتاحية.
  const { data: packages, error } = await db
    .from("domain_packages")
    .select("id, domain, name")
    .eq("status", "published")
    .limit(500);

  if (error) {
    if (error.code === UNDEFINED_TABLE) return { status: "unavailable", selected: 0, message: "المكتبة غير مطبَّقة بعد." };
    return { status: "ok", selected: 0, message: error.message };
  }

  const packageRows = (packages ?? []) as Array<{ id: string; domain: string; name: string }>;
  if (packageRows.length === 0) return { status: "ok", selected: 0 };

  // كلمات كل حزمة من عناوين بنودها.
  const candidates: CandidatePackage[] = await Promise.all(
    packageRows.map(async (p) => ({
      id: p.id,
      domain: p.domain,
      name: p.name,
      keywords: await gatherPackageKeywords(db, p.id, p.name),
    }))
  );

  const selections = selectDomainPackages({ projectDomain, projectKeywords }, candidates);

  // أعلى ٦ حزم ملاءمة — تفادي إغراق المشروع بكل الحزم.
  const top = selections.slice(0, 6);
  if (top.length === 0) return { status: "ok", selected: 0 };

  const rows = top.map((s) => ({
    project_id: projectId,
    package_id: s.packageId,
    relevance: s.relevance,
    selected_by: "auto",
    rationale: s.rationale,
  }));

  const { error: upsertErr } = await db
    .from("project_domain_packages")
    .upsert(rows, { onConflict: "project_id,package_id", ignoreDuplicates: true });
  if (upsertErr) return { status: "ok", selected: 0, message: upsertErr.message };

  // زيادة عدّاد الاستخدام للحزم المختارة (best-effort).
  for (const s of top) {
    const { data } = await db.from("domain_packages").select("usage_count").eq("id", s.packageId).maybeSingle();
    await db.from("domain_packages").update({ usage_count: ((data?.usage_count as number) ?? 0) + 1 }).eq("id", s.packageId);
  }

  return { status: "ok", selected: top.length };
}

/** الحزم المختارة لمشروع — لمحرّك الدمج والعرض. */
export async function listProjectPackages(
  projectId: string,
  client?: SupabaseClient
): Promise<Array<{ package_id: string; relevance: number; rationale: string }>> {
  const db = client ?? createServiceClient();
  const { data, error } = await db
    .from("project_domain_packages")
    .select("package_id, relevance, rationale")
    .eq("project_id", projectId)
    .order("relevance", { ascending: false });
  if (error) return [];
  return (data ?? []) as Array<{ package_id: string; relevance: number; rationale: string }>;
}

async function gatherProjectKeywords(db: SupabaseClient, projectId: string): Promise<string[]> {
  const words: string[] = [];
  try {
    const [entities, requirements] = await Promise.all([
      db.from("knowledge_entities").select("name, entity_type").eq("project_id", projectId).eq("status", "active").limit(500),
      db.from("knowledge_requirements").select("module").eq("project_id", projectId).eq("status", "active").limit(500),
    ]);
    for (const e of (entities.data ?? []) as Array<{ name: string; entity_type: string }>) {
      if (e.name) words.push(e.name);
      if (e.entity_type) words.push(e.entity_type);
    }
    for (const r of (requirements.data ?? []) as Array<{ module: string | null }>) {
      if (r.module) words.push(r.module);
    }
  } catch {
    // الجداول قد تكون غير مطبَّقة — نرجع بما جمعناه.
  }
  return words;
}

async function gatherPackageKeywords(db: SupabaseClient, packageId: string, name: string): Promise<string[]> {
  const words = name.split(/\s+/);
  try {
    const { data } = await db.from("domain_package_items").select("title").eq("package_id", packageId).limit(200);
    for (const it of (data ?? []) as Array<{ title: string }>) {
      if (it.title) words.push(...it.title.split(/\s+/));
    }
  } catch {
    /* تجاهل */
  }
  return words;
}
