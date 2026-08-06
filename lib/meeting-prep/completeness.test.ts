import { describe, expect, it } from "vitest";
import { checkPreparationCompleteness } from "./completeness";
import type { MeetingPreparationRow } from "./types";
import type { MeetingPrepParticipant, MeetingRequiredItem } from "@/lib/types/database";

function prep(overrides: Partial<MeetingPreparationRow> = {}): MeetingPreparationRow {
  return {
    id: "p1",
    project_id: "proj1",
    based_on_analysis_id: null,
    based_on_brain_document_id: null,
    sections: {},
    overall_confidence: 80,
    status: "ready",
    version: 1,
    title: "اجتماع تجريبي",
    expected_outcomes: [],
    previous_meeting_id: null,
    linked_open_question_ids: [],
    linked_risk_ids: [],
    linked_pending_decision_ids: [],
    created_by: null,
    created_at: "2026-01-01",
    updated_at: "2026-01-01",
    ...overrides,
  };
}

function participant(overrides: Partial<MeetingPrepParticipant> = {}): MeetingPrepParticipant {
  return { id: "pt1", meeting_preparation_id: "p1", project_id: "proj1", full_name: "أحمد", role: "PM", is_client: false, is_required: true, created_at: "x", ...overrides };
}

function requiredItem(overrides: Partial<MeetingRequiredItem> = {}): MeetingRequiredItem {
  return { id: "r1", meeting_preparation_id: "p1", project_id: "proj1", item_type: "document", title: "عقد", description: "", is_provided: false, provided_attachment_id: null, created_at: "x", ...overrides };
}

describe("checkPreparationCompleteness", () => {
  it("مفيش تجهيز خالص → غير مكتمل", () => {
    const result = checkPreparationCompleteness(null, [], []);
    expect(result.complete).toBe(false);
  });

  it("عنوان + مشارك إلزامي + كل العناصر متوفرة → مكتمل", () => {
    const result = checkPreparationCompleteness(prep(), [participant()], [requiredItem({ is_provided: true })]);
    expect(result.complete).toBe(true);
    expect(result.missingReasons).toEqual([]);
  });

  it("عنوان فاضي → غير مكتمل مع سبب واضح", () => {
    const result = checkPreparationCompleteness(prep({ title: null }), [participant()], []);
    expect(result.complete).toBe(false);
    expect(result.missingReasons.some((r) => r.includes("عنوان"))).toBe(true);
  });

  it("مفيش مشاركين خالص → غير مكتمل", () => {
    const result = checkPreparationCompleteness(prep(), [], []);
    expect(result.complete).toBe(false);
  });

  it("فيه مشاركين بس ولا واحد إلزامي → غير مكتمل", () => {
    const result = checkPreparationCompleteness(prep(), [participant({ is_required: false })], []);
    expect(result.complete).toBe(false);
  });

  it("عنصر مطلوب لسه ما اتوفّرش → غير مكتمل", () => {
    const result = checkPreparationCompleteness(prep(), [participant()], [requiredItem({ is_provided: false })]);
    expect(result.complete).toBe(false);
    expect(result.missingReasons.some((r) => r.includes("عقد"))).toBe(true);
  });
});
