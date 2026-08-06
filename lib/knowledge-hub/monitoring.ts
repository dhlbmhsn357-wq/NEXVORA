import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { computeQuality, qualityLevel, type QualityScore } from "./quality";
import { isUsable, type KnowledgeObject, type KnowledgeStatus } from "./model";
import { listTimeline, type TimelineEntry } from "./repository";

/**
 * مراقبة مركز المعرفة.
 *
 * ## استعلامات مقصودة القِلّة
 *
 * اللوحة بتعرض عشرة أرقام. الطريقة الساذجة عشرة استعلامات — وده نفس
 * النمط اللي أسقط المنصة في تدقيق المرحلة الأولى.
 *
 * الأرقام المجمّعة بتيجي من دالة واحدة (`knowledge_hub_health`)،
 * والجودة بتتحسب في الذاكرة من العناصر اللي اتقروا مرة واحدة.
 * الإجمالي **أربع رحلات** لكل اللوحة.
 */

export interface KnowledgeMonitoring {
  counts: {
    sources: number;
    readySources: number;
    failedSources: number;
    items: number;
    relations: number;
    gaps: number;
    conflicts: number;
    versions: number;
    pendingReviews: number;
  };
  avgConfidence: number | null;
  lastIngestAt: Date | null;

  quality: QualityScore;
  qualityLevel: ReturnType<typeof qualityLevel>;

  /** نمو المعرفة عبر آخر ثلاثين يومًا — لعرض الاتجاه. */
  growth: GrowthPoint[];
  byCategory: CategoryCount[];
  bySourceType: CategoryCount[];
  byStatus: Array<{ status: string; count: number }>;

  timeline: TimelineEntry[];
  /** هل الجداول الجديدة مطبَّقة أصلًا؟ */
  ready: boolean;

  /**
   * ملخّص ذكاء الأعمال المهيكل (الجزء الثالث). `null` لو ترحيل ٠٠٧٧ لسه
   * مش مطبَّق — اللوحة بتخفي القسم بدل ما تفشل.
   */
  processing: ProcessingSummary | null;

  /**
   * ملخّص الطبقة الاستشارية (الجزء الخامس). `null` لو ترحيل ٠٠٧٩ لسه
   * مش مطبَّق.
   */
  intelligence: IntelligenceSummary | null;

  /**
   * ملخّص الحوكمة والجودة (الجزء الثامن). `null` لو ترحيل ٠٠٨٠ لسه مش
   * مطبَّق.
   */
  governance: GovernanceSummary | null;
}

export interface IntelligenceSummary {
  openInsights: number;
  criticalInsights: number;
  acceptedInsights: number;
  maturity: number | null;
  readiness: number | null;
}

export interface GovernanceSummary {
  activePolicies: number;
  qaScore: number | null;
  qaIssues: number | null;
  packages: number;
}

export interface ProcessingSummary {
  entities: number;
  relations: number;
  rules: number;
  workflows: number;
  requirements: number;
  decisions: number;
  risks: number;
}

export interface GrowthPoint {
  date: string;
  added: number;
  cumulative: number;
}

export interface CategoryCount {
  key: string;
  count: number;
}

interface HealthRow {
  source_count: number;
  ready_sources: number;
  failed_sources: number;
  item_count: number;
  relation_count: number;
  gap_count: number;
  conflict_count: number;
  version_count: number;
  pending_reviews: number;
  avg_confidence: number | null;
  last_ingest_at: string | null;
}

interface ItemRow {
  id: string;
  title: string;
  content: string;
  category: string;
  tags: string[] | null;
  status: string;
  confidence: number;
  importance: number | null;
  content_hash: string | null;
  created_at: string;
  updated_at: string;
}

