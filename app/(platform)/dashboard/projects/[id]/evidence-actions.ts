"use server";

/**
 * NEXVORA Evidence Traceability — Server Actions (P8)
 * ===================================================
 * كل التعديلات محمية بـ RBAC (owner + admin + supervisor).
 * القراءة عبر Server Component مباشرة (listEvidenceForSourceWithBodies).
 */
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/rbac";
import {
  createEvidenceLink, deleteEvidenceLink, updateEvidenceLinkNote,
  listEvidenceForSourceWithBodies,
} from "@/lib/evidence/service";
import {
  EVIDENCE_SOURCE_TYPES, EVIDENCE_KINDS,
  type EvidenceSourceType, type EvidenceKind, type EvidenceLinkView,
} from "@/lib/evidence/types";

type ActionResult<T = void> = { ok: true; data?: T } | { ok: false; message: string };

const WRITE_ROLES = ["owner", "admin", "supervisor"] as const;

async function guard() {
  const gate = await requireRole([...WRITE_ROLES]);
  if (!gate.ok) return { ok: false as const, message: gate.message ?? "غير مصرَّح" };
  return { ok: true as const, userId: gate.userId ?? null };
}

const isSourceType = (x: string): x is EvidenceSourceType =>
  (EVIDENCE_SOURCE_TYPES as readonly string[]).includes(x);
const isEvidenceKind = (x: string): x is EvidenceKind =>
  (EVIDENCE_KINDS as readonly string[]).includes(x);

// ---------------------------------------------------------------------------
// Fetch (server action — تُستدعى من الـ Modal client لتحميل الأدلة عند فتحه)
// ---------------------------------------------------------------------------
export async function loadEvidenceForSourceAction(
  projectId: string,
  sourceType: string,
  sourceId: string,
): Promise<ActionResult<EvidenceLinkView[]>> {
  // القراءة متاحة لكل مسجّل، لكن نضمن أن المستخدم مسجّل على الأقل.
  const gate = await requireRole(["owner", "admin", "supervisor", "member"]);
  if (!gate.ok) return { ok: false, message: gate.message ?? "غير مسجّل دخول." };
  if (!isSourceType(sourceType)) return { ok: false, message: "نوع مصدر غير معروف." };
  if (!sourceId) return { ok: false, message: "المصدر مطلوب." };
  try {
    const data = await listEvidenceForSourceWithBodies(projectId, sourceType, sourceId);
    return { ok: true, data };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "فشل التحميل." };
  }
}

// ---------------------------------------------------------------------------
// Create / Delete / Update note
// ---------------------------------------------------------------------------
export async function linkEvidenceAction(
  projectId: string,
  sourceType: string, sourceId: string,
  evidenceType: string, evidenceId: string,
  note: string,
): Promise<ActionResult<{ id: string }>> {
  const g = await guard();
  if (!g.ok) return g;
  if (!isSourceType(sourceType)) return { ok: false, message: "نوع مصدر غير معروف." };
  if (!isEvidenceKind(evidenceType)) return { ok: false, message: "نوع دليل غير معروف." };
  if (!sourceId || !evidenceId) return { ok: false, message: "المصدر والدليل مطلوبان." };
  try {
    const row = await createEvidenceLink(
      projectId, sourceType, sourceId, evidenceType, evidenceId, note.trim(), g.userId,
    );
    revalidatePath(`/dashboard/projects/${projectId}`);
    return { ok: true, data: { id: row.id } };
  } catch (e) {
    // خطأ unique constraint = ربط مكرّر
    const msg = e instanceof Error ? e.message : "فشل الربط.";
    if (msg.toLowerCase().includes("duplicate") || msg.toLowerCase().includes("ev_uniq")) {
      return { ok: false, message: "الربط موجود مسبقًا." };
    }
    return { ok: false, message: msg };
  }
}

export async function unlinkEvidenceAction(projectId: string, id: string): Promise<ActionResult> {
  const g = await guard();
  if (!g.ok) return g;
  try {
    await deleteEvidenceLink(id);
    revalidatePath(`/dashboard/projects/${projectId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "فشل الحذف." };
  }
}

export async function updateEvidenceNoteAction(
  projectId: string, id: string, note: string,
): Promise<ActionResult> {
  const g = await guard();
  if (!g.ok) return g;
  try {
    await updateEvidenceLinkNote(id, note.trim());
    revalidatePath(`/dashboard/projects/${projectId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "فشل التحديث." };
  }
}
