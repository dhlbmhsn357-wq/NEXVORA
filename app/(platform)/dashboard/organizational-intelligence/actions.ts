"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireManageKnowledge, requireViewKnowledge } from "@/lib/organizational-intelligence/permissions";
import { searchOrganizationalKnowledge, type KnowledgeSearchResult } from "@/lib/organizational-intelligence/search-service";
import { PromptSuggestionsEngine } from "@/lib/organizational-intelligence/prompt-suggestions-service";
import type { KnowledgeStatus } from "@/lib/types/database";

const OI_PATH = "/dashboard/organizational-intelligence";

export async function searchKnowledgeAction(query: string): Promise<{ ok: true; results: KnowledgeSearchResult[] } | { ok: false; message: string }> {
  const auth = await requireViewKnowledge();
  if (!auth.ok) return { ok: false, message: auth.message ?? "غير مسموح." };
  return searchOrganizationalKnowledge(query);
}

export async function setKnowledgeStatusAction(knowledgeId: string, status: Extract<KnowledgeStatus, "approved" | "rejected">): Promise<{ ok: boolean; message?: string }> {
  const auth = await requireManageKnowledge();
  if (!auth.ok) return { ok: false, message: auth.message ?? "غير مسموح." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("organizational_knowledge")
    .update({ status, approved_by: status === "approved" ? auth.userId : null, approved_at: status === "approved" ? new Date().toISOString() : null })
    .eq("id", knowledgeId);
  if (error) return { ok: false, message: error.message };

  revalidatePath(OI_PATH);
  return { ok: true };
}

export async function setPromptSuggestionStatusAction(suggestionId: string, status: "applied" | "dismissed"): Promise<{ ok: boolean; message?: string }> {
  const auth = await requireManageKnowledge();
  if (!auth.ok) return { ok: false, message: auth.message ?? "غير مسموح." };

  await PromptSuggestionsEngine.setStatus(suggestionId, status);
  revalidatePath(OI_PATH);
  return { ok: true };
}
