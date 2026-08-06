"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireAdmin, requireRole } from "@/lib/auth/rbac";
import {
  approveBrainDocument,
  createBrainDraftFromAnalysis,
  editBrainSection,
  getLatestBrainDocument,
  rejectBrainDocument,
} from "@/lib/brain-v2/service";
import { validateBrainForApproval } from "@/lib/brain-v2/validation";
import { notifyBrainChanged } from "@/lib/knowledge-sync/resync-engine";
import { RecommendationsEngine } from "@/lib/organizational-intelligence/recommendations-service";
import { detectAndUpsertModules } from "@/lib/domain-intelligence/module-library-service";
import { runArchitectureValidation } from "@/lib/architecture-validation/service";
import { emitEvent } from "@/lib/automation/event-bus";
import { EVENT_TYPES } from "@/lib/automation/events";
import { proposeChanges, listPendingChanges, acceptPendingChange, rejectPendingChange, mergePendingChange } from "@/lib/brain-v2/knowledge-aggregation";
import { buildManualNoteCandidate, type ManualNoteType } from "@/lib/brain-v2/manual-notes";
import type { BrainSectionKey, BrainDocumentRow } from "@/lib/brain-v2/types";
import type { BrainPendingChange, BrainKnowledgeGraphEdge } from "@/lib/types/database";

type Ok<T> = { ok: true } & T;
type Err = { ok: false; message: string; conflict?: boolean };
type Result<T = Record<string, never>> = Ok<T> | Err;

function authErr(message: string | undefined): Err {
  return { ok: false, message: message ?? "غير مسموح." };
}

/**
 * إنشاء/تحديث Draft يدويًا من آخر تحليل معتمد.
 *
 * الافتراضي دمج إضافي (`mode: "merge"`) — يعني المعلومة الجديدة تتضاف
 * والقديمة (وتعديلات الـ PM اليدوية والتوصيات المعتمدة) تفضل زي ما هي.
 * إعادة البناء الكاملة (`mode: "replace"`) بتمسح المحتوى القائم وتبنيه من
 * التحليل من الصفر، فمابتحصلش غير لما تتطلب صراحةً من الواجهة.
 */
export async function rebuildBrainDraftFromLatestAnalysis(
  projectId: string,
  mode: "merge" | "replace" = "merge"
): Promise<Result<{ documentId: string; version: number; addedItems: number }>> {
  const auth = await requireAdmin();
  if (!auth.ok) return authErr(auth.message);

  const svc = createServiceClient();
  const { data: latest } = await svc
    .from("discovery_analyses")
    .select("id, output, status")
    .eq("project_id", projectId)
    .eq("status", "completed")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!latest || !latest.output) {
    return { ok: false, message: "لا يوجد تحليل ناجح لبناء Brain منه." };
  }

  const result = await createBrainDraftFromAnalysis(
    projectId,
    latest.id,
    latest.output,
    auth.userId ?? null,
    { mode, sourceLabel: "تحديث يدوي من التحليل" }
  );
  if (!result.ok) return { ok: false, message: result.message };
  revalidatePath(`/dashboard/projects/${projectId}`);
  return {
    ok: true,
    documentId: result.documentId,
    version: result.version,
    addedItems: result.addedItems,
  };
}

