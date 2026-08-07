/**
 * NEXVORA Market Research + Validation — Data Access (P5)
 * =======================================================
 * Server-only. القراءة عبر authenticated client (RLS SELECT).
 * الكتابة عبر service client (RBAC مطبّق في server actions).
 */
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import type {
  MarketResearchItem, MarketResearchItemType,
  ProblemValidationItem, EvidenceType,
  InformationClassificationMark, InformationClassification,
} from "./types";

// ---------------------------------------------------------------------------
// Row mappers
// ---------------------------------------------------------------------------
type DbMr = {
  id: string; project_id: string; item_type: MarketResearchItemType;
  title: string; summary: string; details: Record<string, unknown>;
  source_url: string | null; source_notes: string;
  confidence: number; tags: string[];
  created_at: string; updated_at: string; created_by: string | null;
};
function mapMr(r: DbMr): MarketResearchItem {
  return {
    id: r.id, projectId: r.project_id, itemType: r.item_type,
    title: r.title, summary: r.summary, details: r.details ?? {},
    sourceUrl: r.source_url, sourceNotes: r.source_notes,
    confidence: r.confidence, tags: r.tags ?? [],
    createdAt: r.created_at, updatedAt: r.updated_at, createdBy: r.created_by,
  };
}

type DbPv = {
  id: string; project_id: string; evidence_type: EvidenceType;
  title: string; pain_point: string; quote: string;
  source_person: string; source_role: string; source_date: string | null;
  supporting_url: string | null; supporting_notes: string;
  strength: number; tags: string[];
  created_at: string; updated_at: string; created_by: string | null;
};
function mapPv(r: DbPv): ProblemValidationItem {
  return {
    id: r.id, projectId: r.project_id, evidenceType: r.evidence_type,
    title: r.title, painPoint: r.pain_point, quote: r.quote,
    sourcePerson: r.source_person, sourceRole: r.source_role, sourceDate: r.source_date,
    supportingUrl: r.supporting_url, supportingNotes: r.supporting_notes,
    strength: r.strength, tags: r.tags ?? [],
    createdAt: r.created_at, updatedAt: r.updated_at, createdBy: r.created_by,
  };
}

type DbIc = {
  id: string; project_id: string; source_table: string; source_id: string;
  classification: InformationClassification; reason: string;
  reviewed_by: string | null; reviewed_at: string | null;
  created_at: string; updated_at: string;
};
function mapIc(r: DbIc): InformationClassificationMark {
  return {
    id: r.id, projectId: r.project_id, sourceTable: r.source_table, sourceId: r.source_id,
    classification: r.classification, reason: r.reason,
    reviewedBy: r.reviewed_by, reviewedAt: r.reviewed_at,
    createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

// ---------------------------------------------------------------------------
// Market Research
// ---------------------------------------------------------------------------
export async function listMarketResearchItems(projectId: string): Promise<MarketResearchItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("market_research_items")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as DbMr[]).map(mapMr);
}

export interface MarketResearchInput {
  itemType: MarketResearchItemType;
  title: string;
  summary?: string;
  details?: Record<string, unknown>;
  sourceUrl?: string | null;
  sourceNotes?: string;
  confidence?: number;
  tags?: string[];
}

export async function createMarketResearchItem(
  projectId: string, input: MarketResearchInput, createdBy: string | null
): Promise<MarketResearchItem> {
  const svc = createServiceClient();
  const { data, error } = await svc
    .from("market_research_items")
    .insert({
      project_id: projectId,
      item_type: input.itemType,
      title: input.title,
      summary: input.summary ?? "",
      details: input.details ?? {},
      source_url: input.sourceUrl ?? null,
      source_notes: input.sourceNotes ?? "",
      confidence: input.confidence ?? 50,
      tags: input.tags ?? [],
      created_by: createdBy,
    })
    .select("*").single();
  if (error) throw error;
  return mapMr(data as DbMr);
}

export async function updateMarketResearchItem(
  id: string, patch: Partial<MarketResearchInput>
): Promise<MarketResearchItem> {
  const svc = createServiceClient();
  const dbPatch: Record<string, unknown> = {};
  if (patch.itemType !== undefined) dbPatch.item_type = patch.itemType;
  if (patch.title !== undefined) dbPatch.title = patch.title;
  if (patch.summary !== undefined) dbPatch.summary = patch.summary;
  if (patch.details !== undefined) dbPatch.details = patch.details;
  if (patch.sourceUrl !== undefined) dbPatch.source_url = patch.sourceUrl;
  if (patch.sourceNotes !== undefined) dbPatch.source_notes = patch.sourceNotes;
  if (patch.confidence !== undefined) dbPatch.confidence = patch.confidence;
  if (patch.tags !== undefined) dbPatch.tags = patch.tags;
  const { data, error } = await svc
    .from("market_research_items").update(dbPatch).eq("id", id).select("*").single();
  if (error) throw error;
  return mapMr(data as DbMr);
}

