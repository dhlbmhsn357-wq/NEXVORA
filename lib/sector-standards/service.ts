/**
 * NEXVORA Sector Standards — Data Access (0123، المرحلة أ)
 * ============================================================
 * Server-only. القراءة عبر authenticated client (RLS SELECT).
 * الكتابة عبر service client (RBAC مطبّق في server actions).
 * نفس نمط business-rules-service.ts / state-machine-service.ts بالضبط.
 */
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import type { ProjectStandardLink, SectorStandardSummary } from "./types";

type DbProjectRow = {
  id: string;
  name: string;
  sector_name: string | null;
  standard_version: string | null;
  created_at: string;
};

function mapSectorStandardSummary(r: DbProjectRow): SectorStandardSummary {
  return {
    projectId: r.id,
    name: r.name,
    sectorName: r.sector_name,
    standardVersion: r.standard_version,
    createdAt: r.created_at,
  };
}

type DbLinkRow = {
  id: string;
  client_project_id: string;
  standard_project_id: string;
  standard_version_snapshot: string;
  cloned_at: string;
  created_by: string | null;
};

function mapProjectStandardLink(r: DbLinkRow): ProjectStandardLink {
  return {
    id: r.id,
    clientProjectId: r.client_project_id,
    standardProjectId: r.standard_project_id,
    standardVersionSnapshot: r.standard_version_snapshot,
    clonedAt: r.cloned_at,
    createdBy: r.created_by,
  };
}

/** كل مشاريع Sector Standard (is_sector_standard = true) — لاختيارها كمصدر لاستنساخ Client Variant. */
export async function listSectorStandards(): Promise<SectorStandardSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .select("id, name, sector_name, standard_version, created_at")
    .eq("is_sector_standard", true)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as DbProjectRow[]).map(mapSectorStandardSummary);
}

/** لقطة الربط لمشروع عميل معيّن (null لو المشروع مش Client Variant أصلًا — أي مشروع full_discovery عادي). */
export async function getProjectStandardLink(clientProjectId: string): Promise<ProjectStandardLink | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("project_standard_links")
    .select("*")
    .eq("client_project_id", clientProjectId)
    .maybeSingle();
  if (error) throw error;
  return data ? mapProjectStandardLink(data as DbLinkRow) : null;
}

/**
 * يعلّم مشروعًا موجودًا كـ Sector Standard رسميًا (is_sector_standard = true)
 * مع اسم القطاع ورقم الإصدار — شرط أساسي قبل إمكانية استنساخه في
 * Client Variant (راجع clone-service.ts::createClientVariant).
 */
export async function markProjectAsSectorStandard(
  projectId: string,
  sectorName: string,
  standardVersion: string
): Promise<void> {
  const trimmedSector = sectorName.trim();
  const trimmedVersion = standardVersion.trim();
  if (!trimmedSector) throw new Error("اسم القطاع مطلوب.");
  if (!trimmedVersion) throw new Error("رقم إصدار الـ Standard مطلوب.");

  const svc = createServiceClient();
  const { error } = await svc
    .from("projects")
    .update({
      is_sector_standard: true,
      sector_name: trimmedSector,
      standard_version: trimmedVersion,
    })
    .eq("id", projectId);
  if (error) throw error;
}