/** اعتماد Draft — يفحص أولًا القيود قبل ما يعتمد. */
export async function approveBrainDraft(
  documentId: string,
  projectId: string
): Promise<Result> {
  const auth = await requireAdmin();
  if (!auth.ok) return authErr(auth.message);

  const svc = createServiceClient();
  const { data: doc } = await svc
    .from("project_brain_documents")
    .select("content, status")
    .eq("id", documentId)
    .maybeSingle();
  if (!doc) return { ok: false, message: "الوثيقة غير موجودة." };

  const validation = validateBrainForApproval(doc.content);
  if (!validation.ok) {
    return {
      ok: false,
      message:
        "لا يمكن الاعتماد — راجع المشاكل التالية:\n" +
        validation.issues.slice(0, 5).map((i) => `• ${i.message}`).join("\n"),
    };
  }

  const result = await approveBrainDocument(documentId, auth.userId ?? null);
  if (!result.ok) return { ok: false, message: result.message ?? "فشل الاعتماد." };

  try {
    await notifyBrainChanged(projectId, auth.userId ?? null);
  } catch (err) {
    console.error(`[KnowledgeSync] notifyBrainChanged threw after approval for project ${projectId}:`, err);
  }

  // Cross-Project Intelligence — أول Brain معتمد لمشروع هو أول نقطة فيها
  // محتوى كافٍ للمقارنة بمشاريع سابقة (Organizational Intelligence،
  // Phase 6). طبقة مستقلة تمامًا — فشلها لا يمنع اعتماد الـ Brain نفسه.
  after(async () => {
    try {
      await RecommendationsEngine.generateForProject(projectId);
    } catch (err) {
      console.error(`[OrganizationalIntelligence] generateForProject threw after approval for project ${projectId}:`, err);
    }
    // Knowledge & Decision Intelligence (Phase 6) — الـ Brain المعتمد هو
    // المصدر الحيّ لاكتشاف الوحدات ونموّ مكتبة الوحدات + التحقّق المعماري
    // قبل الـ PRD. طبقات مستقلة — فشلها لا يمنع الاعتماد.
    try {
      await detectAndUpsertModules(projectId);
    } catch (err) {
      console.error(`[ModuleLibrary] detectAndUpsertModules threw for project ${projectId}:`, err);
    }
    try {
      await runArchitectureValidation(projectId, auth.userId ?? null);
    } catch (err) {
      console.error(`[ArchitectureValidation] runArchitectureValidation threw for project ${projectId}:`, err);
    }
    // ناقل الأحداث (Phase 5) — الحدث ده كان معرّفًا وله Workflow لكن
    // مكانش بيتطلق من أي منتج؛ دلوقتي بقى مربوطًا باعتماد الـ Brain.
    await emitEvent({
      type: EVENT_TYPES.BRAIN_APPROVED,
      projectId,
      actorId: auth.userId ?? null,
      recordId: documentId,
      payload: {},
    });
  });

  revalidatePath(`/dashboard/projects/${projectId}`);
  return { ok: true } as Result;
}

/** رفض Draft مع سبب. */
export async function rejectBrainDraft(
  documentId: string,
  projectId: string,
  reason: string
): Promise<Result> {
  const auth = await requireAdmin();
  if (!auth.ok) return authErr(auth.message);
  if (!reason.trim()) return { ok: false, message: "سبب الرفض مطلوب." };

  const result = await rejectBrainDocument(documentId, auth.userId ?? null, reason);
  if (!result.ok) return { ok: false, message: result.message ?? "فشل الرفض." };
  revalidatePath(`/dashboard/projects/${projectId}`);
  return { ok: true } as Result;
}

/**
 * تعديل قسم — أي عضو داخلي مسجّل دخول يقدر يعدّل (نفس RBAC القائم في النظام
 * للـ writes). الحماية الأساسية عبر optimistic-lock (expectedUpdatedAt).
 */
export async function editSection(input: {
  documentId: string;
  projectId: string;
  sectionKey: BrainSectionKey;
  newContent: unknown;
  expectedUpdatedAt: string;
  reason: string | null;
}): Promise<Result> {
  const auth = await requireRole(["owner", "admin", "member"]);
  if (!auth.ok) return authErr(auth.message);

  const result = await editBrainSection({
    documentId: input.documentId,
    sectionKey: input.sectionKey,
    newContent: input.newContent,
    expectedUpdatedAt: input.expectedUpdatedAt,
    reason: input.reason,
    actorId: auth.userId ?? null,
  });
  if (!result.ok) {
    return { ok: false, message: result.message ?? "فشل الحفظ.", conflict: result.conflict };
  }
  revalidatePath(`/dashboard/projects/${input.projectId}`);
  return { ok: true } as Result;
}

/** جلب نسختين للمقارنة (Diff). */
export async function loadTwoBrainVersionsForDiff(
  projectId: string,
  fromVersion: number,
  toVersion: number
): Promise<Result<{ from: BrainDocumentRow; to: BrainDocumentRow }>> {
  const auth = await requireRole(["owner", "admin", "member"]);
  if (!auth.ok) return authErr(auth.message);

  const supabase = await createClient();
  const [{ data: a }, { data: b }] = await Promise.all([
    supabase
      .from("project_brain_documents")
      .select("*")
      .eq("project_id", projectId)
      .eq("version", fromVersion)
      .maybeSingle(),
    supabase
      .from("project_brain_documents")
      .select("*")
      .eq("project_id", projectId)
      .eq("version", toVersion)
      .maybeSingle(),
  ]);
  if (!a || !b) return { ok: false, message: "إحدى النسختين غير موجودة." };
  return { ok: true, from: a as BrainDocumentRow, to: b as BrainDocumentRow };
}

