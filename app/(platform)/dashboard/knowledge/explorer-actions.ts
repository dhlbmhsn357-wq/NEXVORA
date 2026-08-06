"use server";

import { requireRole } from "@/lib/auth/rbac";
import { createServiceClient } from "@/lib/supabase/service";
import { facets, type ExplorerItem } from "@/lib/knowledge-hub/explorer/filters";

/**
 * إجراء مستكشف المعرفة (الجزء السابع).
 *
 * بيجيب عناصر المشروع مرة واحدة مع الوجوه (facets) لبناء الفلاتر.
 * الفلترة والترتيب بيحصلوا في العميل على العيّنة المحمَّلة عبر
 * `applyExplorer` النقي — تفاعل فوري بلا رحلة خادم لكل ضغطة فلتر.
 */

const ALLOWED = ["owner", "admin", "supervisor"] as const;

export interface ExplorerData {
  items: ExplorerItem[];
  facets: ReturnType<typeof facets>;
}

export async function getKnowledgeExplorer(
  projectId: string
): Promise<{ ok: boolean; message?: string; data?: ExplorerData }> {
  const auth = await requireRole([...ALLOWED]);
  if (!auth.ok) return { ok: false, message: auth.message };
  if (!projectId) return { ok: false, message: "المشروع مطلوب." };

  const db = createServiceClient();
  const { data, error } = await db
    .from("knowledge_items")
    .select("id, title, content, category, status, confidence, tags, created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(1000);

  if (error) {
    if (error.code === "42P01") return { ok: true, data: { items: [], facets: { categories: [], tags: [], statuses: [] } } };
    return { ok: false, message: error.message };
  }

  const items: ExplorerItem[] = ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    id: r.id as string,
    title: (r.title as string) ?? "",
    content: (r.content as string) ?? "",
    category: (r.category as string) ?? "unknown",
    status: (r.status as string) ?? "active",
    confidence: (r.confidence as number) ?? 60,
    tags: Array.isArray(r.tags) ? (r.tags as string[]) : [],
    createdAt: (r.created_at as string) ?? "",
  }));

  return { ok: true, data: { items, facets: facets(items) } };
}
