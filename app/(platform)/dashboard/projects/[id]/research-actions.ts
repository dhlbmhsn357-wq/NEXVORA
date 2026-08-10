"use server";

/**
 * NEXVORA Market Research + Problem Validation — Server Actions (P5)
 * ===================================================================
 * كل التعديلات محمية بـ RBAC (owner + admin + supervisor).
 * القراءة عبر RLS للمستخدمين المسجّلين.
 */
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/rbac";
import {
  createMarketResearchItem,
  updateMarketResearchItem,
  deleteMarketResearchItem,
  createProblemValidationItem,
  updateProblemValidationItem,
  deleteProblemValidationItem,
  upsertClassificationMark,
  updateEvidenceOrigin,
  type MarketResearchInput,
  type ProblemValidationInput,
} from "@/lib/market-research/service";
import {
  MARKET_RESEARCH_ITEM_TYPES,
  EVIDENCE_TYPES,
  INFORMATION_CLASSIFICATIONS,
  CONFIDENTIALITY_LEVELS,
  EVIDENCE_ORIGINS,
  type MarketResearchItemType,
  type EvidenceType,
  type InformationClassification,
  type Confidentiality,
  type EvidenceOrigin,
} from "@/lib/market-research/types";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * يقرأ mode المشروع (test|real|unclassified) عبر service client.
 * يُستخدم لحسم origin الافتراضي عند الإنشاء + قواعد التغيير.
 */
async function getProjectMode(projectId: string): Promise<"unclassified" | "test" | "real"> {
  try {
    const svc = createServiceClient();
    const { data } = await svc.from("projects").select("mode").eq("id", projectId).maybeSingle();
    const m = (data as { mode?: string } | null)?.mode ?? "unclassified";
    if (m === "test" || m === "real") return m;
    return "unclassified";
  } catch {
    return "unclassified";
  }
}

type ActionResult<T = void> = { ok: true; data?: T } | { ok: false; message: string };

const WRITE_ROLES = ["owner", "admin", "supervisor"] as const;

async function guard() {
  const gate = await requireRole([...WRITE_ROLES]);
  if (!gate.ok) return { ok: false as const, message: gate.message ?? "غير مصرَّح" };
  return { ok: true as const, userId: gate.userId ?? null };
}

function isValidMrType(x: string): x is MarketResearchItemType {
  return (MARKET_RESEARCH_ITEM_TYPES as readonly string[]).includes(x);
}
function isValidEvidence(x: string): x is EvidenceType {
  return (EVIDENCE_TYPES as readonly string[]).includes(x);
}
function isValidClassification(x: string): x is InformationClassification {
  return (INFORMATION_CLASSIFICATIONS as readonly string[]).includes(x);
}
function isValidConfidentiality(x: string): x is Confidentiality {
  return (CONFIDENTIALITY_LEVELS as readonly string[]).includes(x);
}
function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

// ---------------------------------------------------------------------------
// Market Research
// ---------------------------------------------------------------------------
export async function createMarketResearchAction(
  projectId: string,
  raw: {
    itemType: string; title: string; summary?: string; sourceUrl?: string;
    sourceNotes?: string; confidence?: number | string; tags?: string;
    informationClass?: string; confidentiality?: string;
  }
): Promise<ActionResult<{ id: string }>> {
  const g = await guard();
  if (!g.ok) return g;
  const title = raw.title?.trim();
  if (!title) return { ok: false, message: "العنوان مطلوب." };
  if (!isValidMrType(raw.itemType)) return { ok: false, message: "نوع العنصر غير معروف." };
  const conf = raw.confidence == null || raw.confidence === "" ? 50 : Number(raw.confidence);
  if (Number.isNaN(conf)) return { ok: false, message: "قيمة الثقة غير صحيحة." };

  // مشاريع test: origin الافتراضي 'simulated'، مشاريع أخرى: 'unverified'.
  const projectMode = await getProjectMode(projectId);
  const input: MarketResearchInput = {
    itemType: raw.itemType,
    title,
    summary: raw.summary ?? "",
    sourceUrl: raw.sourceUrl?.trim() || null,
    sourceNotes: raw.sourceNotes ?? "",
    confidence: clamp(Math.round(conf), 0, 100),
    tags: parseTags(raw.tags),
    informationClass: raw.informationClass && isValidClassification(raw.informationClass) ? raw.informationClass : undefined,
    confidentiality: raw.confidentiality && isValidConfidentiality(raw.confidentiality) ? raw.confidentiality : "internal",
    origin: projectMode === "test" ? "simulated" : "unverified",
  };
  try {
    const row = await createMarketResearchItem(projectId, input, g.userId);
    revalidatePath(`/dashboard/projects/${projectId}`);
    return { ok: true, data: { id: row.id } };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "فشل الإنشاء." };
  }
}

