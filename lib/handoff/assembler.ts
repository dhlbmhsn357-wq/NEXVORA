/**
 * NEXVORA Handoff — Assembler (0110)
 * ==================================
 * previewAssembly: pure read (no DB writes)
 * applyAssembly:   writes source_type/version/hash/assembled_at/by + status
 * يحترم is_manual_override (لا يلمسه).
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { listItems, assertPackageMutable } from "./service";
import { resolveAllSources, type ResolvedSource } from "./source-resolvers";
import { MANDATORY_HANDOFF_KEYS } from "./types";
import type { HandoffItemRow } from "./types";

export type AssemblyAction =
  | "will_link"
  | "already_linked_same"
  | "stale_will_update"
  | "skipped_manual"
  | "cannot_resolve";

export interface AssemblyPreview {
  itemKey: string;
  currentStatus: string;
  isManualOverride: boolean;
  resolved: ResolvedSource;
  action: AssemblyAction;
  currentItemId: string | null;
}

function decideAction(
  item: HandoffItemRow | undefined,
  resolved: ResolvedSource,
): AssemblyAction {
  if (item?.isManualOverride) return "skipped_manual";
  if (resolved.status !== "ready") return "cannot_resolve";
  if (!item) return "will_link";
  if (item.sourceHash && item.sourceHash === resolved.sourceHash) return "already_linked_same";
  return item.sourceHash ? "stale_will_update" : "will_link";
}

export async function previewAssembly(
  supabase: SupabaseClient, projectId: string, packageId: string,
): Promise<AssemblyPreview[]> {
  const [items, resolved] = await Promise.all([
    listItems(packageId),
    resolveAllSources(supabase, projectId),
  ]);
  const byKey = new Map(items.map((i) => [i.itemKey, i]));
  return MANDATORY_HANDOFF_KEYS.map((key) => {
    const r = resolved.find((x) => x.itemKey === key);
    if (!r) {
      return {
        itemKey: key,
        currentStatus: byKey.get(key)?.status ?? "pending",
        isManualOverride: byKey.get(key)?.isManualOverride ?? false,
        resolved: {
          itemKey: key, sourceType: "unknown",
          sourceVersion: null, sourceHash: null, contentUrl: null,
          contentText: "", contentRefType: null, contentRefId: null,
          status: "missing" as const, reason: "لم يُعثر على resolver.",
        },
        action: "cannot_resolve" as AssemblyAction,
        currentItemId: byKey.get(key)?.id ?? null,
      };
    }
    const item = byKey.get(key);
    return {
      itemKey: key,
      currentStatus: item?.status ?? "pending",
      isManualOverride: item?.isManualOverride ?? false,
      resolved: r,
      action: decideAction(item, r),
      currentItemId: item?.id ?? null,
    };
  });
}

export interface AssemblyResult {
  updated: number;
  skipped: number;
  failed: number;
  details: { itemKey: string; action: AssemblyAction; error?: string }[];
}

export async function applyAssembly(
  supabase: SupabaseClient, projectId: string, packageId: string, userId: string | null,
): Promise<AssemblyResult> {
  // 0111 — refuse assembly on finalized/superseded packages
  await assertPackageMutable(supabase, { packageId });
  const previews = await previewAssembly(supabase, projectId, packageId);
  const svc = createServiceClient();
  const now = new Date().toISOString();
  const result: AssemblyResult = { updated: 0, skipped: 0, failed: 0, details: [] };

  for (const p of previews) {
    if (p.action === "skipped_manual" || p.action === "already_linked_same") {
      result.skipped++;
      result.details.push({ itemKey: p.itemKey, action: p.action });
      continue;
    }
    if (p.action === "cannot_resolve") {
      result.skipped++;
      result.details.push({ itemKey: p.itemKey, action: p.action, error: p.resolved.reason });
      continue;
    }
    // will_link | stale_will_update — write
    const row: Record<string, unknown> = {
      package_id: packageId,
      project_id: projectId,
      item_key: p.itemKey,
      is_mandatory: true,
      source_type: p.resolved.sourceType,
      source_version: p.resolved.sourceVersion,
      source_hash: p.resolved.sourceHash,
      assembled_at: now,
      assembled_by: userId,
      content_url: p.resolved.contentUrl,
      content_text: p.resolved.contentText,
      content_ref_type: p.resolved.contentRefType,
      content_ref_id: p.resolved.contentRefId,
    };
    if (p.resolved.status === "ready") {
      row.status = "completed";
      row.completed_at = now;
      row.completed_by = userId;
    }
    const { error } = await svc.from("handoff_items")
      .upsert(row, { onConflict: "package_id,item_key" });
    if (error) {
      result.failed++;
      result.details.push({ itemKey: p.itemKey, action: p.action, error: error.message });
    } else {
      result.updated++;
      result.details.push({ itemKey: p.itemKey, action: p.action });
    }
  }
  return result;
}

/** Convenience wrapper that opens supabase server client. */
export async function previewAssemblyForProject(projectId: string, packageId: string) {
  const supabase = await createClient();
  return previewAssembly(supabase as unknown as SupabaseClient, projectId, packageId);
}
export async function applyAssemblyForProject(projectId: string, packageId: string, userId: string | null) {
  const supabase = await createClient();
  return applyAssembly(supabase as unknown as SupabaseClient, projectId, packageId, userId);
}

/**
 * 0111 — Server-side stale detection helper.
 * Returns a map itemKey → current sourceHash (only for items whose source is
 * currently resolvable/ready). Used by panels to detect drift since last assemble.
 */
export async function computeCurrentHashesMap(
  supabase: SupabaseClient,
  projectId: string,
): Promise<Map<string, string>> {
  const sources = await resolveAllSources(supabase, projectId);
  const map = new Map<string, string>();
  for (const s of sources) {
    if (s.status === "ready" && s.sourceHash) map.set(s.itemKey, s.sourceHash);
  }
  return map;
}

export async function computeCurrentHashesMapForProject(projectId: string): Promise<Map<string, string>> {
  const supabase = await createClient();
  return computeCurrentHashesMap(supabase as unknown as SupabaseClient, projectId);
}
