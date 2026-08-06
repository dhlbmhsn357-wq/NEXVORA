import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { recordBulkCreation, type BulkCreatedItem } from "./repository";
import { truncateForLog } from "@/lib/observability/safe-log";
import { AITaskType } from "@/lib/ai/types";
import { executeAIWithRateLimitWait } from "@/lib/ai/execute-with-rate-limit-wait";
import { buildKnowledgeSynthesisPrompt } from "@/lib/ai/prompts/knowledge-synthesis";
import {
  OPERATIONAL_LABELS,
  validateKnowledgeSynthesis,
  type OperationalArtifact,
  type SynthesisProposal,
} from "@/lib/ai/validation/knowledge-synthesis";
import { getLatestBrainDocument } from "@/lib/brain-v2/service";
import type { BrainContent } from "@/lib/brain-v2/types";
import {
  brainStatementsToExternal,
  coverageScore,
  crossValidate,
  flattenBrainStatements,
  type ExternalStatement,
} from "./cross-validation";
import { listItems, type KnowledgeItem } from "./service";
import { ENRICHED_TAG } from "./enrichment-service";

/**
 * التوليف والتحقق المتقاطع.
 *
 * الفرق عن الإثراء (الدفعة السابقة): الإثراء بيربط المعرفة ببعضها جوّه
 * المستندات. التوليف بيقارنها بالمصادر التانية (الاكتشاف والاجتماعات
 * والـ Brain) وبيطلّع **عناصر جاهزة للاعتماد** في الـ Brain.
 *
 * التخزين: المقترحات بتتخزّن كعناصر معرفة موسومة `synthesis` مع وسم
 * `brain:<section>` — من غير جدول جديد ولا هجرة. الدفعة الجاية بتقرأ
 * الوسوم دي وتدمجها إضافيًا في الـ Brain.
 */

export const SYNTHESIS_TAG = "synthesis";
export const OPERATIONAL_TAG = "operational";

/** وسم القسم المستهدف: `brain:business_rules`. */
export function brainSectionTag(section: string): string {
  return `brain:${section}`;
}

/** يقرأ القسم المستهدف من وسوم العنصر. */
export function sectionFromTags(tags: string[] | null | undefined): string | null {
  const tag = (tags ?? []).find((t) => t.startsWith("brain:"));
  return tag ? tag.slice("brain:".length) : null;
}

/** أقصى عدد عناصر بيتبعت للتوليف في استدعاء واحد. */
const MAX_ITEMS_PER_CALL = 45;

export interface SynthesisSummary {
  proposalsAdded: number;
  operationalAdded: number;
  confirmedCount: number;
  documentOnlyCount: number;
  unbackedCount: number;
  conflictsAdded: number;
  coverage: number | null;
}

export type SynthesisOutcome =
  | { status: "not_ready"; message: string }
  | { status: "done"; summary: SynthesisSummary }
  | { status: "failed"; message: string };

/** العناصر المؤهّلة للتوليف: نشطة، متعمل لها إثراء، ومش ناتجة عن توليف. */
function eligibleItems(items: KnowledgeItem[]): KnowledgeItem[] {
  return items.filter(
    (item) =>
      item.status === "active" &&
      (item.tags ?? []).includes(ENRICHED_TAG) &&
      !(item.tags ?? []).includes(SYNTHESIS_TAG)
  );
}

/**
 * يشغّل التوليف والتحقق المتقاطع للمشروع.
 *
 * بيتطلّب إن الإثراء يكون خلص: التوليف على معرفة فيها تكرار ما اتدمجش
 * كان هيطلّع نفس القاعدة أربع مرات كأربع مقترحات مختلفة.
 */
