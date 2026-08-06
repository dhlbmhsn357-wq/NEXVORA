import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  MeetingDecision,
  MeetingRequirement,
  MeetingRisk,
  MeetingQuestion,
  MeetingTask,
  MeetingExtractedItem,
  MeetingAiResult,
} from "@/lib/types/database";

export interface MeetingReportData {
  decisions: MeetingDecision[];
  functionalRequirements: MeetingRequirement[];
  nonFunctionalRequirements: MeetingRequirement[];
  risks: MeetingRisk[];
  questions: MeetingQuestion[];
  tasks: MeetingTask[];
  businessRules: MeetingExtractedItem[];
  painPoints: MeetingExtractedItem[];
  constraints: MeetingExtractedItem[];
  ideas: MeetingExtractedItem[];
  dependencies: MeetingExtractedItem[];
  conflicts: MeetingExtractedItem[];
  missingInformation: MeetingExtractedItem[];
  overallConfidence: number | null;
}

/**
 * تقرير الاجتماع الكامل — "زي Discovery Analysis" بالضبط زي ما طُلب:
 * كل فئة منفصلة عن التانية، كل عنصر بدرجة ثقة ودليل. المصدر جداول
 * Migration 0050 المُطبّعة (مش meeting_reviews القديمة اللي لسه شغّالة
 * بمعزل تمامًا لمسارها الأصلي).
 */
export async function getMeetingReportData(supabase: SupabaseClient, meetingId: string): Promise<MeetingReportData> {
  const [
    { data: decisions },
    { data: requirements },
    { data: risks },
    { data: questions },
    { data: tasks },
    { data: extractedItems },
    { data: aiResult },
  ] = await Promise.all([
    supabase.from("meeting_decisions").select("*").eq("meeting_id", meetingId).order("created_at", { ascending: true }),
    supabase.from("meeting_requirements").select("*").eq("meeting_id", meetingId).order("created_at", { ascending: true }),
    supabase.from("meeting_risks").select("*").eq("meeting_id", meetingId).order("created_at", { ascending: true }),
    supabase.from("meeting_questions").select("*").eq("meeting_id", meetingId).order("created_at", { ascending: true }),
    supabase.from("meeting_tasks").select("*").eq("meeting_id", meetingId).order("created_at", { ascending: true }),
    supabase.from("meeting_extracted_items").select("*").eq("meeting_id", meetingId).order("created_at", { ascending: true }),
    supabase.from("meeting_ai_results").select("*").eq("meeting_id", meetingId).order("generated_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  const allRequirements = (requirements as MeetingRequirement[] | null) ?? [];
  const allItems = (extractedItems as MeetingExtractedItem[] | null) ?? [];
  const byCategory = (category: MeetingExtractedItem["category"]) => allItems.filter((i) => i.category === category);

  return {
    decisions: (decisions as MeetingDecision[] | null) ?? [],
    functionalRequirements: allRequirements.filter((r) => r.requirement_type === "functional"),
    nonFunctionalRequirements: allRequirements.filter((r) => r.requirement_type === "non_functional"),
    risks: (risks as MeetingRisk[] | null) ?? [],
    questions: (questions as MeetingQuestion[] | null) ?? [],
    tasks: (tasks as MeetingTask[] | null) ?? [],
    businessRules: byCategory("business_rule"),
    painPoints: byCategory("pain_point"),
    constraints: byCategory("constraint"),
    ideas: byCategory("idea"),
    dependencies: byCategory("dependency"),
    conflicts: byCategory("conflict"),
    missingInformation: byCategory("missing_information"),
    overallConfidence: (aiResult as MeetingAiResult | null)?.confidence_overall ?? null,
  };
}
