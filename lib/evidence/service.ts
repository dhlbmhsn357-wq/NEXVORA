/**
 * NEXVORA Evidence Traceability — Data Access (P8)
 * ================================================
 * Server-only. القراءة عبر authenticated client (RLS SELECT).
 * الكتابة عبر service client (RBAC مطبّق في server actions).
 */
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import type {
  EvidenceLinkRow, EvidenceLinkView,
  EvidenceSourceType, EvidenceKind,
} from "./types";

type DbLink = {
  id: string; project_id: string;
  source_type: EvidenceSourceType; source_id: string;
  evidence_type: EvidenceKind; evidence_id: string;
  note: string; created_at: string; created_by: string | null;
};

function mapLink(r: DbLink): EvidenceLinkRow {
  return {
    id: r.id, projectId: r.project_id,
    sourceType: r.source_type, sourceId: r.source_id,
    evidenceType: r.evidence_type, evidenceId: r.evidence_id,
    note: r.note, createdAt: r.created_at, createdBy: r.created_by,
  };
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------
export async function listEvidenceLinks(projectId: string): Promise<EvidenceLinkRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("evidence_links").select("*").eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as DbLink[]).map(mapLink);
}

/**
 * يحمّل روابط عنصر واحد ويجمعها مع بيانات الدليل الفعلية (title/summary/…)
 * — يستخدمها الـ Modal لعرض بطاقات جاهزة.
 */
export async function listEvidenceForSourceWithBodies(
  projectId: string,
  sourceType: EvidenceSourceType,
  sourceId: string,
): Promise<EvidenceLinkView[]> {
  const supabase = await createClient();
  const { data: linkRows, error } = await supabase
    .from("evidence_links").select("*")
    .eq("project_id", projectId)
    .eq("source_type", sourceType)
    .eq("source_id", sourceId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  const links = (linkRows as DbLink[]).map(mapLink);
  if (links.length === 0) return [];

  const mrIds = links.filter((l) => l.evidenceType === "market_research").map((l) => l.evidenceId);
  const pvIds = links.filter((l) => l.evidenceType === "problem_validation").map((l) => l.evidenceId);

  const [mrRes, pvRes] = await Promise.all([
    mrIds.length > 0
      ? supabase.from("market_research_items")
          .select("id,title,summary,source_url,confidence")
          .in("id", mrIds)
      : Promise.resolve({ data: [], error: null }),
    pvIds.length > 0
      ? supabase.from("problem_validation_items")
          .select("id,title,pain_point,supporting_url,strength")
          .in("id", pvIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (mrRes.error) throw mrRes.error;
  if (pvRes.error) throw pvRes.error;

  const mrMap = new Map<string, { title: string; summary: string; url: string | null; strength: number }>();
  for (const r of (mrRes.data ?? []) as Array<{ id: string; title: string; summary: string; source_url: string | null; confidence: number }>) {
    mrMap.set(r.id, { title: r.title, summary: r.summary, url: r.source_url, strength: r.confidence });
  }
  const pvMap = new Map<string, { title: string; summary: string; url: string | null; strength: number }>();
  for (const r of (pvRes.data ?? []) as Array<{ id: string; title: string; pain_point: string; supporting_url: string | null; strength: number }>) {
    pvMap.set(r.id, { title: r.title, summary: r.pain_point, url: r.supporting_url, strength: r.strength });
  }

  return links.map((link): EvidenceLinkView => {
    const body = link.evidenceType === "market_research" ? mrMap.get(link.evidenceId) : pvMap.get(link.evidenceId);
    return {
      link,
      evidenceTitle: body?.title ?? "(محذوف)",
      evidenceSummary: body?.summary ?? "",
      evidenceUrl: body?.url ?? null,
      evidenceStrength: body?.strength ?? 0,
    };
  });
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------
export async function createEvidenceLink(
  projectId: string,
  sourceType: EvidenceSourceType, sourceId: string,
  evidenceType: EvidenceKind, evidenceId: string,
  note: string,
  createdBy: string | null,
): Promise<EvidenceLinkRow> {
  const svc = createServiceClient();
  const { data, error } = await svc.from("evidence_links").insert({
    project_id: projectId,
    source_type: sourceType,
    source_id: sourceId,
    evidence_type: evidenceType,
    evidence_id: evidenceId,
    note,
    created_by: createdBy,
  }).select("*").single();
  if (error) throw error;
  return mapLink(data as DbLink);
}

export async function deleteEvidenceLink(id: string): Promise<void> {
  const svc = createServiceClient();
  const { error } = await svc.from("evidence_links").delete().eq("id", id);
  if (error) throw error;
}

export async function updateEvidenceLinkNote(id: string, note: string): Promise<void> {
  const svc = createServiceClient();
  const { error } = await svc.from("evidence_links").update({ note }).eq("id", id);
  if (error) throw error;
}
