import { createServiceClient } from "@/lib/supabase/service";

export interface ExecutiveDashboardMetrics {
  totalKnowledgeItems: number;
  candidateCount: number;
  validatedCount: number;
  approvedCount: number;
  rejectedCount: number;
  projectsProcessed: number;
  totalRecommendations: number;
  acceptedRecommendations: number;
  reuseRatePercent: number;
  confidenceDistribution: { low: number; medium: number; high: number };
  topCategories: Array<{ category: string; count: number }>;
  recentExtractionJobs: Array<{ project_id: string; project_name: string; status: string; extracted_count: number; completed_at: string | null }>;
}

/**
 * مقاييس Executive Dashboard — كلها محسوبة حسابيًا من بيانات حقيقية (لا
 * توليف AI). "Estimated Time Saved" المذكور في المواصفة اتحذف عمدًا —
 * مفيش أي أساس قياس حقيقي له في النظام الحالي (يحتاج Baseline زمني لكل
 * مرحلة قبل/بعد الاستخراج، مش موجود) — عرضه كرقم وهمي كان هيكون اختلاق
 * بيانات، وده ممنوع صراحة في مواصفة هذه المرحلة.
 */
export async function getExecutiveDashboardMetrics(): Promise<ExecutiveDashboardMetrics> {
  const supabase = createServiceClient();

  const [knowledgeResult, recommendationsResult, jobsResult] = await Promise.all([
    supabase.from("organizational_knowledge").select("category, status, confidence_score, occurrence_count"),
    supabase.from("project_recommendations").select("status"),
    supabase
      .from("knowledge_extraction_jobs")
      .select("project_id, status, extracted_count, completed_at, projects(name)")
      .order("completed_at", { ascending: false })
      .limit(10),
  ]);

  const knowledge = (knowledgeResult.data ?? []) as Array<{ category: string; status: string; confidence_score: number; occurrence_count: number }>;
  const recommendations = (recommendationsResult.data ?? []) as Array<{ status: string }>;
  const jobs = (jobsResult.data ?? []) as Array<{ project_id: string; status: string; extracted_count: number; completed_at: string | null; projects: Array<{ name: string }> | null }>;

  const confidenceDistribution = { low: 0, medium: 0, high: 0 };
  const categoryCounts = new Map<string, number>();
  let reused = 0;

  for (const k of knowledge) {
    if (k.confidence_score < 50) confidenceDistribution.low++;
    else if (k.confidence_score < 80) confidenceDistribution.medium++;
    else confidenceDistribution.high++;

    categoryCounts.set(k.category, (categoryCounts.get(k.category) ?? 0) + 1);
    if (k.occurrence_count >= 2) reused++;
  }

  const topCategories = [...categoryCounts.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const { count: projectsProcessed } = await supabase
    .from("knowledge_extraction_jobs")
    .select("project_id", { count: "exact", head: true })
    .eq("status", "ready");

  return {
    totalKnowledgeItems: knowledge.length,
    candidateCount: knowledge.filter((k) => k.status === "candidate").length,
    validatedCount: knowledge.filter((k) => k.status === "validated").length,
    approvedCount: knowledge.filter((k) => k.status === "approved").length,
    rejectedCount: knowledge.filter((k) => k.status === "rejected").length,
    projectsProcessed: projectsProcessed ?? 0,
    totalRecommendations: recommendations.length,
    acceptedRecommendations: recommendations.filter((r) => r.status === "accepted").length,
    reuseRatePercent: knowledge.length > 0 ? Math.round((reused / knowledge.length) * 100) : 0,
    confidenceDistribution,
    topCategories,
    recentExtractionJobs: jobs.map((j) => ({
      project_id: j.project_id,
      project_name: j.projects?.[0]?.name ?? "مشروع محذوف",
      status: j.status,
      extracted_count: j.extracted_count,
      completed_at: j.completed_at,
    })),
  };
}