export async function runSynthesis(
  projectId: string,
  actorId?: string | null
): Promise<SynthesisOutcome> {
  const supabase = createServiceClient();

  const allItems = await listItems(supabase, projectId, 2000);
  const eligible = eligibleItems(allItems);

  if (allItems.length === 0) {
    return {
      status: "not_ready",
      message: "لا توجد معرفة مستخرجة بعد — ارفع مستندات أولًا.",
    };
  }
  if (eligible.length === 0) {
    const pendingEnrichment = allItems.some(
      (i) => i.status === "active" && !(i.tags ?? []).includes(ENRICHED_TAG)
    );
    return {
      status: "not_ready",
      message: pendingEnrichment
        ? "شغّل الإثراء والربط أولًا — التوليف على معرفة فيها تكرار بيطلّع مقترحات مكرّرة."
        : "كل المعرفة الحالية تم توليفها بالفعل. ارفع مستندات جديدة للمزيد.",
    };
  }

  try {
    const brainDoc = await getLatestBrainDocument(supabase, projectId);
    const brainContent = (brainDoc?.content as BrainContent | null) ?? null;
    const brainStatements = flattenBrainStatements(brainContent);

    const meetingStatements = await loadMeetingDecisions(supabase, projectId);
    const externals: ExternalStatement[] = [
      ...brainStatementsToExternal(brainStatements),
      ...meetingStatements,
    ];

    // --- 1) التحقق المتقاطع الحتمي ---
    const validation = crossValidate(
      eligible.map((i) => ({ id: i.id, title: i.title, content: i.content })),
      externals
    );
    if (validation.truncatedDivergent > 0) {
      console.warn(
        `[KnowledgeHub] استُبعد ${validation.truncatedDivergent} مرشّح تعارض متقاطع في المشروع ${projectId} بسبب السقف.`
      );
    }

    // --- 2) تسجيل مرشّحي التعارض المتقاطع ---
    const conflictsAdded = await recordCrossConflicts(
      supabase,
      projectId,
      validation.divergent,
      eligible
    );

    // --- 3) التوليف بالنموذج ---
    const working = eligible.slice(0, MAX_ITEMS_PER_CALL);
    const refById = new Map(working.map((item, i) => [item.id, `I${i + 1}`]));
    const idByRef = new Map([...refById].map(([id, ref]) => [ref, id]));

    const projectName = await getProjectName(supabase, projectId);

    const prompt = buildKnowledgeSynthesisPrompt({
      projectName,
      items: working.map((item) => ({
        ref: refById.get(item.id) as string,
        category: item.category,
        title: item.title,
        content: item.content,
      })),
      existingBrainStatements: brainStatements.map((s) => s.text),
    });

    const response = await executeAIWithRateLimitWait(AITaskType.KNOWLEDGE_SYNTHESIS, prompt, {
      actorId: actorId ?? undefined,
      projectId,
    });

    if (!response.success) {
      return {
        status: "failed",
        message: response.error?.message ?? "فشل توليف المعرفة.",
      };
    }

    const result = validateKnowledgeSynthesis(
      response.output,
      new Set(idByRef.keys()),
      brainStatements.map((s) => s.text)
    );
    if (!result.ok) {
      console.error(
        `[KnowledgeHub] تعذّر فهم نتيجة التوليف للمشروع ${projectId}: ${truncateForLog(result.reason)}`
      );
      return { status: "failed", message: "لم نتمكن من فهم نتيجة التوليف." };
    }

    if (result.data.droppedUnsourced > 0 || result.data.droppedDuplicate > 0) {
      console.warn(
        `[KnowledgeHub] أُسقط ${result.data.droppedUnsourced} مقترح بلا مرجع و${result.data.droppedDuplicate} مقترح موجود بالفعل في الـ Brain.`
      );
    }

    // --- 4) الكتابة ---
    const proposalsAdded = await writeProposals(
      supabase,
      projectId,
      result.data.proposals,
      working,
      idByRef
    );
    const operationalAdded = await writeOperational(
      supabase,
      projectId,
      result.data.operational,
      working,
      idByRef
    );

    await markSynthesized(supabase, working);

    return {
      status: "done",
      summary: {
        proposalsAdded,
        operationalAdded,
        confirmedCount: validation.confirmed.length,
        documentOnlyCount: validation.documentOnlyItemIds.length,
        unbackedCount: validation.unbackedExternalIds.length,
        conflictsAdded,
        coverage: coverageScore(validation, externals.length),
      },
    };
  } catch (err) {
    console.error(`[KnowledgeHub] فشل غير متوقع أثناء التوليف للمشروع ${projectId}:`, err);
    return {
      status: "failed",
      message: err instanceof Error ? err.message : "خطأ غير متوقع أثناء التوليف.",
    };
  }
}

