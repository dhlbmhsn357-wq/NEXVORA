import type { SupabaseClient } from "@supabase/supabase-js";
import type { BrainEntryType, MeetingExtraction } from "@/lib/types/database";

const CATEGORY_TO_ENTRY_TYPE: Record<keyof MeetingExtraction, BrainEntryType> = {
  decisions: "decision",
  risks: "risk",
  requests: "request",
  questions: "question",
  deadlines: "deadline",
};

/**
 * طبقة Project Brain Integration — تحوّل نتيجة الاستخراج لعناصر Brain
 * مستقلة، كل واحدة مربوطة بالاجتماع اللي جاءت منه (source_meeting_id)
 * عشان نعرف مصدر كل معلومة لاحقًا.
 */
export async function saveExtractionToBrain(
  supabase: SupabaseClient,
  projectId: string,
  meetingId: string,
  extraction: MeetingExtraction
): Promise<void> {
  const rows = (Object.keys(extraction) as Array<keyof MeetingExtraction>).flatMap((category) =>
    extraction[category].map((content) => ({
      project_id: projectId,
      entry_type: CATEGORY_TO_ENTRY_TYPE[category],
      content,
      source_meeting_id: meetingId,
    }))
  );

  if (rows.length === 0) return;

  const { error } = await supabase.from("project_brain_entries").insert(rows);
  if (error) {
    throw new Error(`فشل حفظ نتائج الاستخراج في Project Brain: ${error.message}`);
  }
}
