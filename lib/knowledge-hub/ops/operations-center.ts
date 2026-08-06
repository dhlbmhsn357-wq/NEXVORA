import { createServiceClient } from "@/lib/supabase/service";
import {
  collectQueueOverview,
  collectWorkerSnapshots,
  toHealthSnapshot,
} from "@/lib/queue/metrics";
import { assessSystem, type HealthLevel } from "@/lib/queue/health";

/**
 * مركز العمليات الموحّد (الجزء الثامن).
 *
 * ## البناء فوق الموجود
 *
 * صحة الطابور والعمّال (`queue/health` + `queue/metrics`) موجودة، وصحة
 * المعرفة (`knowledge-hub/health`) موجودة. ده **بيجمّعهم في نظرة واحدة**
 * بدل لوحتين منفصلتين — «حالة النظام كله في شاشة».
 *
 * كله قراءة رشيقة: أي مصدر يفشل بيرجع «غير متاح» بدل ما يُسقط اللوحة.
 */

export interface OpsSection {
  key: string;
  label: string;
  level: HealthLevel | "unavailable";
  detail: string;
}

export interface OperationsCenter {
  overallLevel: HealthLevel | "unavailable";
  sections: OpsSection[];
  queue: {
    depth: number;
    processing: number;
    failed: number;
    completed: number;
    liveWorkers: number;
  } | null;
  generatedAt: string;
}

const LEVEL_ORDER: Record<HealthLevel | "unavailable", number> = {
  healthy: 0,
  degraded: 1,
  unavailable: 2,
  critical: 3,
};

export async function getOperationsCenter(generatedAt: string): Promise<OperationsCenter> {
  const db = createServiceClient();
  const sections: OpsSection[] = [];
  let queue: OperationsCenter["queue"] = null;

  // --- الطابور والعمّال ---
  try {
    const overview = await collectQueueOverview(db);
    const workers = await collectWorkerSnapshots(db);
    const snapshot = toHealthSnapshot(overview);
    const report = assessSystem(snapshot, workers);
    const live = workers.filter((w) => w.status !== "stopped").length;

    const processing = snapshot.countsByStatus.running ?? 0;

    queue = {
      depth: report.queueDepth,
      processing,
      failed: snapshot.failedRecently,
      completed: snapshot.completedRecently,
      liveWorkers: live,
    };
    sections.push({
      key: "queue",
      label: "الطابور والعمّال",
      level: report.level,
      detail: `${report.queueDepth} في الانتظار · ${processing} قيد المعالجة · ${live} عامل حيّ`,
    });
  } catch {
    sections.push({ key: "queue", label: "الطابور والعمّال", level: "unavailable", detail: "تعذّر جمع صحة الطابور." });
  }

  // --- صحة المعرفة (لكل مشاريع لديها معرفة) ---
  try {
    const { count } = await db
      .from("knowledge_items")
      .select("id", { count: "exact", head: true })
      .eq("status", "active");
    sections.push({
      key: "knowledge",
      label: "المعرفة",
      level: "healthy",
      detail: `${count ?? 0} عنصر معرفة نشط عبر المنصة`,
    });
  } catch {
    sections.push({ key: "knowledge", label: "المعرفة", level: "unavailable", detail: "جداول المعرفة غير مطبَّقة." });
  }

  // --- الذكاء الاصطناعي (فشل حديث) ---
  try {
    const since = new Date(Date.parse(generatedAt) - 24 * 3600_000).toISOString();
    const { count: failures } = await db
      .from("ai_requests_log")
      .select("id", { count: "exact", head: true })
      .eq("success", false)
      .gte("created_at", since);
    const level: HealthLevel = (failures ?? 0) > 50 ? "degraded" : "healthy";
    sections.push({
      key: "ai",
      label: "الذكاء الاصطناعي",
      level,
      detail: `${failures ?? 0} فشل في آخر ٢٤ ساعة`,
    });
  } catch {
    sections.push({ key: "ai", label: "الذكاء الاصطناعي", level: "unavailable", detail: "تعذّر جمع مقاييس الذكاء." });
  }

  const overallLevel = sections.reduce<HealthLevel | "unavailable">((worst, s) => {
    return LEVEL_ORDER[s.level] > LEVEL_ORDER[worst] ? s.level : worst;
  }, "healthy");

  return { overallLevel, sections, queue, generatedAt };
}
