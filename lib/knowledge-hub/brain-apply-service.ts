import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { transitionItem } from "./repository";
import { computeBrainCompleteness } from "@/lib/brain-v2/completeness";
import {
  describeMerge,
  mergeBrainContentAdditive,
} from "@/lib/brain-v2/incremental-merge";
import { getLatestBrainDocument } from "@/lib/brain-v2/service";
import { BRAIN_SECTION_LABELS, type BrainContent, type BrainSectionKey } from "@/lib/brain-v2/types";
import { recordIncrement } from "@/lib/increments/service";
import {
  applyIncomingToContent,
  buildIncomingSections,
  type KnowledgeProposal,
} from "./brain-mapping";
import { listItems, type KnowledgeItem } from "./service";
import { SYNTHESIS_TAG, sectionFromTags } from "./synthesis-service";

/**
 * اعتماد مقترحات مركز المعرفة وإدخالها الـ Brain **إضافيًا**.
 *
 * دي الحلقة الأخيرة: المستند بيتحوّل لمعرفة، المعرفة بتتوّلف لمقترح،
 * والمقترح — بعد موافقة بشرية — بيدخل الـ Brain كزيادة مستقلة.
 *
 * ثلاث ضمانات:
 *
 * 1. **الاعتماد بشري.** المقترح مابيدخلش لوحده. مستند واحد ممكن يغيّر
 *    قواعد عمل المشروع، والقرار ده مش قرار نموذج.
 * 2. **الدمج إضافي.** بيستخدم نفس `mergeBrainContentAdditive` بتاع
 *    الاجتماعات والجلسات — فالمحتوى القائم وتعديلات الـ PM ما بتتمسّش،
 *    والتكرار بيتشال تلقائيًا.
 * 3. **كل اعتماد = زيادة مسجّلة.** فيقدر يتولّد له قسم PRD خاص وبرومت
 *    خاص، من غير ما يعيد بناء أي مرحلة قديمة.
 */

/** المقترح المعتمَد بياخد الوسم ده فمايتقدّمش تاني. */
export const APPLIED_TAG = "brain_applied";

export interface ApplyOutcome {
  status: "no_draft" | "nothing_to_apply" | "applied" | "failed";
  message?: string;
  addedItems?: number;
  appliedIds?: string[];
  changedSections?: BrainSectionKey[];
}

/** المقترحات المتاحة للاعتماد: ناتجة عن توليف، نشطة، ولسه ما اتطبّقتش. */
export function pendingProposals(items: KnowledgeItem[]): KnowledgeItem[] {
  return items.filter(
    (item) =>
      item.status === "active" &&
      (item.tags ?? []).includes(SYNTHESIS_TAG) &&
      !(item.tags ?? []).includes(APPLIED_TAG) &&
      sectionFromTags(item.tags) !== null
  );
}

function toProposal(item: KnowledgeItem, sourceTitle: string): KnowledgeProposal | null {
  const section = sectionFromTags(item.tags);
  if (!section) return null;

  const priorityTag = (item.tags ?? []).find((t) => t.startsWith("priority:"));
  const priority = priorityTag?.slice("priority:".length);

  return {
    id: item.id,
    section: section as BrainSectionKey,
    title: item.title,
    detail: item.content === item.title ? "" : item.content,
    confidence: item.confidence,
    priority: priority === "high" || priority === "low" ? priority : "medium",
    evidence: Array.isArray(item.evidence)
      ? (item.evidence as { quote?: string; locator?: string }[])
          .filter((e) => typeof e?.quote === "string" && e.quote.trim().length > 0)
          .map((e) => ({ quote: e.quote as string, locator: e.locator ?? "" }))
      : [],
    sourceTitle,
  };
}

/**
 * يعتمد مقترحات محدّدة (أو كل المعلّق لو مافيش قائمة) ويدمجها في الـ Brain.
 */