export async function updateMarketResearchAction(
  projectId: string,
  id: string,
  patch: Partial<{ itemType: string; title: string; summary: string; sourceUrl: string; sourceNotes: string; confidence: number | string; tags: string; informationClass: string; confidentiality: string; }>
): Promise<ActionResult> {
  const g = await guard();
  if (!g.ok) return g;
  const clean: Partial<MarketResearchInput> = {};
  if (patch.itemType !== undefined) {
    if (!isValidMrType(patch.itemType)) return { ok: false, message: "نوع غير معروف." };
    clean.itemType = patch.itemType;
  }
  if (patch.title !== undefined) {
    const t = patch.title.trim(); if (!t) return { ok: false, message: "العنوان مطلوب." };
    clean.title = t;
  }
  if (patch.summary !== undefined) clean.summary = patch.summary;
  if (patch.sourceUrl !== undefined) clean.sourceUrl = patch.sourceUrl?.trim() || null;
  if (patch.sourceNotes !== undefined) clean.sourceNotes = patch.sourceNotes;
  if (patch.confidence !== undefined) {
    const n = Number(patch.confidence);
    if (Number.isNaN(n)) return { ok: false, message: "قيمة الثقة غير صحيحة." };
    clean.confidence = clamp(Math.round(n), 0, 100);
  }
  if (patch.tags !== undefined) clean.tags = parseTags(patch.tags);
  if (patch.informationClass !== undefined) {
    if (!isValidClassification(patch.informationClass)) return { ok: false, message: "تصنيف المعلومة غير معروف." };
    clean.informationClass = patch.informationClass;
  }
  if (patch.confidentiality !== undefined) {
    if (!isValidConfidentiality(patch.confidentiality)) return { ok: false, message: "مستوى السرّية غير معروف." };
    clean.confidentiality = patch.confidentiality;
  }
  try {
    await updateMarketResearchItem(id, clean);
    revalidatePath(`/dashboard/projects/${projectId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "فشل التحديث." };
  }
}

export async function deleteMarketResearchAction(projectId: string, id: string): Promise<ActionResult> {
  const g = await guard();
  if (!g.ok) return g;
  try {
    await deleteMarketResearchItem(id);
    revalidatePath(`/dashboard/projects/${projectId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "فشل الحذف." };
  }
}

// ---------------------------------------------------------------------------
// Problem Validation
// ---------------------------------------------------------------------------
export async function createProblemValidationAction(
  projectId: string,
  raw: {
    evidenceType: string; title: string; painPoint: string;
    quote?: string; sourcePerson?: string; sourceRole?: string; sourceDate?: string;
    supportingUrl?: string; supportingNotes?: string; strength?: number | string; tags?: string;
    informationClass?: string; confidentiality?: string;
  }
): Promise<ActionResult<{ id: string }>> {
  const g = await guard();
  if (!g.ok) return g;
  const title = raw.title?.trim();
  const pain = raw.painPoint?.trim();
  if (!title) return { ok: false, message: "العنوان مطلوب." };
  if (!pain) return { ok: false, message: "نقطة الألم مطلوبة." };
  if (!isValidEvidence(raw.evidenceType)) return { ok: false, message: "نوع الدليل غير معروف." };
  const st = raw.strength == null || raw.strength === "" ? 50 : Number(raw.strength);
  if (Number.isNaN(st)) return { ok: false, message: "قيمة القوّة غير صحيحة." };

  const projectMode = await getProjectMode(projectId);
  const input: ProblemValidationInput = {
    evidenceType: raw.evidenceType,
    title,
    painPoint: pain,
    quote: raw.quote ?? "",
    sourcePerson: raw.sourcePerson ?? "",
    sourceRole: raw.sourceRole ?? "",
    sourceDate: raw.sourceDate || null,
    supportingUrl: raw.supportingUrl?.trim() || null,
    supportingNotes: raw.supportingNotes ?? "",
    strength: clamp(Math.round(st), 0, 100),
    tags: parseTags(raw.tags),
    informationClass: raw.informationClass && isValidClassification(raw.informationClass) ? raw.informationClass : undefined,
    confidentiality: raw.confidentiality && isValidConfidentiality(raw.confidentiality) ? raw.confidentiality : "internal",
    origin: projectMode === "test" ? "simulated" : "unverified",
  };
  try {
    const row = await createProblemValidationItem(projectId, input, g.userId);
    revalidatePath(`/dashboard/projects/${projectId}`);
    return { ok: true, data: { id: row.id } };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "فشل الإنشاء." };
  }
}

