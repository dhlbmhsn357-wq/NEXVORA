"use server";

import { revalidatePath } from "next/cache";
import { MeetingRetryService } from "@/lib/meetings/retry-service";

export async function retryMeeting(
  meetingId: string,
  projectId: string
): Promise<{ ok: boolean; message?: string }> {
  const result = await MeetingRetryService.retry(meetingId);
  revalidatePath(`/dashboard/projects/${projectId}`);
  return result;
}