export async function applyProposalsToBrain(
  projectId: string,
  proposalIds: string[] | null,
  actorId: string | null
): Promise<ApplyOutcome> {
  const supabase = createServiceClient();

  const allItems = await listItems(supabase, projectId, 2000);
  const pending = pendingProposals(allItems);
  const selected =
    proposalIds && proposalIds.length > 0
      ? pending.filter((i) => proposalIds.includes(i.id))
      : pending;

  if (selected.length === 0) {
    return {
      status: "nothing_to_apply",
      message: "لا توجد مقترحات معلّقة — شغّل التوليف أولًا أو أن كل المقترحات اعتُمدت بالفعل.",
    };
  }

  // الدمج بيحصل على الـ Draft: الاعتماد الرسمي للـ Brain مرحلة منفصلة
  // بمراجعتها وبوابتها، والكتابة المباشرة على نسخة معتمدة كانت هتتخطّاها.
  const draft = await findDraft(supabase, projectId);
  if (!draft) {
    return {
      status: "no_draft",
      message:
        "لا توجد مسودة Project Brain لاستقبال المقترحات — أنشئ المسودة من تبويب Project Brain أولًا.",
    };
  }

  const existingContent = draft.content as BrainContent | null;
  if (!existingContent) {
    return { status: "no_draft", message: "مسودة الـ Brain فارغة." };
  }

  try {
    const sourceTitles = await getSourceTitles(supabase, selected);
    const proposals = selected
      .map((item) => toProposal(item, sourceTitles.get(item.source_id) ?? "مستند"))
      .filter((p): p is KnowledgeProposal => p !== null);

    const { incoming, mappedIds, skippedIds } = buildIncomingSections(proposals);
    if (skippedIds.length > 0) {
      console.warn(
        `[KnowledgeHub] تُخطّي ${skippedIds.length} مقترح لأن قسمه المستهدف غير مدعوم للتحويل.`
      );
    }
    if (mappedIds.length === 0) {
      return { status: "nothing_to_apply", message: "لا يوجد مقترح قابل للتحويل." };
    }

    const candidate = applyIncomingToContent(existingContent, incoming);
    const result = mergeBrainContentAdditive(
      existingContent,
      candidate,
      new Date().toISOString()
    );

    const summary = describeMerge(result, BRAIN_SECTION_LABELS, "مركز المعرفة");

    const { error } = await supabase
      .from("project_brain_documents")
      .update({
        content: result.merged,
        completeness_score: computeBrainCompleteness(result.merged),
        change_summary: summary,
      })
      .eq("id", draft.id);

    if (error) return { status: "failed", message: error.message };

    // تعليم المقترحات كمعتمَدة — حتى اللي الدمج اعتبرها مكرّرة، لأن
    // قرارها اتاخد فعلًا وإعادة عرضها كانت هتبان كأن الاعتماد ما نجحش.
    await markApplied(supabase, selected);

    if (result.totalAdded > 0) {
      await recordIncrement({
        projectId,
        title: `مركز المعرفة — ${mappedIds.length} مقترح معتمَد`,
        sourceType: "file",
        summary,
        delta: result.addedItems,
        addedCount: result.totalAdded,
        brainDocumentId: draft.id,
        brainVersion: draft.version,
        actorId,
      });
    }

    return {
      status: "applied",
      addedItems: result.totalAdded,
      appliedIds: mappedIds,
      changedSections: result.changedSections,
      message: summary,
    };
  } catch (err) {
    console.error(`[KnowledgeHub] فشل اعتماد المقترحات للمشروع ${projectId}:`, err);
    return {
      status: "failed",
      message: err instanceof Error ? err.message : "خطأ غير متوقع أثناء الاعتماد.",
    };
  }
}

/** رفض مقترح — بيتعلّم `rejected` فمايظهرش تاني ولا يدخل الـ Brain. */
export async function rejectProposal(
  proposalId: string
): Promise<{ ok: boolean; message?: string }> {
  // قرار إنسان على حالة عنصر — يمرّ من البوابة عشان يتوثّق في الخط
  // الزمني وينشر حدثًا. الرفض معلومة تخصّ المراجعة لا مجرد تحديث صفّ.
  const outcome = await transitionItem(
    proposalId,
    "rejected",
    { actorKind: "user", reason: "رفض مقترح للعقل" }
  );
  if (outcome.status === "rejected") return { ok: false, message: outcome.reason };
  return { ok: true };
}

async function findDraft(
  supabase: SupabaseClient,
  projectId: string
): Promise<{ id: string; version: number; content: unknown } | null> {
  const { data } = await supabase
    .from("project_brain_documents")
    .select("id, version, content")
    .eq("project_id", projectId)
    .in("status", ["draft", "in_review"])
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (data) return data as { id: string; version: number; content: unknown };

  // مفيش مسودة: بنجرّب آخر وثيقة عشان نقول للمستخدم حاجة مفيدة بدل
  // رسالة عامة — لكن مابنكتبش على نسخة معتمدة.
  const latest = await getLatestBrainDocument(supabase, projectId);
  return latest ? null : null;
}

async function markApplied(supabase: SupabaseClient, items: KnowledgeItem[]): Promise<void> {
  // ختم وسم معالجة داخلي — **لا يمرّ من البوابة عن قصد**.
  //
  // الوسوم من حقول الإصدار، فتمريرها من `updateItem` كان هيولّد
  // إصدارًا لكل ختم. الختم ده علامة تشغيل («العنصر ده اتعالج») لا
  // تغيير في المعرفة نفسها، وتسجيله كإصدار كان هيملأ التاريخ بضجيج
  // يخفي التعديلات الحقيقية.
  await Promise.all(
    items.map((item) =>
      supabase
        .from("knowledge_items")
        .update({ tags: [...new Set([...(item.tags ?? []), APPLIED_TAG])] })
        .eq("id", item.id)
    )
  );
}

async function getSourceTitles(
  supabase: SupabaseClient,
  items: KnowledgeItem[]
): Promise<Map<string, string>> {
  const ids = [...new Set(items.map((i) => i.source_id))];
  if (ids.length === 0) return new Map();
  const { data } = await supabase.from("knowledge_sources").select("id, title").in("id", ids);
  return new Map(((data ?? []) as { id: string; title: string }[]).map((s) => [s.id, s.title]));
}
