"use server";

import { createClient } from "@/lib/supabase/server";
import { getMeetingReportData, type MeetingReportData } from "@/lib/meetings/report-service";
import type { ProjectBrainEntry, Transcript } from "@/lib/types/database";

export async function getMeetingDetail(meetingId: string): Promise<{
  transcript: Transcript | null;
  entries: ProjectBrainEntry[];
  report: MeetingReportData;
}> {
  const supabase = await createClient();

  const [{ data: transcript }, { data: entries }, report] = await Promise.all([
    supabase.from("transcripts").select("*").eq("meeting_id", meetingId).maybeSingle(),
    supabase
      .from("project_brain_entries")
      .select("*")
      .eq("source_meeting_id", meetingId)
      .order("created_at", { ascending: true }),
    getMeetingReportData(supabase, meetingId),
  ]);

  return { transcript, entries: entries ?? [], report };
}