export async function collectMonitoring(
  projectId: string,
  client?: SupabaseClient
): Promise<KnowledgeMonitoring> {
  const db = client ?? createServiceClient();

  const [healthResult, itemsResult, conflictsResult, timeline, processingResult, intelligenceResult, governanceResult] = await Promise.all([
    db.rpc("knowledge_hub_health", { p_project_id: projectId }),
    db
      .from("knowledge_items")
      .select(
        "id, title, content, category, tags, status, confidence, importance, content_hash, created_at, updated_at"
      )
      .eq("project_id", projectId)
      // سقف صريح: مشروع بعشرات الآلاف من العناصر مايجوزش يجرّهم كلهم
      // للذاكرة عشان يعرض عشرة أرقام. الجودة تقدير على عيّنة كبيرة
      // وده كافٍ لغرض العرض.
      .limit(5000),
    db
      .from("knowledge_conflicts")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId)
      .eq("status", "open"),
    listTimeline(projectId, { limit: 30 }, db).catch(() => [] as TimelineEntry[]),
    // ملخّص ذكاء الأعمال المهيكل (٠٠٧٧). لو الترحيل مش مطبَّق الـ RPC
    // بيرجّع خطأ، والقسم بيختفي بدل ما تفشل اللوحة كلها.
    db.rpc("knowledge_processing_summary", { p_project_id: projectId }),
    // ملخّص الطبقة الاستشارية (٠٠٧٩). نفس المعاملة الرشيقة.
    db.rpc("knowledge_intelligence_summary", { p_project_id: projectId }),
    // ملخّص الحوكمة والجودة (٠٠٨٠).
    db.rpc("knowledge_governance_summary", { p_project_id: projectId }),
  ]);

  const health = ((healthResult.data ?? [])[0] ?? null) as HealthRow | null;
  const rows = (itemsResult.data ?? []) as ItemRow[];
  const ready = !healthResult.error;

  const intelRow = (intelligenceResult.error
    ? null
    : ((intelligenceResult.data ?? [])[0] ?? null)) as Record<string, number | null> | null;
  const intelligence: IntelligenceSummary | null = intelRow
    ? {
        openInsights: num(intelRow.open_insights),
        criticalInsights: num(intelRow.critical_insights),
        acceptedInsights: num(intelRow.accepted_insights),
        maturity: intelRow.latest_maturity != null ? Number(intelRow.latest_maturity) : null,
        readiness: intelRow.latest_readiness != null ? Number(intelRow.latest_readiness) : null,
      }
    : null;

  const govRow = (governanceResult.error
    ? null
    : ((governanceResult.data ?? [])[0] ?? null)) as Record<string, number | null> | null;
  const governance: GovernanceSummary | null = govRow
    ? {
        activePolicies: num(govRow.active_policies),
        qaScore: govRow.latest_qa_score != null ? Number(govRow.latest_qa_score) : null,
        qaIssues: govRow.latest_qa_issues != null ? Number(govRow.latest_qa_issues) : null,
        packages: num(govRow.packages_count),
      }
    : null;

  const processingRow = (processingResult.error
    ? null
    : ((processingResult.data ?? [])[0] ?? null)) as Record<string, number | string> | null;
  const processing: ProcessingSummary | null = processingRow
    ? {
        entities: num(processingRow.entities as number),
        relations: num(processingRow.relations as number),
        rules: num(processingRow.rules as number),
        workflows: num(processingRow.workflows as number),
        requirements: num(processingRow.requirements as number),
        decisions: num(processingRow.decisions as number),
        risks: num(processingRow.risks as number),
      }
    : null;

  const objects = rows.map(toKnowledgeObject);
  const quality = computeQuality({
    objects,
    openConflicts: conflictsResult.count ?? health?.conflict_count ?? 0,
    openGaps: health?.gap_count ?? 0,
  });

  return {
    counts: {
      sources: num(health?.source_count),
      readySources: num(health?.ready_sources),
      failedSources: num(health?.failed_sources),
      items: num(health?.item_count),
      relations: num(health?.relation_count),
      gaps: num(health?.gap_count),
      conflicts: num(health?.conflict_count),
      versions: num(health?.version_count),
      pendingReviews: num(health?.pending_reviews),
    },
    avgConfidence: health?.avg_confidence != null ? Math.round(Number(health.avg_confidence)) : null,
    lastIngestAt: health?.last_ingest_at ? new Date(health.last_ingest_at) : null,

    quality,
    qualityLevel: qualityLevel(quality.overall),

    growth: buildGrowth(rows),
    byCategory: countBy(objects.filter((o) => isUsable(o.status)), (o) => o.category),
    bySourceType: countBy(objects, (o) => o.sourceType),
    byStatus: countBy(objects, (o) => o.status).map(({ key, count }) => ({ status: key, count })),

    timeline,
    ready,
    processing,
    intelligence,
    governance,
  };
}

