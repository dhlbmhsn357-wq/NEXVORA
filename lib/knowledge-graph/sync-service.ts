import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { AIService } from "@/lib/ai/service";
import { getLatestApprovedBrain } from "@/lib/brain-v2/service";
import { BRAIN_SECTIONS } from "@/lib/brain-v2/types";
import { extractFlatItems, type FlatKnowledgeItem } from "./extract-items";

/** أفضل جهد — لو فشل التوليد، العنصر لسه بيتسجّل عادي بس من غير Embedding (قابل للمزامنة تاني لاحقًا). */
async function tryEmbed(title: string, description: string): Promise<number[] | null> {
  const result = await AIService.embed(`${title}. ${description}`.trim());
  return result.success && result.embedding ? result.embedding : null;
}

export interface SyncResult {
  created: number;
  versioned: number;
  unchanged: number;
}

/**
 * يشتق Knowledge Graph من آخر نسخة معتمدة من Project Brain v2 — Brain
 * v2 يفضل مصدر الحقيقة لمحتوى الأقسام، الجدول ده بس فهرس أغنى فوقه
 * (Node مستقل لكل عنصر بثقة/دليل/نسخة/علاقات مستقلة). بيتنادى إضافيًا
 * من نفس نقاط استدعاء notifyBrainChanged الموجودة أصلًا — مفيش أي
 * تعديل على منطق الـ Resync الحالي.
 *
 * "مفيش استبدال صامت أبدًا" — لو عنصر اتغيّر محتواه، النسخة القديمة
 * تتحوّل status='superseded' (تفضل موجودة ومتاحة) وصف جديد بنسخة أعلى
 * يتولّد، مع Snapshot كامل في knowledge_versions.
 */
export async function syncKnowledgeGraphFromBrain(projectId: string, actorId: string | null = null): Promise<SyncResult> {
  const supabase = createServiceClient();
  const brain = await getLatestApprovedBrain(supabase, projectId);
  if (!brain) return { created: 0, versioned: 0, unchanged: 0 };

  const result: SyncResult = { created: 0, versioned: 0, unchanged: 0 };

  for (const section of BRAIN_SECTIONS) {
    const items = extractFlatItems(section, brain.content[section].content);
    for (const item of items) {
      const outcome = await upsertKnowledgeNode(supabase, projectId, section, item, brain.id, actorId);
      result[outcome]++;
    }
  }

  return result;
}

async function upsertKnowledgeNode(
  supabase: SupabaseClient,
  projectId: string,
  section: string,
  item: FlatKnowledgeItem,
  sourceReference: string,
  actorId: string | null
): Promise<"created" | "versioned" | "unchanged"> {
  const { data: existing } = await supabase
    .from("knowledge_nodes")
    .select("id, version")
    .eq("project_id", projectId)
    .eq("category", section)
    .eq("item_key", item.key)
    .eq("status", "active")
    .maybeSingle();

  if (existing) {
    const { data: latestVersion } = await supabase
      .from("knowledge_versions")
      .select("snapshot")
      .eq("node_id", existing.id)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestVersion && JSON.stringify(latestVersion.snapshot) === JSON.stringify(item.raw)) {
      return "unchanged";
    }

    const nextVersion = existing.version + 1;
    const embedding = await tryEmbed(item.title, item.description);
    const { data: inserted } = await supabase
      .from("knowledge_nodes")
      .insert({
        project_id: projectId,
        category: section,
        item_key: item.key,
        title: item.title,
        description: item.description,
        source_type: "brain_section",
        source_reference: sourceReference,
        author_id: actorId,
        version: nextVersion,
        embedding,
      })
      .select("id")
      .single();
    if (!inserted) return "unchanged";

    await supabase.from("knowledge_nodes").update({ status: "superseded", superseded_by_id: inserted.id }).eq("id", existing.id);
    await insertEvidence(supabase, inserted.id, item);
    await supabase.from("knowledge_versions").insert({
      node_id: inserted.id,
      project_id: projectId,
      version: nextVersion,
      snapshot: item.raw,
      change_reason: "تحديث من Project Brain المعتمد",
      changed_by: actorId,
    });
    return "versioned";
  }

  const embedding = await tryEmbed(item.title, item.description);
  const { data: inserted } = await supabase
    .from("knowledge_nodes")
    .insert({
      project_id: projectId,
      category: section,
      item_key: item.key,
      title: item.title,
      description: item.description,
      source_type: "brain_section",
      source_reference: sourceReference,
      author_id: actorId,
      version: 1,
      embedding,
    })
    .select("id")
    .single();
  if (!inserted) return "unchanged";

  await insertEvidence(supabase, inserted.id, item);
  await supabase.from("knowledge_versions").insert({
    node_id: inserted.id,
    project_id: projectId,
    version: 1,
    snapshot: item.raw,
    change_reason: "توليد أولي من Project Brain",
    changed_by: actorId,
  });
  return "created";
}

async function insertEvidence(supabase: SupabaseClient, nodeId: string, item: FlatKnowledgeItem): Promise<void> {
  if (item.evidence.length === 0) return;
  await supabase.from("knowledge_evidence").insert(
    item.evidence.map((e) => ({
      node_id: nodeId,
      quote: e.quote,
      source_module: "discovery",
      supporting_discovery_answer_key: e.question_id,
    }))
  );
}
