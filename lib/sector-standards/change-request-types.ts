/**
 * NEXVORA Sector Standards — Client Change Requests + Impact Analysis Types
 * (0124، المرحلة ب)
 * ============================================================================
 * "طلب تغيير" (Change Request) = فرق صريح صغير مسجَّل يدويًا عن الـ Client
 * Variant المستنسخ من Sector Standard — مش إعادة Discovery كاملة.
 * "أثر تغيير" (Change Impact) = عنصر واحد من نتيجة تحليل الذكاء الاصطناعي
 * لطلب تغيير: أي artifact في المنتج متأثر، وإزاي. راجع migration 0124.
 */

export type ChangeRequestType = "add" | "modify" | "remove";
export type ChangeRequestStatus = "draft" | "analyzing" | "needs_review" | "approved" | "applied" | "rejected";

export interface ChangeRequestRow {
  id: string;
  projectId: string;
  type: ChangeRequestType;
  title: string;
  description: string;
  sourceType: string | null;
  sourceId: string | null;
  status: ChangeRequestStatus;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * أنواع الـ artifact المدعومة فعليًا بمنطق تطبيق (apply) حقيقي في
 * apply-changes-service.ts (المرحلة ب، MVP). أنواع تانية (prd_section،
 * decision، state_machine، persona، user_flow) ممكن يظهر ليها تحليل أثر
 * (change_impacts.artifact_type نص حر، مش مقيَّد بالنوع ده) لكن "تطبيقها"
 * مش مؤتمت لسه — راجع apply-changes-service.ts للتفاصيل والسبب.
 */
export type SupportedApplyArtifactType =
  | "requirement"
  | "user_story"
  | "acceptance_criteria"
  | "business_rule"
  | "system_message";

export const SUPPORTED_APPLY_ARTIFACT_TYPES: readonly SupportedApplyArtifactType[] = [
  "requirement",
  "user_story",
  "acceptance_criteria",
  "business_rule",
  "system_message",
];

export type ImpactType = "add" | "modify" | "remove";
export type ImpactStatus = "proposed" | "approved" | "rejected" | "applied";

export interface ChangeImpactRow {
  id: string;
  changeRequestId: string;
  /** نص حر يطابق أنواع الـ artifact الموجودة فعليًا (راجع ملاحظة migration 0124) — مش مقيَّد بـ SupportedApplyArtifactType. */
  artifactType: string;
  artifactId: string | null;
  artifactLabel: string;
  impactType: ImpactType;
  reason: string;
  proposedChange: Record<string, unknown>;
  dependencies: string[];
  missingInformation: string;
  status: ImpactStatus;
  createdAt: string;
}

export interface CreateChangeRequestInput {
  type: ChangeRequestType;
  title: string;
  description?: string;
  sourceType?: string | null;
  sourceId?: string | null;
}
