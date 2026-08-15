/**
 * NEXVORA Prospecting Database — أنواع مشتركة (Part 1: Backend)
 * ================================================================
 * قاعدة الاستهداف: مرحلة تسبق Leads. Prospect ≠ Lead ≠ Client ≠ Project.
 * لا يوجد workspace_id في هذا المشروع (single-tenant) — راجع
 * supabase/migrations/0115_prospecting_database.sql للتفاصيل المعمارية.
 */

export type ProspectStatus =
  | "new"
  | "needs_verification"
  | "ready_to_contact"
  | "contacted"
  | "replied"
  | "interested"
  | "follow_up"
  | "not_fit"
  | "converted"
  | "archived";

export const PROSPECT_STATUS_LABELS: Record<ProspectStatus, string> = {
  new: "جديد",
  needs_verification: "يحتاج تحقق",
  ready_to_contact: "جاهز للتواصل",
  contacted: "تم التواصل",
  replied: "ردّ",
  interested: "مهتم",
  follow_up: "متابعة لاحقة",
  not_fit: "غير مناسب",
  converted: "تم تحويله إلى Lead",
  archived: "مؤرشف",
};

export type ProspectPriority = "low" | "medium" | "high";
export type ProspectConfidence = "low" | "medium" | "high";
export type ProspectVerificationStatus = "unverified" | "verified" | "invalid_phone";

export type ProspectActivityType =
  | "imported"
  | "verified"
  | "assigned"
  | "whatsapp_opened"
  | "message_confirmed_sent"
  | "no_answer"
  | "replied"
  | "interested"
  | "follow_up_scheduled"
  | "not_fit"
  | "converted_to_lead"
  | "note_added"
  | "archived";

export type ProspectTemplateType = "first_contact" | "no_reply_follow_up" | "meeting_booking";

export type ProspectImportFileType = "xlsx" | "csv";

/** نتيجة تسجيل نتيجة تواصل — القيم المعروضة في UI (Part 2). */
export type ContactOutcome =
  | "no_answer" // لم يرد
  | "asked_for_details" // طلب تفاصيل
  | "interested" // مهتم / اتفقنا على موعد
  | "not_interested" // غير مهتم
  | "wrong_number"; // رقم خاطئ

export interface ProspectRow {
  id: string;
  importBatchId: string | null;
  organizationName: string;
  normalizedName: string | null;
  sector: string | null;
  governorate: string | null;
  cityOrArea: string | null;
  branchesCount: number | null;
  scopeNotes: string | null;
  primaryPhoneRaw: string | null;
  primaryPhoneNormalized: string | null;
  secondaryPhones: string[];
  email: string | null;
  websiteUrl: string | null;
  socialUrl: string | null;
  sourceUrls: string[];
  visibleSizeEvidence: string | null;
  activitySignal: string | null;
  painHypothesis: string | null;
  suggestedOffer: string | null;
  researchScore: number | null;
  priority: ProspectPriority;
  confidence: ProspectConfidence;
  verificationStatus: ProspectVerificationStatus;
  status: ProspectStatus;
  assignedTo: string | null;
  lastContactedAt: string | null;
  nextFollowUpAt: string | null;
  convertedLeadId: string | null;
  convertedAt: string | null;
  notes: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

export interface ProspectActivityRow {
  id: string;
  prospectId: string;
  activityType: ProspectActivityType;
  previousStatus: ProspectStatus | null;
  newStatus: ProspectStatus | null;
  channel: string | null;
  note: string | null;
  createdBy: string | null;
  createdAt: string;
}

export interface ProspectImportBatchRow {
  id: string;
  originalFilename: string;
  fileType: ProspectImportFileType;
  importedBy: string | null;
  columnMapping: Record<string, string>;
  totalRows: number;
  importedRows: number;
  duplicateRows: number;
  rejectedRows: number;
  createdAt: string;
}

export interface ProspectMessageTemplateRow {
  id: string;
  name: string;
  templateType: ProspectTemplateType;
  body: string;
  isDefault: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

/** جهة + Timeline كامل — شكل getProspectById. */
export interface ProspectWithActivities extends ProspectRow {
  activities: ProspectActivityRow[];
}
