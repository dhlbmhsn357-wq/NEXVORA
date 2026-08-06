"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/rbac";
import { runKnowledgeGraphAnalysis } from "@/lib/knowledge-graph/analysis-orchestrator";
import { searchProjectKnowledge } from "@/lib/knowledge-graph/search-service";
import type {
  KnowledgeConsistencyReport,
  KnowledgeEvidence,
  KnowledgeNode,
  KnowledgeRelation,
  KnowledgeVersion,
  ProjectDomain,
  ProjectKnowledgeSearchResult,
} from "@/lib/types/database";

export interface KnowledgeGraphState {
  nodes: KnowledgeNode[];
  relations: KnowledgeRelation[];
  latestReport: KnowledgeConsistencyReport | null;
  domain: ProjectDomain | null;
}

export async function getKnowledgeGraphState(projectId: string): Promise<KnowledgeGraphState> {
  const supabase = await createClient();
  const [{ data: nodes }, { data: relations }, { data: reports }, { data: project }] = await Promise.all([
    supabase.from("knowledge_nodes").select("*").eq("project_id", projectId).eq("status", "active").order("category", { ascending: true }),
    supabase.from("knowledge_relations").select("*").eq("project_id", projectId),
    supabase.from("knowledge_consistency_reports").select("*").eq("project_id", projectId).order("generated_at", { ascending: false }).limit(1),
    supabase.from("projects").select("domain").eq("id", projectId).maybeSingle(),
  ]);

  return {
    nodes: (nodes as KnowledgeNode[] | null) ?? [],
    relations: (relations as KnowledgeRelation[] | null) ?? [],
    latestReport: ((reports as KnowledgeConsistencyReport[] | null) ?? [])[0] ?? null,
    domain: (project?.domain as ProjectDomain | null) ?? null,
  };
}

export async function getKnowledgeNodeHistory(nodeId: string): Promise<{ versions: KnowledgeVersion[]; evidence: KnowledgeEvidence[] }> {
  const supabase = await createClient();
  const [{ data: versions }, { data: evidence }] = await Promise.all([
    supabase.from("knowledge_versions").select("*").eq("node_id", nodeId).order("version", { ascending: false }),
    supabase.from("knowledge_evidence").select("*").eq("node_id", nodeId),
  ]);
  return { versions: (versions as KnowledgeVersion[] | null) ?? [], evidence: (evidence as KnowledgeEvidence[] | null) ?? [] };
}

export async function setProjectDomainAction(projectId: string, domain: ProjectDomain): Promise<{ ok: boolean; message?: string }> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, message: auth.message };

  const { error } = await (await createClient()).from("projects").update({ domain }).eq("id", projectId);
  if (error) return { ok: false, message: error.message };

  revalidatePath(`/dashboard/projects/${projectId}`);
  return { ok: true };
}

export async function runKnowledgeGraphAnalysisAction(projectId: string): Promise<{ ok: boolean; message?: string }> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, message: auth.message };

  const result = await runKnowledgeGraphAnalysis(projectId, auth.userId ?? null);
  if (result.status === "error") return { ok: false, message: result.message };

  revalidatePath(`/dashboard/projects/${projectId}`);
  return { ok: true };
}

export async function searchProjectKnowledgeAction(
  projectId: string,
  query: string
): Promise<{ ok: true; results: ProjectKnowledgeSearchResult[] } | { ok: false; message: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "غير مسجّل دخول." };

  return searchProjectKnowledge(projectId, query);
}