export async function deleteMarketResearchItem(id: string): Promise<void> {
  const svc = createServiceClient();
  const { error } = await svc.from("market_research_items").delete().eq("id", id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Problem Validation
// ---------------------------------------------------------------------------
export async function listProblemValidationItems(projectId: string): Promise<ProblemValidationItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("problem_validation_items")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as DbPv[]).map(mapPv);
}

export interface ProblemValidationInput {
  evidenceType: EvidenceType;
  title: string;
  painPoint: string;
  quote?: string;
  sourcePerson?: string;
  sourceRole?: string;
  sourceDate?: string | null;
  supportingUrl?: string | null;
  supportingNotes?: string;
  strength?: number;
  tags?: string[];
}

export async function createProblemValidationItem(
  projectId: string, input: ProblemValidationInput, createdBy: string | null
): Promise<ProblemValidationItem> {
  const svc = createServiceClient();
  const { data, error } = await svc
    .from("problem_validation_items")
    .insert({
      project_id: projectId,
      evidence_type: input.evidenceType,
      title: input.title,
      pain_point: input.painPoint,
      quote: input.quote ?? "",
      source_person: input.sourcePerson ?? "",
      source_role: input.sourceRole ?? "",
      source_date: input.sourceDate ?? null,
      supporting_url: input.supportingUrl ?? null,
      supporting_notes: input.supportingNotes ?? "",
      strength: input.strength ?? 50,
      tags: input.tags ?? [],
      created_by: createdBy,
    })
    .select("*").single();
  if (error) throw error;
  return mapPv(data as DbPv);
}

export async function updateProblemValidationItem(
  id: string, patch: Partial<ProblemValidationInput>
): Promise<ProblemValidationItem> {
  const svc = createServiceClient();
  const dbPatch: Record<string, unknown> = {};
  if (patch.evidenceType !== undefined) dbPatch.evidence_type = patch.evidenceType;
  if (patch.title !== undefined) dbPatch.title = patch.title;
  if (patch.painPoint !== undefined) dbPatch.pain_point = patch.painPoint;
  if (patch.quote !== undefined) dbPatch.quote = patch.quote;
  if (patch.sourcePerson !== undefined) dbPatch.source_person = patch.sourcePerson;
  if (patch.sourceRole !== undefined) dbPatch.source_role = patch.sourceRole;
  if (patch.sourceDate !== undefined) dbPatch.source_date = patch.sourceDate;
  if (patch.supportingUrl !== undefined) dbPatch.supporting_url = patch.supportingUrl;
  if (patch.supportingNotes !== undefined) dbPatch.supporting_notes = patch.supportingNotes;
  if (patch.strength !== undefined) dbPatch.strength = patch.strength;
  if (patch.tags !== undefined) dbPatch.tags = patch.tags;
  const { data, error } = await svc
    .from("problem_validation_items").update(dbPatch).eq("id", id).select("*").single();
  if (error) throw error;
  return mapPv(data as DbPv);
}

export async function deleteProblemValidationItem(id: string): Promise<void> {
  const svc = createServiceClient();
  const { error } = await svc.from("problem_validation_items").delete().eq("id", id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Information Classification
// ---------------------------------------------------------------------------
export async function listClassificationMarks(projectId: string): Promise<InformationClassificationMark[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("information_classification_marks")
    .select("*")
    .eq("project_id", projectId);
  if (error) throw error;
  return (data as DbIc[]).map(mapIc);
}

export async function upsertClassificationMark(
  projectId: string,
  sourceTable: string,
  sourceId: string,
  classification: InformationClassification,
  reason: string,
  reviewedBy: string | null
): Promise<InformationClassificationMark> {
  const svc = createServiceClient();
  const { data, error } = await svc
    .from("information_classification_marks")
    .upsert({
      project_id: projectId,
      source_table: sourceTable,
      source_id: sourceId,
      classification,
      reason,
      reviewed_by: reviewedBy,
      reviewed_at: new Date().toISOString(),
    }, { onConflict: "project_id,source_table,source_id" })
    .select("*").single();
  if (error) throw error;
  return mapIc(data as DbIc);
}
