import { createServiceClient } from "@/lib/supabase/service";

/**
 * لوحة الذاكرة المؤسسية — نظرة على الخبرة المتراكمة.
 *
 * قراءة رشيقة: لو جداول ٠٨٢ غير مطبَّقة، ترجع أصفارًا بدل ما تفشل.
 */

export interface OrgMemoryDashboard {
  ready: boolean;
  totals: {
    experiences: number;
    successPatterns: number;
    failurePatterns: number;
    lessons: number;
    reusableAssets: number;
    pendingReview: number;
    benefitingProjects: number;
  };
  mostUsed: Array<{ title: string; domain: string; usage: number; confidence: number }>;
  byDomain: Array<{ domain: string; count: number }>;
  /** درجة الذكاء المؤسسي: مركّبة من الحجم × الثقة × الاستخدام. */
  intelligenceScore: number;
}

export async function getOrgMemoryDashboard(): Promise<OrgMemoryDashboard> {
  const db = createServiceClient();

  const summary = await db.rpc("org_memory_summary");
  if (summary.error) return empty(false);

  const s = (summary.data ?? [])[0] as Record<string, number> | undefined;

  const { data: exps, error } = await db
    .from("org_experiences")
    .select("title, domain, usage_count, confidence, status")
    .eq("status", "published")
    .order("usage_count", { ascending: false })
    .limit(500);
  if (error) return empty(false);

  const rows = (exps ?? []) as Array<{ title: string; domain: string; usage_count: number; confidence: number }>;

  const mostUsed = rows.slice(0, 5).map((e) => ({ title: e.title, domain: e.domain, usage: e.usage_count, confidence: e.confidence }));

  const byDomainMap = new Map<string, number>();
  for (const e of rows) byDomainMap.set(e.domain, (byDomainMap.get(e.domain) ?? 0) + 1);
  const byDomain = [...byDomainMap.entries()].map(([domain, count]) => ({ domain, count })).sort((a, b) => b.count - a.count);

  // درجة الذكاء المؤسسي: متوسّط الثقة موزونًا بالاستخدام، مقيّدًا بالحجم.
  const total = rows.length;
  const avgConfidence = total > 0 ? rows.reduce((a, b) => a + b.confidence, 0) / total : 0;
  const usageFactor = total > 0 ? Math.min(1, rows.reduce((a, b) => a + b.usage_count, 0) / (total * 5)) : 0;
  const sizeFactor = 1 - Math.exp(-total / 20);
  const intelligenceScore = Math.round(avgConfidence * 0.5 + usageFactor * 100 * 0.25 + sizeFactor * 100 * 0.25);

  return {
    ready: true,
    totals: {
      experiences: num(s?.total_experiences),
      successPatterns: num(s?.success_patterns),
      failurePatterns: num(s?.failure_patterns),
      lessons: num(s?.lessons),
      reusableAssets: num(s?.reusable_assets),
      pendingReview: num(s?.pending_review),
      benefitingProjects: num(s?.benefiting_projects),
    },
    mostUsed,
    byDomain,
    intelligenceScore,
  };
}

function num(v: number | undefined | null): number {
  return Number(v ?? 0);
}

function empty(ready: boolean): OrgMemoryDashboard {
  return {
    ready,
    totals: { experiences: 0, successPatterns: 0, failurePatterns: 0, lessons: 0, reusableAssets: 0, pendingReview: 0, benefitingProjects: 0 },
    mostUsed: [],
    byDomain: [],
    intelligenceScore: 0,
  };
}