export async function updateProblemValidationAction(
  projectId: string,
  id: string,
  patch: Partial<{ evidenceType: string; title: string; painPoint: string; quote: string; sourcePerson: string; sourceRole: string; sourceDate: string; supportingUrl: string; supportingNotes: string; strength: number | string; tags: string; informationClass: string; confidentiality: string; }>
): Promise<ActionResult> {
  const g = await guard();
  if (!g.ok) return g;
  const clean: Partial<ProblemValidationInput> = {};
  if (patch.evidenceType !== undefined) {
    if (!isValidEvidence(patch.evidenceType)) return { ok: false, message: "نوع غير معروف." };
    clean.evidenceType = patch.evidenceType;
  }
  if (patch.title !== undefined) {
    const t = patch.title.trim(); if (!t) return { ok: false, message: "العنوان مطلوب." };
    clean.title = t;
  }
  if (patch.painPoint !== undefined) {
    const p = patch.painPoint.trim(); if (!p) return { ok: false, message: "نقطة الألم مطلوبة." };
    clean.painPoint = p;
  }
  if (patch.quote !== undefined) clean.quote = patch.quote;
  if (patch.sourcePerson !== undefined) clean.sourcePerson = patch.sourcePerson;
  if (patch.sourceRole !== undefined) clean.sourceRole = patch.sourceRole;
  if (patch.sourceDate !== undefined) clean.sourceDate = patch.sourceDate || null;
  if (patch.supportingUrl !== undefined) clean.supportingUrl = patch.supportingUrl?.trim() || null;
  if (patch.supportingNotes !== undefined) clean.supportingNotes = patch.supportingNotes;
  if (patch.strength !== undefined) {
    const n = Number(patch.strength);
    if (Number.isNaN(n)) return { ok: false, message: "قيمة القوّة غير صحيحة." };
    clean.strength = clamp(Math.round(n), 0, 100);
  }
  if (patch.tags !== undefined) clean.tags = parseTags(patch.tags);
  if (patch.informationClass !== undefined) {
    if (!isValidClassification(patch.informationClass)) return { ok: false, message: "تصنيف المعلومة غير معروف." };
    clean.informationClass = patch.informationClass;
  }
  if (patch.confidentiality !== undefined) {
    if (!isValidConfidentiality(patch.confidentiality)) return { ok: false, message: "مستوى السرّية غير معروف." };
    clean.confidentiality = patch.confidentiality;
  }
  try {
    await updateProblemValidationItem(id, clean);
    revalidatePath(`/dashboard/projects/${projectId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "فشل التحديث." };
  }
}

export async function deleteProblemValidationAction(projectId: string, id: string): Promise<ActionResult> {
  const g = await guard();
  if (!g.ok) return g;
  try {
    await deleteProblemValidationItem(id);
    revalidatePath(`/dashboard/projects/${projectId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "فشل الحذف." };
  }
}

// ---------------------------------------------------------------------------
// Evidence Origin (owner/admin only) — يعدّل حقل origin على أي عنصر
// market_research_items أو problem_validation_items. المشاريع التجريبية
// لا يُسمح فيها بترقية دليل لـ verified_real (يبقى كـ محاكاة).
// ---------------------------------------------------------------------------
const ORIGIN_ADMIN_ROLES = ["owner", "admin"] as const;

export async function updateEvidenceOriginAction(
  projectId: string,
  tableType: "market_research" | "problem_validation",
  itemId: string,
  origin: string,
): Promise<ActionResult> {
  const { requireRole: rr } = await import("@/lib/auth/rbac");
  const gate = await rr([...ORIGIN_ADMIN_ROLES]);
  if (!gate.ok) return { ok: false, message: gate.message ?? "ماعندكش صلاحية." };

  if (!(EVIDENCE_ORIGINS as readonly string[]).includes(origin)) {
    return { ok: false, message: "قيمة origin غير صالحة." };
  }
  const table = tableType === "market_research" ? "market_research_items" : "problem_validation_items";
  if (!itemId) return { ok: false, message: "معرّف العنصر مطلوب." };

  // Test-mode gate: ترقية دليل لـ verified_real ممنوعة على مشاريع تجريبية.
  if (origin === "verified_real") {
    const mode = await getProjectMode(projectId);
    if (mode === "test") {
      return { ok: false, message: "المشروع تجريبي — لا يمكن ترقية الدليل لـ 'حقيقي'." };
    }
  }

  try {
    await updateEvidenceOrigin(table, itemId, origin as EvidenceOrigin);
    revalidatePath(`/dashboard/projects/${projectId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "فشل التحديث." };
  }
}

// ---------------------------------------------------------------------------
// Information Classification
// ---------------------------------------------------------------------------
export async function setClassificationAction(
  projectId: string, sourceTable: string, sourceId: string,
  classification: string, reason: string
): Promise<ActionResult> {
  const g = await guard();
  if (!g.ok) return g;
  if (!sourceTable || !sourceId) return { ok: false, message: "المصدر مطلوب." };
  if (!isValidClassification(classification)) return { ok: false, message: "تصنيف غير معروف." };
  try {
    await upsertClassificationMark(projectId, sourceTable, sourceId, classification, reason.trim(), g.userId);
    revalidatePath(`/dashboard/projects/${projectId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "فشل التحديث." };
  }
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
function parseTags(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw.split(",").map((t) => t.trim()).filter(Boolean).slice(0, 20);
}