/**
 * قرارات الاجتماعات كمصادر خارجية للمقارنة.
 *
 * القرار المتّخذ في اجتماع أقوى من إجابة نموذج الاكتشاف، لأنه اتقال
 * بحضور الأطراف وبعد نقاش — فتعارضه مع مستند رسمي يستحق الرصد.
 */
async function loadMeetingDecisions(
  supabase: SupabaseClient,
  projectId: string
): Promise<ExternalStatement[]> {
  const { data: meetings } = await supabase
    .from("meetings")
    .select("id, title")
    .eq("project_id", projectId)
    .is("archived_at", null);

  const rows = (meetings ?? []) as { id: string; title: string }[];
  if (rows.length === 0) return [];

  const { data: decisions, error } = await supabase
    .from("meeting_decisions")
    .select("id, meeting_id, text")
    .in(
      "meeting_id",
      rows.map((m) => m.id)
    );
  if (error) return [];

  const titleById = new Map(rows.map((m) => [m.id, m.title]));
  return ((decisions ?? []) as { id: string; meeting_id: string; text: string }[])
    .filter((d) => typeof d.text === "string" && d.text.trim().length > 0)
    .map((d) => ({
      id: `decision:${d.id}`,
      text: d.text,
      source: "decision" as const,
      label: `قرار اجتماع — ${titleById.get(d.meeting_id) ?? "بلا عنوان"}`,
    }));
}

/**
 * يسجّل مرشّحي التعارض المتقاطع.
 *
 * التسجيل هنا بحالة `open` وبشدّة متوسطة: الطبقة الحتمية بترصد التقارب
 * بلا تطابق، لكن الحكم إن ده تعارض فعلي قرار بشري — نفس مبدأ مركز
 * التعارضات في الدفعة السابقة.
 */
