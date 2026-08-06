import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { validatePackage } from "./package-model";

/**
 * استيراد حزمة المعرفة (الجزء الثامن).
 *
 * بياخد حزمة JSON، بيتحقّق منها، وبيدرج كائناتها في المشروع الهدف
 * **مع إعادة ربط العلاقات**: المعرّفات الأصلية في الحزمة تُرمَّز لمعرّفات
 * جديدة، والعلاقات تُبنى فوق المعرّفات الجديدة — فالشبكة تُحفَظ حتى لو
 * المعرّفات اتغيّرت.
 *
 * الاستيراد **إضافي لا استبدالي**: بيضيف للمشروع، مايمسحش القائم. الدمج
 * والتكرار يُعالَجان بمسار الإثراء القائم لاحقًا.
 */

const UNDEFINED_TABLE = "42P01";

export interface ImportResult {
  status: "ok" | "invalid" | "unavailable" | "failed";
  importedItems?: number;
  importedEntities?: number;
  importedRelations?: number;
  message?: string;
}

export async function importKnowledgePackage(
  projectId: string,
  raw: unknown,
  actorId?: string | null,
  client?: SupabaseClient
): Promise<ImportResult> {
  const validation = validatePackage(raw);
  if (!validation.ok) {
    return { status: "invalid", message: validation.reason };
  }
  const pkg = validation.package;
  const db = client ?? createServiceClient();

  // خريطة المعرّف الأصلي → الجديد لكل نوع، لإعادة ربط العلاقات.
  const idMap = new Map<string, string>();

  // --- الكيانات أولًا (العلاقات تعتمد عليها) ---
  let importedEntities = 0;
  const entityObjs = pkg.objects.filter((o) => o.type === "entity");
  for (const obj of entityObjs) {
    const d = obj.data;
    const { data: inserted, error } = await db
      .from("knowledge_entities")
      .insert({
        project_id: projectId,
        entity_type: String(d.entityType ?? "unknown"),
        name: String(d.name ?? ""),
        normalized_key: String(d.normalizedKey ?? d.name ?? ""),
        description: String(d.description ?? ""),
      })
      .select("id")
      .maybeSingle();
    if (error) {
      if (error.code === UNDEFINED_TABLE) return { status: "unavailable", message: "جداول المعرفة غير مطبَّقة بعد." };
      continue; // كيان مكرَّر (خرق مفتاح فريد) يُتخطّى بلا إسقاط الاستيراد
    }
    if (inserted?.id) {
      idMap.set(`entity::${obj.sourceId}`, inserted.id as string);
      importedEntities += 1;
    }
  }

  // --- العناصر ---
  let importedItems = 0;
  const itemObjs = pkg.objects.filter((o) => o.type === "item");
  if (itemObjs.length > 0) {
    const rows = itemObjs.map((obj) => ({
      project_id: projectId,
      source_id: null,
      category: String(obj.data.category ?? "unknown"),
      title: String(obj.data.title ?? ""),
      content: String(obj.data.content ?? ""),
      confidence: Number(obj.data.confidence) || 60,
      evidence: [],
      tags: Array.isArray(obj.data.tags) ? obj.data.tags : ["imported"],
    }));
    const { data: inserted, error } = await db.from("knowledge_items").insert(rows).select("id");
    if (!error) importedItems = (inserted ?? []).length;
  }

  // --- العلاقات (بعد الكيانات، بالمعرّفات الجديدة) ---
  let importedRelations = 0;
  const relRows = pkg.relations
    .map((r) => {
      const from = idMap.get(`entity::${r.fromSourceId}`);
      const to = idMap.get(`entity::${r.toSourceId}`);
      if (!from || !to || from === to) return null;
      return { project_id: projectId, from_entity_id: from, to_entity_id: to, relation_type: r.relationType };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (relRows.length > 0) {
    const { error } = await db
      .from("knowledge_entity_relations")
      .upsert(relRows, { onConflict: "from_entity_id,to_entity_id,relation_type", ignoreDuplicates: true });
    if (!error) importedRelations = relRows.length;
  }

  // تسجيل عملية الاستيراد.
  await db.from("knowledge_packages").insert({
    project_id: projectId,
    kind: "import",
    format: "json",
    status: "imported",
    object_count: importedItems + importedEntities,
    manifest: { importedItems, importedEntities, importedRelations, formatVersion: pkg.formatVersion },
    created_by: actorId ?? null,
  });

  return { status: "ok", importedItems, importedEntities, importedRelations };
}
