import { createServiceClient } from "@/lib/supabase/service";
import { getArchitectureReport } from "@/lib/architecture-validation/service";
import { editBrainSection, getLatestBrainDocument } from "./service";
import {
  architectureReportToSuggestion,
  groupAcceptedRecommendations,
  mergeSuggestions,
} from "./recommendation-brain-mapping";
import type { BrainContent, SuggestionItem } from "./types";
import type { ProjectRecommendation } from "@/lib/types/database";

export type SyncRecommendationsResult =
  | { ok: true; addedCount: number; backfilledCount: number; skippedDuplicates: number }
  | { ok: false; message: string };

type TargetSection = "suggested_features" | "suggested_integrations";

/**
 * يكتب التوصيات المعمارية والفنية **المقبولة** + القرار المعماري داخل
 * مسوّدة Project Brain فعليًا — مش عرضًا في لوحة منفصلة بس.
 *
 * ليه الكتابة المباشرة في المسودة (مش Pending Changes زي الاجتماعات):
 * الـ Pending Changes مصمّمة لتحديث Brain **معتمد** أصلًا، وبتتجاهل
 * بهدوء لو مفيش نسخة معتمدة (شوف pending-changes-service). التوصيات
 * دي بتتعمل *قبل* اعتماد الـ Brain، وقرار قبولها هو نفسه بوابة المراجعة
 * البشرية — فتكرار بوابة تانية بيخفي المحتوى بدل ما يحميه.
 *
 * التكرار محسوب: أي عنصر بنفس العنوان مش بيتضاف تاني، فتقدر تشغّلها
 * أكتر من مرة بأمان.
 */
export async function syncAcceptedRecommendationsToBrain(
  projectId: string,
  actorId: string | null
): Promise<SyncRecommendationsResult> {
  const supabase = createServiceClient();

  const doc = await getLatestBrainDocument(supabase, projectId);
  if (!doc) {
    return {
      ok: false,
      message: "مفيش مسودة Project Brain لسه — ابنِ الـ Brain الأول من تبويب Project Brain، وبعدها اعتمد التوصيات.",
    };
  }
  if (doc.status !== "draft" && doc.status !== "in_review") {
    return {
      ok: false,
      message: "نسخة الـ Brain الحالية معتمدة/مؤرشفة — أنشئ مسودة جديدة قبل إضافة التوصيات.",
    };
  }

  const { data: recsRaw } = await supabase
    .from("project_recommendations")
    .select("*")
    .eq("project_id", projectId)
    .eq("status", "accepted");
  const accepted = (recsRaw as ProjectRecommendation[] | null) ?? [];

  const grouped = groupAcceptedRecommendations(accepted);

  // القرار المعماري بيتضاف كعنصر واحد ضمن المزايا المقترحة.
  const report = await getArchitectureReport(projectId);
  if (report) {
    const archItem = architectureReportToSuggestion(report);
    if (archItem) grouped.suggested_features.unshift(archItem);
  }

  const totalIncoming = grouped.suggested_features.length + grouped.suggested_integrations.length;
  if (totalIncoming === 0) {
    return {
      ok: false,
      message: "مفيش توصيات مقبولة ولا قرار معماري جاهز للإضافة — اقبل توصية واحدة على الأقل الأول.",
    };
  }

  let addedTotal = 0;
  let backfilledTotal = 0;
  let currentDocId = doc.id;
  let expectedUpdatedAt = doc.updated_at;
  let content = doc.content as BrainContent;

  for (const sectionKey of ["suggested_features", "suggested_integrations"] as TargetSection[]) {
    const incoming = grouped[sectionKey];
    if (incoming.length === 0) continue;

    const existing = (content[sectionKey]?.content as SuggestionItem[] | undefined) ?? [];
    const { merged, addedCount, backfilledCount } = mergeSuggestions(existing, incoming);
    if (addedCount === 0 && backfilledCount === 0) continue;

    const result = await editBrainSection({
      documentId: currentDocId,
      sectionKey,
      newContent: merged,
      expectedUpdatedAt,
      reason: "إضافة التوصيات المعمارية والفنية المعتمدة",
      actorId,
    });
    if (!result.ok) return { ok: false, message: result.message ?? "فشل تحديث الـ Brain." };

    addedTotal += addedCount;
    backfilledTotal += backfilledCount;

    // نعيد قراءة الوثيقة عشان updated_at الجديد (القفل التفاؤلي) والمحتوى المحدّث.
    const refreshed = await getLatestBrainDocument(supabase, projectId);
    if (!refreshed) break;
    currentDocId = refreshed.id;
    expectedUpdatedAt = refreshed.updated_at;
    content = refreshed.content as BrainContent;
  }

  return {
    ok: true,
    addedCount: addedTotal,
    backfilledCount: backfilledTotal,
    skippedDuplicates: totalIncoming - addedTotal - backfilledTotal,
  };
}