async function recordCrossConflicts(
  supabase: SupabaseClient,
  projectId: string,
  divergent: { itemId: string; externalSource: string; externalLabel: string; externalText: string; score: number }[],
  items: KnowledgeItem[]
): Promise<number> {
  if (divergent.length === 0) return 0;

  const byId = new Map(items.map((i) => [i.id, i]));

  // منع التكرار: لو نفس الزوج اتسجّل قبل كده مانعيدش تسجيله.
  const { data: existing } = await supabase
    .from("knowledge_conflicts")
    .select("left_item_id, right_statement")
    .eq("project_id", projectId)
    .not("external_source", "is", null);

  const seen = new Set(
    ((existing ?? []) as { left_item_id: string | null; right_statement: string }[]).map(
      (c) => `${c.left_item_id}|${c.right_statement}`
    )
  );

  const rows = divergent
    .map((d) => {
      const item = byId.get(d.itemId);
      if (!item) return null;
      if (seen.has(`${item.id}|${d.externalText}`)) return null;
      return {
        project_id: projectId,
        left_item_id: item.id,
        right_item_id: null,
        left_label: `مستند — ${item.title}`,
        right_label: d.externalLabel,
        left_statement: item.content,
        right_statement: d.externalText,
        external_source: d.externalSource,
        description:
          "المستند والمصدر الداخلي يتحدثان عن نفس الموضوع بصياغتين مختلفتين — راجع أيهما الصحيح.",
        severity: "medium",
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (rows.length === 0) return 0;
  const { error } = await supabase.from("knowledge_conflicts").insert(rows);
  if (error) {
    console.error(`[KnowledgeHub] تعذّر تسجيل التعارض المتقاطع: ${error.message}`);
    return 0;
  }
  return rows.length;
}

async function writeProposals(
  supabase: SupabaseClient,
  projectId: string,
  proposals: SynthesisProposal[],
  items: KnowledgeItem[],
  idByRef: Map<string, string>
): Promise<number> {
  if (proposals.length === 0) return 0;
  const byId = new Map(items.map((i) => [i.id, i]));

  const rows = proposals.map((p) => {
    const sources = p.sourceRefs
      .map((ref) => byId.get(idByRef.get(ref) ?? ""))
      .filter((i): i is KnowledgeItem => Boolean(i));

    return {
      project_id: projectId,
      source_id: sources[0]?.source_id ?? items[0].source_id,
      category: p.section,
      title: p.title,
      content: p.detail || p.title,
      confidence: p.confidence,
      // الدليل بيتوارث من العناصر اللي المقترح اتبنى عليها — فالمقترح
      // اللي هيدخل الـ Brain بيفضل قابل للتتبّع لاقتباس في مستند حقيقي.
      evidence: sources.flatMap((s) => (Array.isArray(s.evidence) ? s.evidence : [])).slice(0, 4),
      tags: [SYNTHESIS_TAG, brainSectionTag(p.section), `priority:${p.priority}`],
    };
  });

  const { data: inserted, error } = await supabase
    .from("knowledge_items")
    .insert(rows)
    .select("id, title, content, category, tags, confidence, content_hash, metadata");
  if (error) {
    console.error(`[KnowledgeHub] تعذّر حفظ مقترحات التوليف: ${error.message}`);
    return 0;
  }

  await recordBulkCreation({
    projectId,
    items: (inserted ?? []) as BulkCreatedItem[],
    actorKind: "worker",
    reason: "مقترحات التوليف",
  });
  return rows.length;
}

async function writeOperational(
  supabase: SupabaseClient,
  projectId: string,
  artifacts: OperationalArtifact[],
  items: KnowledgeItem[],
  idByRef: Map<string, string>
): Promise<number> {
  if (artifacts.length === 0) return 0;
  const byId = new Map(items.map((i) => [i.id, i]));

  const rows = artifacts.map((a) => {
    const sources = a.sourceRefs
      .map((ref) => byId.get(idByRef.get(ref) ?? ""))
      .filter((i): i is KnowledgeItem => Boolean(i));

    return {
      project_id: projectId,
      source_id: sources[0]?.source_id ?? items[0].source_id,
      // البنى التشغيلية بتتخزّن كقواعد عمل: ده مكانها الطبيعي في الـ Brain،
      // والنوع بيتحفظ في الوسوم عشان العرض يفضل مميّزًا.
      category: "business_rules",
      title: `${OPERATIONAL_LABELS[a.kind]}: ${a.title}`,
      content: a.detail,
      confidence: 80,
      evidence: sources.flatMap((s) => (Array.isArray(s.evidence) ? s.evidence : [])).slice(0, 4),
      tags: [SYNTHESIS_TAG, OPERATIONAL_TAG, `kind:${a.kind}`, brainSectionTag("business_rules")],
    };
  });

  const { data: inserted, error } = await supabase
    .from("knowledge_items")
    .insert(rows)
    .select("id, title, content, category, tags, confidence, content_hash, metadata");
  if (error) {
    console.error(`[KnowledgeHub] تعذّر حفظ البنى التشغيلية: ${error.message}`);
    return 0;
  }

  await recordBulkCreation({
    projectId,
    items: (inserted ?? []) as BulkCreatedItem[],
    actorKind: "worker",
    reason: "بنى تشغيلية",
  });
  return rows.length;
}

async function markSynthesized(
  supabase: SupabaseClient,
  items: KnowledgeItem[]
): Promise<void> {
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
        .update({ tags: [...new Set([...(item.tags ?? []), SYNTHESIS_TAG])] })
        .eq("id", item.id)
    )
  );
}

async function getProjectName(supabase: SupabaseClient, projectId: string): Promise<string> {
  const { data } = await supabase.from("projects").select("name").eq("id", projectId).maybeSingle();
  return (data?.name as string | undefined) ?? "المشروع";
}
