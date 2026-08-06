"use server";

import { requireRole } from "@/lib/auth/rbac";
import { getOrgMemoryDashboard, type OrgMemoryDashboard } from "@/lib/organizational-memory/dashboard";
import { extractProjectExperience } from "@/lib/organizational-memory/extraction-service";
import {
  approveCandidate,
  decideCandidate,
  listPendingCandidates,
  type CandidateRow,
} from "@/lib/organizational-memory/promotion-service";
import { listExperiences, retireExperience, type Experience } from "@/lib/organizational-memory/library-service";

/**
 * إجراءات الذاكرة المؤسسية.
 *
 * الحوكمة من المواصفة:
 * - **Director** (owner): كامل الصلاحيات (ترقية، اعتماد، إدارة).
 * - **Admin**: يقترح الترقية.
 * - **Supervisor**: قراءة فقط.
 * - **Executor** (member): لا يرى الذاكرة المؤسسية إطلاقًا.
 */

const DIRECTOR = ["owner"] as const;
const PROPOSER = ["owner", "admin"] as const;
const READER = ["owner", "admin", "supervisor"] as const;

export async function getMemoryDashboard(): Promise<{ ok: boolean; message?: string; data?: OrgMemoryDashboard }> {
  const auth = await requireRole([...READER]);
  if (!auth.ok) return { ok: false, message: auth.message };
  return { ok: true, data: await getOrgMemoryDashboard() };
}

export async function getPendingCandidates(): Promise<{ ok: boolean; message?: string; candidates?: CandidateRow[] }> {
  const auth = await requireRole([...READER]);
  if (!auth.ok) return { ok: false, message: auth.message };
  return { ok: true, candidates: await listPendingCandidates() };
}

export async function getLibrary(
  opts: { domain?: string; type?: string; search?: string } = {}
): Promise<{ ok: boolean; message?: string; experiences?: Experience[] }> {
  const auth = await requireRole([...READER]);
  if (!auth.ok) return { ok: false, message: auth.message };
  return { ok: true, experiences: await listExperiences(opts) };
}

/**
 * «اعتماد المشروع كمصدر خبرة مؤسسية» — للمدير فقط، لا يعمل تلقائيًا.
 */
export async function promoteProjectExperience(
  projectId: string
): Promise<{ ok: boolean; message?: string; candidateCount?: number }> {
  const auth = await requireRole([...DIRECTOR]);
  if (!auth.ok) return { ok: false, message: auth.message };
  if (!projectId) return { ok: false, message: "المشروع مطلوب." };

  const outcome = await extractProjectExperience(projectId, auth.userId ?? null);
  if (outcome.status === "unavailable") return { ok: false, message: outcome.message };
  if (outcome.status === "failed") return { ok: false, message: outcome.message };
  return { ok: true, candidateCount: outcome.candidateCount };
}

// ---------- المراجعة البشرية ----------

export async function approveExperienceCandidate(
  candidateId: string,
  edits?: { title?: string; content?: string; domain?: string }
): Promise<{ ok: boolean; message?: string; experienceId?: string }> {
  const auth = await requireRole([...DIRECTOR]);
  if (!auth.ok) return { ok: false, message: auth.message };
  return approveCandidate(candidateId, auth.userId ?? null, edits);
}

export async function rejectExperienceCandidate(
  candidateId: string,
  reason?: string
): Promise<{ ok: boolean; message?: string }> {
  const auth = await requireRole([...DIRECTOR]);
  if (!auth.ok) return { ok: false, message: auth.message };
  return decideCandidate(candidateId, "rejected", auth.userId ?? null, reason);
}

export async function retireExperienceAction(
  experienceId: string
): Promise<{ ok: boolean; message?: string }> {
  const auth = await requireRole([...DIRECTOR]);
  if (!auth.ok) return { ok: false, message: auth.message };
  return retireExperience(experienceId);
}

/** اقتراح الترقية — الإداري فأعلى (ينشئ مرشّحين ينتظرون المدير). */
export async function proposePromotion(
  projectId: string
): Promise<{ ok: boolean; message?: string; candidateCount?: number }> {
  const auth = await requireRole([...PROPOSER]);
  if (!auth.ok) return { ok: false, message: auth.message };
  const outcome = await extractProjectExperience(projectId, auth.userId ?? null);
  if (outcome.status !== "ok") return { ok: false, message: outcome.message };
  return { ok: true, candidateCount: outcome.candidateCount };
}