/**
 * يبني منحنى النمو لآخر ثلاثين يومًا.
 *
 * الأيام الفاضية **تُملأ بصفر** لا تُحذف: منحنى بيقفز من ١ يونيو
 * لـ٢٠ يونيو بيبان كأن النمو متواصل، وهو في الحقيقة توقّف تسعتاشر
 * يومًا.
 */
export function buildGrowth(
  rows: Array<{ created_at: string }>,
  now: Date = new Date(),
  days = 30
): GrowthPoint[] {
  const perDay = new Map<string, number>();
  for (const row of rows) {
    const key = row.created_at.slice(0, 10);
    perDay.set(key, (perDay.get(key) ?? 0) + 1);
  }

  const start = new Date(now.getTime() - (days - 1) * 86_400_000);
  // التراكمي بيبدأ من كل اللي اتضاف **قبل** النافذة، وإلا المنحنى
  // بيبان كأن المشروع بدأ من الصفر من ثلاثين يومًا.
  const startKey = start.toISOString().slice(0, 10);
  let cumulative = rows.filter((r) => r.created_at.slice(0, 10) < startKey).length;

  const points: GrowthPoint[] = [];
  for (let i = 0; i < days; i++) {
    const date = new Date(start.getTime() + i * 86_400_000).toISOString().slice(0, 10);
    const added = perDay.get(date) ?? 0;
    cumulative += added;
    points.push({ date, added, cumulative });
  }

  return points;
}

export function countBy<T>(items: T[], key: (item: T) => string): CategoryCount[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    const k = key(item) || "unknown";
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([k, count]) => ({ key: k, count }))
    .sort((a, b) => b.count - a.count);
}

function toKnowledgeObject(row: ItemRow): KnowledgeObject {
  return {
    id: row.id,
    projectId: "",
    workspaceId: null,
    // نوع المصدر مش محفوظ على العنصر في ٠٠٧١ — الوسوم أقرب مؤشّر
    // متاح، وتركه فاضيًا كان هيخلّي التوزيع بلا معنى.
    sourceType: (row.tags ?? []).find((t) => t.startsWith("source:"))?.slice(7) ?? "document",
    sourceId: null,
    title: row.title ?? "",
    content: row.content ?? "",
    summary: null,
    language: null,
    category: row.category ?? "unknown",
    tags: row.tags ?? [],
    status: normalizeStatus(row.status),
    confidence: row.confidence ?? 50,
    importance: row.importance ?? 50,
    version: 1,
    contentHash: row.content_hash,
    visibility: "project",
    ownerId: null,
    createdBy: null,
    updatedBy: null,
    metadata: {},
    relationships: [],
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    reviewedAt: null,
  };
}

/**
 * يترجم حالات ٠٠٧١ لحالات النموذج الموحّد.
 *
 * ٠٠٧١ بيستخدم `active/superseded/rejected/merged`، والنموذج بيستخدم
 * تسع حالات أوسع. الترجمة هنا لا في القاعدة: تغيير القيم المخزَّنة كان
 * هيحتاج ترحيلًا يلمس كل صفّ، والفايدة صفر.
 */
function normalizeStatus(status: string): KnowledgeStatus {
  switch (status) {
    case "active":
      return "indexed";
    case "superseded":
      return "outdated";
    case "merged":
      return "archived";
    case "rejected":
      return "rejected";
    default:
      return (status as KnowledgeStatus) ?? "pending";
  }
}

function num(value: number | undefined | null): number {
  return Number(value ?? 0);
}
