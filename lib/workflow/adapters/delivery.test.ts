import { describe, expect, it } from "vitest";
import { adaptDeveloperHandoffStage, adaptPrdStage, adaptPromptReviewStage, adaptPrototypePromptStage } from "./delivery";

const base = { last_error: null, updated_at: "2026-01-01" };

describe("adaptPrdStage", () => {
  it("مفيش PRD خالص → not_started", () => {
    expect(adaptPrdStage(null, 3).status).toBe("not_started");
  });

  it("sync_status=generating → waiting_ai", () => {
    expect(adaptPrdStage({ ...base, sync_status: "generating", version: 1, generated_from_brain_version: 1 }, 1).status).toBe("waiting_ai");
  });

  it("Brain اتحدّث بعد توليد الـ PRD → isStale=true", () => {
    const s = adaptPrdStage({ ...base, sync_status: "idle", version: 2, generated_from_brain_version: 1 }, 3);
    expect(s.versionInfo.isStale).toBe(true);
  });

  it("Brain متوافق مع نسخة التوليد → isStale=false", () => {
    const s = adaptPrdStage({ ...base, sync_status: "idle", version: 2, generated_from_brain_version: 3 }, 3);
    expect(s.versionInfo.isStale).toBe(false);
  });
});

describe("adaptPrototypePromptStage", () => {
  it("PRD اتحدّث بعد آخر توليد → isStale=true", () => {
    const s = adaptPrototypePromptStage({ ...base, sync_status: "idle", version: 4, generated_from_prd_version: 2 }, 5);
    expect(s.versionInfo.isStale).toBe(true);
  });
});

describe("adaptPromptReviewStage", () => {
  it("مفيش خطة تنفيذ خالص → not_started", () => {
    expect(adaptPromptReviewStage(null, 3).status).toBe("not_started");
  });

  it("Prototype Prompt اتحدّث بعد الخطة الحالية → isStale=true", () => {
    const s = adaptPromptReviewStage(
      { status: "ready", prototype_prompt_version: 2, total_tasks: 5, completed_tasks: 0, failed_tasks: 0, last_error: null, updated_at: "2026-01-01" },
      3
    );
    expect(s.versionInfo.isStale).toBe(true);
  });

  it("نسبة الإكمال = completed_tasks/total_tasks", () => {
    const s = adaptPromptReviewStage(
      {
        status: "executing",
        prototype_prompt_version: 3,
        total_tasks: 4,
        completed_tasks: 2,
        failed_tasks: 0,
        last_error: null,
        updated_at: "2026-01-01",
      },
      3
    );
    expect(s.completionPct).toBe(50);
  });

  it("status=completed → status=completed", () => {
    const s = adaptPromptReviewStage(
      { status: "completed", prototype_prompt_version: 3, total_tasks: 2, completed_tasks: 2, failed_tasks: 0, last_error: null, updated_at: "x" },
      3
    );
    expect(s.status).toBe("completed");
  });
});

describe("adaptDeveloperHandoffStage", () => {
  it("مفيش Handoff خالص → not_started", () => {
    expect(adaptDeveloperHandoffStage(null, 1, 1).status).toBe("not_started");
  });

  it("Prototype Review اتحدّث بعد آخر توليد Handoff → isStale=true", () => {
    const s = adaptDeveloperHandoffStage(
      { ...base, sync_status: "idle", version: 1, generated_from_prd_version: 3, generated_from_review_version: 1 },
      3,
      2
    );
    expect(s.versionInfo.isStale).toBe(true);
  });
});
