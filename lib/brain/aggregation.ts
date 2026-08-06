import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  BrainEntryType,
  ProjectType,
} from "@/lib/types/database";
import { type DiscoveryPair } from "@/lib/discovery-templates/snapshot";
import { getAggregatedDiscovery } from "@/lib/discovery-portal/aggregate-sessions";

export interface AggregatedMeeting {
  title: string | null;
  date: string;
  transcript: string | null;
}

export interface AggregatedBrainEntry {
  entryType: BrainEntryType;
  content: string;
  sourceLabel: string;
}

export interface AggregatedProjectData {
  projectName: string;
  projectType: ProjectType;
  leadSource: string | null;
  leadNotes: string | null;
  discoveryAnswers: Record<string, unknown>;
  /**
   * أزواج (label: value) المشتقّة من لقطة القالب الديناميكي، لو الفورم
   * اتعبّى بقالب Smart Discovery. فاضية للفورمات القديمة (fallback على
   * الأسئلة الثابتة في lib/discovery-form/questions.ts).
   */
  discoveryPairs: DiscoveryPair[];
  meetings: AggregatedMeeting[];
  brainEntries: AggregatedBrainEntry[];
}

export interface AggregationResult {
  hasEnoughData: boolean;
  data: AggregatedProjectData | null;
}

/**
 * Aggregation Engine — مسؤولية واحدة فقط: جمع بيانات المشروع من
 * المصادر الموجودة بالفعل (Lead, Discovery Form, Meetings/Transcripts,
 * Project Brain Entries) وترتيبها كبيانات خام. لا يعدّل أي مصدر، ولا
 * يحتوي على أي منطق واجهة أو استدعاء AI مباشر.
 */
export async function aggregateProjectData(
  supabase: SupabaseClient,
  projectId: string
): Promise<AggregationResult> {
  const { data: project } = await supabase
    .from("projects")
    .select("name, project_type, lead_id")
    .eq("id", projectId)
    .maybeSingle();

  if (!project) {
    return { hasEnoughData: false, data: null };
  }

  // Discovery Workspace: نقرأ **كل جلسات الاكتشاف** مجمّعة (مش الأخيرة بس)
  // — الأزواج مصدرها (الإدارة/الجلسة) محفوظ في الـ label للسياق.
  const [{ data: lead }, aggregatedDiscovery, { data: meetingsRaw }, { data: brainEntriesRaw }] =
    await Promise.all([
      project.lead_id
        ? supabase.from("leads").select("source, notes").eq("id", project.lead_id).maybeSingle()
        : Promise.resolve({ data: null }),
      getAggregatedDiscovery(supabase, projectId),
      supabase
        .from("meetings")
        .select("id, title, meeting_date, status, transcripts(raw_text)")
        .eq("project_id", projectId)
        .eq("status", "processed")
        .order("meeting_date", { ascending: true }),
      supabase
        .from("project_brain_entries")
        .select("entry_type, content, source_meeting_id, meetings(meeting_date)")
        .eq("project_id", projectId)
        .order("created_at", { ascending: true }),
    ]);

  const discoveryAnswers = aggregatedDiscovery.mergedAnswers;
  const discoveryPairs = aggregatedDiscovery.labeledPairs;
  const hasDiscoveryData = aggregatedDiscovery.hasData;

  const meetings: AggregatedMeeting[] = (meetingsRaw ?? []).map((m) => ({
    title: m.title,
    date: m.meeting_date,
    transcript: m.transcripts?.[0]?.raw_text ?? null,
  }));

  const brainEntries: AggregatedBrainEntry[] = (brainEntriesRaw ?? []).map((e) => {
    const meetingDate = e.meetings?.[0]?.meeting_date as string | undefined;
    const sourceLabel = meetingDate
      ? `اجتماع بتاريخ ${new Date(meetingDate).toLocaleDateString("ar-EG")}`
      : "مُدخل يدويًا في Project Brain";
    return { entryType: e.entry_type, content: e.content, sourceLabel };
  });

  const hasEnoughData =
    hasDiscoveryData || meetings.length > 0 || brainEntries.length > 0 || !!lead?.notes;

  if (!hasEnoughData) {
    return { hasEnoughData: false, data: null };
  }

  return {
    hasEnoughData: true,
    data: {
      projectName: project.name,
      projectType: project.project_type as ProjectType,
      leadSource: lead?.source ?? null,
      leadNotes: lead?.notes ?? null,
      discoveryAnswers,
      discoveryPairs,
      meetings,
      brainEntries,
    },
  };
}
