import { describe, expect, it } from "vitest";
import { getLegalTransitions, isValidTransition } from "./state-machine";

describe("isValidTransition", () => {
  it("نفس الحالة دايمًا شرعية (No-op)", () => {
    expect(isValidTransition("completed", "completed")).toBe(true);
  });

  it("not_started → in_progress شرعي", () => {
    expect(isValidTransition("not_started", "in_progress")).toBe(true);
  });

  it("not_started → approved غير شرعي (لازم يعدّي بمراحل وسط)", () => {
    expect(isValidTransition("not_started", "approved")).toBe(false);
  });

  it("waiting_review → approved/rejected شرعي", () => {
    expect(isValidTransition("waiting_review", "approved")).toBe(true);
    expect(isValidTransition("waiting_review", "rejected")).toBe(true);
  });

  it("archived حالة نهائية — مفيش أي انتقال شرعي منها", () => {
    expect(getLegalTransitions("archived")).toEqual([]);
    expect(isValidTransition("archived", "in_progress")).toBe(false);
  });

  it("rejected ممكن يترجع in_progress (إعادة محاولة)", () => {
    expect(isValidTransition("rejected", "in_progress")).toBe(true);
  });
});
