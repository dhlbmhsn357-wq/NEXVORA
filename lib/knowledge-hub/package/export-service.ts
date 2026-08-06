import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { maskPii } from "../security/pii";
import {
  buildPackage,
  type KnowledgePackage,
  type PackageObject,
  type PackageRelation,
} from "./package-model";

/**
 * تصدير حزمة المعرفة (الجزء الثامن).
 *
 * بيجمع معرفة المشروع المهيكلة في حزمة JSON قابلة للنقل مع علاقاتها.
 * هي وحدة **التصدير والنسخ الاحتياطي** معًا. إخفاء PII اختياري — مفعَّل
 * للمشاركة الخارجية، مطفأ للنسخ الاحتياطي الداخلي.
 */

const UNDEFINED_TABLE = "42P01";
const ISO_AT_EXPORT = "generatedAt is stamped by caller";

export interface ExportResult {
  status: "ok" | "unavailable" | "failed";
  package?: KnowledgePackage;
  packageId?: string;
  message?: string;
}

export async function exportKnowledgePackage(
  projectId: string,
  generatedAt: string,
  options: { maskPii?: boolean; actorId?: string | null; kind?: "export" | "backup" } = {},
  client?: SupabaseClient
): Promise<ExportResult> {
  const db = client ?? createServiceClient();
  void ISO_AT_EXPORT;

  const project = await db.from("projects").select("name").eq("id", projectId).maybeSingle();

  const [items, entities, relations] = await Promise.all([
    db.from("knowledge_items").select("id, category, title, content, confidence, tags, status").eq("project_id", projectId).neq("status", "rejected").limit(5000),
    db.from("knowledge_entities").select("id, entity_type, name, description, normalized_key").eq("project_id", projectId).eq("status", "active").limit(5000),
    db.from("knowledge_entity_relations").select("from_entity_id, to_entity_id, relation_type").eq("project_id", projectId).limit(5000),
  ]);

  if (items.error && items.error.code === UNDEFINED_TABLE) {
    return { status: "unavailable", message: "جداول المعرفة غير مطبَّقة بعد." };
  }

  const maybeMask = (text: string): string => (options.maskPii ? maskPii(text).masked : text);

  const objects: PackageObject[] = [];
  for (const it of (items.data ?? []) as Array<Record<string, unknown>>) {
    objects.push({
      type: "item",
      sourceId: String(it.id),
      data: {
        category: it.category,
        title: maybeMask(String(it.title ?? "")),
        content: maybeMask(String(it.content ?? "")),
        confidence: it.confidence,
        tags: it.tags,
        status: it.status,
      },
    });
  }
  for (const en of (entities.data ?? []) as Array<Record<string, unknown>>) {
    objects.push({
      type: "entity",
      sourceId: String(en.id),
      data: {
        entityType: en.entity_type,
        name: maybeMask(String(en.name ?? "")),
        description: maybeMask(String(en.description ?? "")),
        normalizedKey: en.normalized_key,
      },
    });
  }

  const pkgRelations: PackageRelation[] = ((relations.data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    fromType: "entity",
    fromSourceId: String(r.from_entity_id),
    toType: "entity",
    toSourceId: String(r.to_entity_id),
    relationType: String(r.relation_type),
  }));

  const pkg = buildPackage({
    projectId,
    projectName: (project.data?.name as string) ?? "المشروع",
    generatedAt,
    piiMasked: Boolean(options.maskPii),
    objects,
    relations: pkgRelations,
  });

  // تسجيل الحزمة في manifest (الملف نفسه بيرجع للمستدعي للتنزيل).
  const { data: inserted } = await db
    .from("knowledge_packages")
    .insert({
      project_id: projectId,
      kind: options.kind ?? "export",
      format: "json",
      status: "ready",
      object_count: objects.length,
      manifest: { counts: pkg.counts, generatedAt, formatVersion: pkg.formatVersion },
      pii_masked: Boolean(options.maskPii),
      created_by: options.actorId ?? null,
    })
    .select("id")
    .maybeSingle();

  return { status: "ok", package: pkg, packageId: inserted?.id as string | undefined };
}
