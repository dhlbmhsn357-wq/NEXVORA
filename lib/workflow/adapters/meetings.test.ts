import { describe, expect, it } from "vitest";
import { adaptMeetingPreparationStage, adaptMeetingPresentationStage, adaptMeetingsStage } from "./meetings";

describe("adaptMeetingPreparationStage", () => {
  it("مفيش تجهيز خالص → not_started", () => {
    expect(adaptMeetingPreparationStage(null).status).toBe("not_started");
  });
  it("version > 0 → completed", () => {
    expect(adaptMeetingPreparationStage({ status: "ready", version: 1, updated_at: "x" }).status).toBe("completed");
  });
});

describe("adaptMeetingPresentationStage", () => {
  it("status=failed → in_progress مع last_error", () => {
    const s = adaptMeetingPresentationStage({ status: "failed", version: 0, last_error: "خطأ ما", updated_at: "x" });
    expect(s.status).toBe("in_progress");
    expect(s.lastError).toBe("خطأ ما");
  });
});

describe("adaptMeetingsStage", () => {
  it("صفر اجتماعات → not_started", () => {
    expect(adaptMeetingsStage(0).status).toBe("not_started");
  });
  it("فيه اجتماع واحد على الأقل → completed", () => {
    expect(adaptMeetingsStage(1).status).toBe("completed");
  });
});
