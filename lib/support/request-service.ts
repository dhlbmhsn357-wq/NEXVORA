import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ConversationMessage,
  SupportAiDiagnosis,
  SupportRequest,
  SupportRequestType,
  SupportResolutionStatus,
  SupportStructuredSummary,
} from "@/lib/types/database";

/**
 * طبقة إنشاء/تحديث support_requests — لا Versioning هنا (الحالة دي
 * Case واحدة تتغيّر حالتها، مش مستند حي بيتوّلد من جديد)، وconversation_transcript
 * غير قابل للتعديل أصلًا بعد الإنشاء (مفروض على مستوى القاعدة).
 */
export async function createSupportRequest(
  supabase: SupabaseClient,
  params: {
    projectId: string;
    transcript: ConversationMessage[];
    requestType: SupportRequestType;
    structuredSummary: SupportStructuredSummary | null;
    resolutionStatus: Extract<SupportResolutionStatus, "auto_resolved" | "escalated">;
    relatedPrdSection: string | null;
    relatedBrainFact: string | null;
    customerIdentifier: string | null;
    browserInfo?: Record<string, unknown>;
    environmentInfo?: Record<string, unknown>;
    recentClientErrors?: Array<{ message: string; source?: string; at: string }>;
    aiDiagnosis?: SupportAiDiagnosis | null;
  }
): Promise<SupportRequest> {
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("support_requests")
    .insert({
      project_id: params.projectId,
      conversation_transcript: params.transcript,
      request_type: params.requestType,
      structured_summary: params.structuredSummary ?? {},
      resolution_status: params.resolutionStatus,
      escalated_at: params.resolutionStatus === "escalated" ? now : null,
      resolved_at: params.resolutionStatus === "auto_resolved" ? now : null,
      related_prd_section: params.relatedPrdSection,
      related_brain_fact: params.relatedBrainFact,
      customer_identifier: params.customerIdentifier,
      browser_info: params.browserInfo ?? {},
      environment_info: params.environmentInfo ?? {},
      recent_client_errors: params.recentClientErrors ?? [],
      ai_diagnosis: params.aiDiagnosis ?? {},
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(`فشل إنشاء Support Request: ${error?.message ?? "سبب غير معروف"}`);
  }
  return data as SupportRequest;
}

export async function updateSupportRequestStatus(
  supabase: SupabaseClient,
  requestId: string,
  status: SupportResolutionStatus
): Promise<void> {
  await supabase
    .from("support_requests")
    .update({
      resolution_status: status,
      resolved_at: status === "resolved" ? new Date().toISOString() : null,
    })
    .eq("id", requestId);
}
