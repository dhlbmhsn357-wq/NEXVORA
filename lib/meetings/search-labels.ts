import type { MeetingKnowledgeSearchResult } from "@/lib/types/database";

/** يترجم اسم الجدول المصدر (زي ما رجّعته search_meeting_knowledge) لتصنيف عربي قابل للعرض. */
export const SEARCH_SOURCE_LABELS: Record<string, string> = {
  meeting_decisions: "قرار",
  meeting_requirements: "متطلب",
  meeting_risks: "خطر",
  meeting_questions: "سؤال",
  meeting_tasks: "مهمة",
  meeting_extracted_items: "عنصر",
  meeting_attachments: "مرفق",
};

export function labelForSearchResult(result: MeetingKnowledgeSearchResult): string {
  return SEARCH_SOURCE_LABELS[result.source_table] ?? result.source_table;
}
