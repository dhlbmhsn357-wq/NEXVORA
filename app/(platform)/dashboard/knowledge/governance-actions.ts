"use server";

import { requireRole } from "@/lib/auth/rbac";
import { runQaReport } from "@/lib/knowledge-hub/qa/qa-service";
import {
  buildRetentionPlan,
  listGovernancePolicies,
  setGovernancePolicy,
} from "@/lib/knowledge-hub/governance/governance-service";
import { exportKnowledgePackage } from "@/lib/knowledge-hub/package/export-service";
import { importKnowledgePackage } from "@/lib/knowledge-hub/package/import-service";
import { packageToCsv, packageToMarkdown } from "@/lib/knowledge-hub/package/serialize";
import { getOperationsCenter } from "@/lib/knowledge-hub/ops/operations-center";
import { syncKnowledgeTasks } from "@/lib/knowledge-hub/knowledge-tasks";
import type { QaReport } from "@/lib/knowledge-hub/qa/qa-model";
import type { RetentionPolicy } from "@/lib/knowledge-hub/governance/retention";
import type { OperationsCenter } from "@/lib/knowledge-hub/ops/operations-center";

/**
 * إجراءات الحوكمة والجودة والتشغيل (الجزءان السابع والثامن).
 *
 * كلها متحقّقة الصلاحية. مركز العمليات للمدير/الإداري فقط؛ الحوكمة
 * والجودة للمشرف فأعلى.
 */

const KNOWLEDGE_ROLES = ["owner", "admin", "supervisor"] as const;
const OPS_ROLES = ["owner", "admin"] as const;

/** يشغّل تقرير جودة موحّد ويخزّنه. */
export async function runKnowledgeQa(
  projectId: string
): Promise<{ ok: boolean; message?: string; report?: QaReport }> {
  const auth = await requireRole([...KNOWLEDGE_ROLES]);
  if (!auth.ok) return { ok: false, message: auth.message };
  if (!projectId) return { ok: false, message: "المشروع مطلوب." };

  const result = await runQaReport(projectId);
  if (result.status === "unavailable") return { ok: false, message: result.message };
  return { ok: true, report: result.report };
}

/** يقرأ سياسات الحوكمة. */
export async function getGovernancePolicies(
  projectId: string
): Promise<{ ok: boolean; message?: string; policies?: RetentionPolicy[] }> {
  const auth = await requireRole([...KNOWLEDGE_ROLES]);
  if (!auth.ok) return { ok: false, message: auth.message };
  return { ok: true, policies: await listGovernancePolicies(projectId) };
}

/** يضبط سياسة حوكمة. */
export async function saveGovernancePolicy(
  projectId: string,
  policy: RetentionPolicy
): Promise<{ ok: boolean; message?: string }> {
  const auth = await requireRole([...OPS_ROLES]);
  if (!auth.ok) return { ok: false, message: auth.message };
  return setGovernancePolicy(projectId, policy, auth.userId ?? null);
}

type RetentionSummary = { archive: number; delete: number; automatic: number; needsApproval: number };

/** يبني خطة احتفاظ (dry-run) للعرض قبل التنفيذ. */
export async function previewRetention(
  projectId: string
): Promise<{ ok: boolean; message?: string; summary?: RetentionSummary; count?: number }> {
  const auth = await requireRole([...OPS_ROLES]);
  if (!auth.ok) return { ok: false, message: auth.message };

  const plan = await buildRetentionPlan(projectId, Date.now());
  return { ok: true, summary: plan.summary, count: plan.decisions.length };
}

export type ExportFormat = "json" | "csv" | "markdown";

/**
 * يصدّر حزمة معرفة بالصيغة المطلوبة. إخفاء PII اختياري للمشاركة الخارجية.
 * JSON للاستيراد اللاحق؛ CSV/Markdown للقراءة والتقارير.
 */
export async function exportKnowledge(
  projectId: string,
  maskPii: boolean,
  format: ExportFormat = "json"
): Promise<{ ok: boolean; message?: string; content?: string; format?: ExportFormat; packageId?: string }> {
  const auth = await requireRole([...KNOWLEDGE_ROLES]);
  if (!auth.ok) return { ok: false, message: auth.message };

  const result = await exportKnowledgePackage(projectId, new Date().toISOString(), {
    maskPii,
    actorId: auth.userId ?? null,
  });
  if (result.status !== "ok" || !result.package) {
    return { ok: false, message: result.message ?? "فشل التصدير." };
  }

  const content =
    format === "csv"
      ? packageToCsv(result.package)
      : format === "markdown"
        ? packageToMarkdown(result.package)
        : JSON.stringify(result.package, null, 2);

  return { ok: true, content, format, packageId: result.packageId };
}

/** يستورد حزمة معرفة من JSON. */
export async function importKnowledge(
  projectId: string,
  json: string
): Promise<{ ok: boolean; message?: string; imported?: { items: number; entities: number; relations: number } }> {
  const auth = await requireRole([...OPS_ROLES]);
  if (!auth.ok) return { ok: false, message: auth.message };

  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return { ok: false, message: "الحزمة ليست JSON صالحًا." };
  }

  const result = await importKnowledgePackage(projectId, raw, auth.userId ?? null);
  if (result.status !== "ok") return { ok: false, message: result.message };
  return {
    ok: true,
    imported: {
      items: result.importedItems ?? 0,
      entities: result.importedEntities ?? 0,
      relations: result.importedRelations ?? 0,
    },
  };
}

/** مركز العمليات الموحّد — للمدير/الإداري. */
export async function getOpsCenter(): Promise<{ ok: boolean; message?: string; center?: OperationsCenter }> {
  const auth = await requireRole([...OPS_ROLES]);
  if (!auth.ok) return { ok: false, message: auth.message };
  return { ok: true, center: await getOperationsCenter(new Date().toISOString()) };
}

/** يحوّل الفجوات والرؤى الحرجة لمهام موكَلة. */
export async function generateKnowledgeTasks(
  projectId: string
): Promise<{ ok: boolean; message?: string; created?: number; duplicates?: number }> {
  const auth = await requireRole([...KNOWLEDGE_ROLES]);
  if (!auth.ok) return { ok: false, message: auth.message };

  const outcome = await syncKnowledgeTasks(projectId, auth.userId ?? null);
  return { ok: true, created: outcome.created, duplicates: outcome.duplicates };
}
