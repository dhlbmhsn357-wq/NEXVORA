import type { StageState } from "../types";
import { makeState } from "./helpers";

interface MeetingPrepLike {
  status: string;
  version: number;
  updated_at: string;
}

export function adaptMeetingPreparationStage(prep: MeetingPrepLike | null): StageState {
  if (!prep) return makeState("meetingPreparation", "not_started", 0);
  if (prep.status === "ready" || prep.version > 0) {
    return makeState("meetingPreparation", "completed", 100, { updatedAt: prep.updated_at });
  }
  if (prep.status === "failed") {
    return makeState("meetingPreparation", "in_progress", 30, { updatedAt: prep.updated_at });
  }
  return makeState("meetingPreparation", "waiting_ai", 50, { updatedAt: prep.updated_at });
}

interface MeetingPresentationLike {
  status: string;
  version: number;
  last_error: string | null;
  updated_at: string;
}

export function adaptMeetingPresentationStage(draft: MeetingPresentationLike | null): StageState {
  if (!draft) return makeState("meetingPresentation", "not_started", 0);
  if (draft.status === "ready" && draft.version > 0) {
    return makeState("meetingPresentation", "completed", 100, { updatedAt: draft.updated_at });
  }
  if (draft.status === "failed") {
    return makeState("meetingPresentation", "in_progress", 30, { lastError: draft.last_error, updatedAt: draft.updated_at });
  }
  return makeState("meetingPresentation", "waiting_ai", 50, { updatedAt: draft.updated_at });
}

export function adaptMeetingsStage(meetingsCount: number): StageState {
  if (meetingsCount === 0) return makeState("meetings", "not_started", 0);
  return makeState("meetings", "completed", 100);
}
