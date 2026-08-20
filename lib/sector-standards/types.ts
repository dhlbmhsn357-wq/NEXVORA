/**
 * NEXVORA Sector Standards + Client Variants — Types (0123، المرحلة أ)
 * ======================================================================
 * "حزمة منتج قياسية" تُبنى مرة واحدة لكل قطاع (مشروع عليه
 * is_sector_standard = true)، ثم تُستنسخ (لقطة، مش وراثة حيّة) في مشروع
 * "Client Variant" منفصل لكل عميل فعلي. راجع migration 0123 للأعمدة
 * والجدول الجديد.
 */

/** محور "هل المشروع بدأ Discovery كامل، ولا هو Client Variant مبني على Standard؟" — مستقل تمامًا عن project_type/workflow_version/mode. */
export type ProjectWorkflowMode = "full_discovery" | "standard_based";

/** ملخّص عرض لمشروع Sector Standard (مشروع عليه is_sector_standard = true). */
export interface SectorStandardSummary {
  projectId: string;
  name: string;
  sectorName: string | null;
  standardVersion: string | null;
  createdAt: string;
}

/** صف project_standard_links — لقطة ربط مشروع العميل بالـ Standard اللي اتنسخ منه. */
export interface ProjectStandardLink {
  id: string;
  clientProjectId: string;
  standardProjectId: string;
  standardVersionSnapshot: string;
  clonedAt: string;
  createdBy: string | null;
}
