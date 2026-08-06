import { createServiceClient } from "@/lib/supabase/service";

/**
 * لوحة مكتبة المجال (الجزء الموسّع) — نظرة تجميعية للخبرة القياسية.
 *
 * قراءة رشيقة: لو الجداول (٠٠٨١) غير مطبَّقة، ترجع أصفارًا بدل ما تفشل.
 */

export interface DomainDashboard {
  ready: boolean;
  totals: {
    packages: number;
    published: number;
    items: number;
    bestPractices: number;
    workflows: number;
    benefitingProjects: number;
  };
  mostUsed: Array<{ name: string; domain: string; usage: number; quality: number }>;
  leastUsed: Array<{ name: string; domain: string; usage: number; quality: number }>;
  /** التغطية لكل مجال: عدد الحزم المنشورة ومتوسّط جودتها. */
  byDomain: Array<{ domain: string; packages: number; avgQuality: number }>;
}

export async function getDomainDashboard(): Promise<DomainDashboard> {
  const db = createServiceClient();

  const summary = await db.rpc("domain_library_summary");
  if (summary.error) {
    return emptyDashboard(!summary.error);
  }

  const s = (summary.data ?? [])[0] as Record<string, number> | undefined;

  const { data: pkgs, error } = await db
    .from("domain_packages")
    .select("name, domain, usage_count, quality_score, status")
    .order("usage_count", { ascending: false })
    .limit(500);

  if (error) return emptyDashboard(false);

  const rows = (pkgs ?? []) as Array<{ name: string; domain: string; usage_count: number; quality_score: number; status: string }>;
  const published = rows.filter((p) => p.status === "published");

  const mostUsed = rows.slice(0, 5).map((p) => ({ name: p.name, domain: p.domain, usage: p.usage_count, quality: p.quality_score }));
  const leastUsed = [...rows].sort((a, b) => a.usage_count - b.usage_count).slice(0, 5)
    .map((p) => ({ name: p.name, domain: p.domain, usage: p.usage_count, quality: p.quality_score }));

  // تجميع بالمجال.
  const byDomainMap = new Map<string, { packages: number; qualitySum: number }>();
  for (const p of published) {
    const entry = byDomainMap.get(p.domain) ?? { packages: 0, qualitySum: 0 };
    entry.packages += 1;
    entry.qualitySum += p.quality_score;
    byDomainMap.set(p.domain, entry);
  }
  const byDomain = [...byDomainMap.entries()]
    .map(([domain, v]) => ({ domain, packages: v.packages, avgQuality: Math.round(v.qualitySum / v.packages) }))
    .sort((a, b) => b.packages - a.packages);

  return {
    ready: true,
    totals: {
      packages: num(s?.total_packages),
      published: num(s?.published_packages),
      items: num(s?.total_items),
      bestPractices: num(s?.best_practices),
      workflows: num(s?.workflows),
      benefitingProjects: num(s?.benefiting_projects),
    },
    mostUsed,
    leastUsed,
    byDomain,
  };
}

function num(v: number | undefined | null): number {
  return Number(v ?? 0);
}

function emptyDashboard(ready: boolean): DomainDashboard {
  return {
    ready,
    totals: { packages: 0, published: 0, items: 0, bestPractices: 0, workflows: 0, benefitingProjects: 0 },
    mostUsed: [],
    leastUsed: [],
    byDomain: [],
  };
}
