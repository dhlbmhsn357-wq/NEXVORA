"use server";

import { requireRole } from "@/lib/auth/rbac";
import { getDomainDashboard, type DomainDashboard } from "@/lib/domain-library/dashboard";
import {
  addPackageItem,
  createPackage,
  getPackageItems,
  listPackages,
  setPackageStatus,
  type DomainPackage,
  type DomainPackageItem,
} from "@/lib/domain-library/package-service";
import { selectPackagesForProject } from "@/lib/domain-library/selection-service";
import { buildFusedContext, getFusionWeights, setFusionWeight, type FusedContext } from "@/lib/domain-library/fusion/fusion-service";
import { findAffectedProjects, type AffectedProject } from "@/lib/domain-library/incremental";

/**
 * إجراءات مكتبة معرفة المجال (الجزء الموسّع).
 *
 * الحوكمة من المواصفة:
 * - **المدير** (owner): يؤلّف ويعدّل الحزم والأوزان.
 * - **الإداري** (admin): يستخدمها (اختيار/دمج).
 * - **المشرف** (supervisor): قراءة فقط.
 */

const DIRECTOR = ["owner"] as const;
const USER = ["owner", "admin"] as const;
const READER = ["owner", "admin", "supervisor"] as const;

// ---------- قراءة (المشرف فأعلى) ----------

export async function getLibraryDashboard(): Promise<{ ok: boolean; message?: string; data?: DomainDashboard }> {
  const auth = await requireRole([...READER]);
  if (!auth.ok) return { ok: false, message: auth.message };
  return { ok: true, data: await getDomainDashboard() };
}

export async function getPackages(
  domain?: string
): Promise<{ ok: boolean; message?: string; packages?: DomainPackage[] }> {
  const auth = await requireRole([...READER]);
  if (!auth.ok) return { ok: false, message: auth.message };
  return { ok: true, packages: await listPackages(undefined, { domain }) };
}

export async function getPackageDetail(
  packageId: string
): Promise<{ ok: boolean; message?: string; items?: DomainPackageItem[] }> {
  const auth = await requireRole([...READER]);
  if (!auth.ok) return { ok: false, message: auth.message };
  return { ok: true, items: await getPackageItems(packageId) };
}

export async function getWeights(): Promise<{ ok: boolean; message?: string; weights?: Array<{ source_type: string; weight: number }> }> {
  const auth = await requireRole([...READER]);
  if (!auth.ok) return { ok: false, message: auth.message };
  return { ok: true, weights: await getFusionWeights() };
}

// ---------- تأليف (المدير وحده) ----------

export async function createDomainPackage(
  domain: string,
  name: string,
  description?: string
): Promise<{ ok: boolean; message?: string; id?: string }> {
  const auth = await requireRole([...DIRECTOR]);
  if (!auth.ok) return { ok: false, message: auth.message };
  if (!domain.trim() || !name.trim()) return { ok: false, message: "المجال والاسم مطلوبان." };
  return createPackage({ domain, name, description }, auth.userId ?? null);
}

export async function addDomainPackageItem(
  packageId: string,
  item: { item_type: string; title: string; content?: string; importance?: number }
): Promise<{ ok: boolean; message?: string }> {
  const auth = await requireRole([...DIRECTOR]);
  if (!auth.ok) return { ok: false, message: auth.message };
  if (!item.title.trim()) return { ok: false, message: "العنوان مطلوب." };
  return addPackageItem(packageId, item);
}

export async function publishDomainPackage(
  packageId: string,
  status: "draft" | "published" | "archived"
): Promise<{ ok: boolean; message?: string }> {
  const auth = await requireRole([...DIRECTOR]);
  if (!auth.ok) return { ok: false, message: auth.message };
  return setPackageStatus(packageId, status);
}

export async function updateFusionWeight(
  sourceType: string,
  weight: number
): Promise<{ ok: boolean; message?: string }> {
  const auth = await requireRole([...DIRECTOR]);
  if (!auth.ok) return { ok: false, message: auth.message };
  return setFusionWeight(sourceType, weight, auth.userId ?? null);
}

export async function getPackageImpact(
  packageId: string
): Promise<{ ok: boolean; message?: string; projects?: AffectedProject[] }> {
  const auth = await requireRole([...DIRECTOR]);
  if (!auth.ok) return { ok: false, message: auth.message };
  return { ok: true, projects: await findAffectedProjects(packageId) };
}

// ---------- استخدام (الإداري فأعلى) ----------

export async function selectPackagesForProjectAction(
  projectId: string
): Promise<{ ok: boolean; message?: string; selected?: number }> {
  const auth = await requireRole([...USER]);
  if (!auth.ok) return { ok: false, message: auth.message };
  if (!projectId) return { ok: false, message: "المشروع مطلوب." };
  const outcome = await selectPackagesForProject(projectId);
  if (outcome.status === "unavailable") return { ok: false, message: outcome.message };
  return { ok: true, selected: outcome.selected };
}

export async function getProjectFusion(
  projectId: string
): Promise<{ ok: boolean; message?: string; context?: FusedContext }> {
  const auth = await requireRole([...USER]);
  if (!auth.ok) return { ok: false, message: auth.message };
  if (!projectId) return { ok: false, message: "المشروع مطلوب." };
  return { ok: true, context: await buildFusedContext(projectId) };
}