/**
 * ملاحظة يدوية من PM (Overview) — بتتحوّل مباشرة لـ Pending Change، مش
 * كتابة مباشرة داخل Brain (نفس قاعدة "ممنوع تحديث صامت" — حتى ملاحظة
 * PM نفسه بتعدّي من نفس مسار المراجعة، ثقتها 100% بس لسه لازم PM يوافق
 * عليها صراحة عشان يفضل فيه أثر واضح "إيه اللي اتغيّر ومن مصدر إيه").
 */
export async function submitManualNote(
  projectId: string,
  noteType: ManualNoteType,
  text: string
): Promise<Result<{ proposedCount: number; skippedNoBrain: boolean }>> {
  const auth = await requireRole(["owner", "admin", "member"]);
  if (!auth.ok) return authErr(auth.message);
  if (!text.trim()) return { ok: false, message: "نص الملاحظة مطلوب." };

  const candidate = buildManualNoteCandidate(noteType, text);
  const result = await proposeChanges(projectId, "manual_note", `note-${Date.now()}`, `ملاحظة يدوية جديدة`, [candidate]);
  if (result.skippedNoBrain) return { ok: false, message: "لا يوجد Project Brain معتمد لهذا المشروع بعد — الملاحظات اليدوية متاحة بعد أول اعتماد." };

  revalidatePath(`/dashboard/projects/${projectId}`);
  return { ok: true, proposedCount: result.proposedCount, skippedNoBrain: false };
}

export async function getBrainPendingChanges(projectId: string): Promise<BrainPendingChange[]> {
  const auth = await requireRole(["owner", "admin", "member"]);
  if (!auth.ok) return [];
  return listPendingChanges(projectId);
}

export async function getBrainKnowledgeGraph(projectId: string): Promise<BrainKnowledgeGraphEdge[]> {
  const auth = await requireRole(["owner", "admin", "member"]);
  if (!auth.ok) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("brain_knowledge_graph_edges")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(100);
  return (data as BrainKnowledgeGraphEdge[] | null) ?? [];
}

export async function acceptBrainPendingChange(projectId: string, changeId: string): Promise<Result> {
  const auth = await requireAdmin();
  if (!auth.ok) return authErr(auth.message);
  const result = await acceptPendingChange(changeId, auth.userId ?? null);
  if (!result.ok) return { ok: false, message: result.message ?? "فشل الاعتماد." };
  revalidatePath(`/dashboard/projects/${projectId}`);
  return { ok: true } as Result;
}

export async function rejectBrainPendingChange(projectId: string, changeId: string): Promise<Result> {
  const auth = await requireAdmin();
  if (!auth.ok) return authErr(auth.message);
  const result = await rejectPendingChange(changeId, auth.userId ?? null);
  if (!result.ok) return { ok: false, message: result.message ?? "فشل الرفض." };
  revalidatePath(`/dashboard/projects/${projectId}`);
  return { ok: true } as Result;
}

/** دمج بتعديل — mergedValueJson نص JSON خام للعنصر المعدَّل (نفس شكل new_value الأصلي). */
export async function mergeBrainPendingChange(projectId: string, changeId: string, mergedValueJson: string): Promise<Result> {
  const auth = await requireAdmin();
  if (!auth.ok) return authErr(auth.message);

  let mergedValue: unknown;
  try {
    mergedValue = JSON.parse(mergedValueJson);
  } catch {
    return { ok: false, message: "صيغة JSON غير صالحة." };
  }

  const result = await mergePendingChange(changeId, auth.userId ?? null, mergedValue);
  if (!result.ok) return { ok: false, message: result.message ?? "فشل الدمج." };
  revalidatePath(`/dashboard/projects/${projectId}`);
  return { ok: true } as Result;
}

// Re-export للاختبارات/الأدوات
export { getLatestBrainDocument };
