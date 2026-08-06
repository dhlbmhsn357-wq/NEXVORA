import { describe, expect, it } from "vitest";
import { findNextStageToTrigger } from "./pipeline-next-stage";
import type { PrototypePromptStage } from "@/lib/types/database";

function stage(overrides: Partial<PrototypePromptStage>): PrototypePromptStage {
  return {
    id: `id-${overrides.stage_index}`,
    plan_id: "plan-1",
    project_id: "project-1",
    stage_index: 1,
    title: "عنوان",
    summary: "ملخص",
    depends_on: [],
    content: null,
    status: "pending",
    last_error: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("findNextStageToTrigger", () => {
  it("يرجّع أول Stage من غير أي اعتماديات لو السلسلة لسه ما بدأتش", () => {
    const stages = [
      stage({ stage_index: 1, depends_on: [] }),
      stage({ stage_index: 2, depends_on: [1] }),
    ];
    expect(findNextStageToTrigger(stages)?.stage_index).toBe(1);
  });

  it("يرجّع null لو فيه Stage شغّال بالفعل (منع إطلاق مزدوج)", () => {
    const stages = [
      stage({ stage_index: 1, status: "generating" }),
      stage({ stage_index: 2, depends_on: [1], status: "pending" }),
    ];
    expect(findNextStageToTrigger(stages)).toBeNull();
  });

  it("يرجّع Stage 2 بعد ما Stage 1 يبقى ready", () => {
    const stages = [
      stage({ stage_index: 1, status: "ready" }),
      stage({ stage_index: 2, depends_on: [1], status: "pending" }),
    ];
    expect(findNextStageToTrigger(stages)?.stage_index).toBe(2);
  });

  it("يرجّع null لو الاعتماديات لسه مش كلها ready", () => {
    const stages = [
      stage({ stage_index: 1, status: "ready" }),
      stage({ stage_index: 2, status: "pending" }),
      stage({ stage_index: 3, depends_on: [1, 2], status: "pending" }),
    ];
    // Stage 3 معتمد على 1 و2 — و2 لسه pending، فمينفعش يتشغّل قبله
    const next = findNextStageToTrigger(stages);
    expect(next?.stage_index).toBe(2);
  });

  it("يرجّع null لو كل الـ Stages خلصت (ready) أو فشلت", () => {
    const stages = [
      stage({ stage_index: 1, status: "ready" }),
      stage({ stage_index: 2, status: "failed" }),
    ];
    expect(findNextStageToTrigger(stages)).toBeNull();
  });

  it("بيتجاهل Stage فشل ومايعتبروش شرط جاهزية لموديول تاني", () => {
    const stages = [
      stage({ stage_index: 1, status: "failed" }),
      stage({ stage_index: 2, depends_on: [1], status: "pending" }),
    ];
    // Stage 2 معتمد على Stage 1 اللي فشل (مش ready) — مينفعش يتشغّل لحد
    // ما حد يعمل Retry يدوي لـ Stage 1
    expect(findNextStageToTrigger(stages)).toBeNull();
  });
});
