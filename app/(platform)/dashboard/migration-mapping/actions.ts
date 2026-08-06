"use server";

import { after } from "next/server";
import { requireRole } from "@/lib/auth/rbac";
import { getMappingDashboard, type MappingDashboard } from "@/lib/schema-mapping/dashboard";
import { generateBlueprint, getBlueprintDetail, canonicalFieldCatalog } from "@/lib/schema-mapping/mapping-service";
import { decideMapping, editFieldMapping, approveBlueprint, type MappingKind } from "@/lib/schema-mapping/approval-service";
import { promoteBlueprintToOrgMemory } from "@/lib/schema-mapping/org-memory-integration";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * إجراءات محرّك الـMapping.
 * Director/Admin: توليد/تعديل/اعتماد/ترقية. Supervisor: قراءة. Executor: لا وصول.
 */

const EDITOR = ["owner", "admin"] as const;
const READER = ["owner", "admin", "supervisor"] as const;

export async function getDashboard(projectId: string | null = null): Promise<{ ok: boolean; message?: string; data?: MappingDashboard }> {
  const auth = await requireRole([...READER]);
  if (!auth.ok) return { ok: false, message: auth.message };
  return { ok: true, data: await getMappingDashboard(projectId) };
}

/** يبدأ توليد المخطّط في الخلفية ويعيد فورًا. */
export async function startBlueprint(sourceId: string): Promise<{ ok: boolean; message?: string }> {
  const auth = await requireRole([...EDITOR]);
  if (!auth.ok) return { ok: false, message: auth.message };
  // ضع المخطّط الحالي (إن وُجد) في وضع توليد بصريًا عبر إدراج سجل لاحقًا.
  const actorId = auth.userId ?? null;
  after(async () => {
    await generateBlueprint(sourceId, actorId);
  });
  return { ok: true, message: "بدأ توليد المخطّط — سيظهر عند الاكتمال." };
}

export async function getDetail(sourceId: string): Promise<{ ok: boolean; detail?: unknown; catalog?: Record<string, Array<{ key: string; label: string }>> }> {
  const auth = await requireRole([...READER]);
  if (!auth.ok) return { ok: false };
  const detail = await getBlueprintDetail(sourceId);
  return { ok: true, detail, catalog: canonicalFieldCatalog() };
}

export async function decide(kind: MappingKind, id: string, decision: "approved" | "rejected"): Promise<{ ok: boolean; message?: string }> {
  const auth = await requireRole([...EDITOR]);
  if (!auth.ok) return { ok: false, message: auth.message };
  return decideMapping(kind, id, decision, auth.userId ?? null);
}

export async function editField(id: string, newField: string | null, newFieldLabel: string | null, kind?: string): Promise<{ ok: boolean; message?: string }> {
  const auth = await requireRole([...EDITOR]);
  if (!auth.ok) return { ok: false, message: auth.message };
  return editFieldMapping(id, { newField, newFieldLabel, kind }, auth.userId ?? null);
}

export async function approve(blueprintId: string): Promise<{ ok: boolean; message?: string }> {
  const auth = await requireRole([...EDITOR]);
  if (!auth.ok) return { ok: false, message: auth.message };
  return approveBlueprint(blueprintId, auth.userId ?? null);
}

export async function promote(blueprintId: string): Promise<{ ok: boolean; message?: string }> {
  const auth = await requireRole([...EDITOR]);
  if (!auth.ok) return { ok: false, message: auth.message };
  return promoteBlueprintToOrgMemory(blueprintId, auth.userId ?? null);
}

/** حالة مخطّط مصدر (للـPolling أثناء التوليد). */
export async function getStatus(sourceId: string): Promise<{ ok: boolean; status?: string }> {
  const auth = await requireRole([...READER]);
  if (!auth.ok) return { ok: false };
  const db = createServiceClient();
  const { data } = await db.from("migration_blueprints").select("status").eq("source_id", sourceId).order("version", { ascending: false }).limit(1).maybeSingle();
  return { ok: true, status: (data as { status: string } | null)?.status };
}
