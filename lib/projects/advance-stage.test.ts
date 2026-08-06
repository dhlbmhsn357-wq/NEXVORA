import { describe, expect, it, vi } from "vitest";
import { advanceProjectStage } from "./advance-stage";

function mockSupabase(currentStage: string) {
  const updated: { stage?: string } = {};
  const supabase = {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({ data: { stage: currentStage } })),
        })),
      })),
      update: vi.fn((patch: { stage: string }) => {
        updated.stage = patch.stage;
        return { eq: vi.fn(async () => ({ data: null, error: null })) };
      }),
    })),
  };
  return { supabase, updated };
}

describe("advanceProjectStage", () => {
  it("يقدّم المرحلة لو الحالية أبكر في التسلسل", async () => {
    const { supabase, updated } = mockSupabase("lead");
    await advanceProjectStage(supabase as never, "p1", "discovery_meeting");
    expect(updated.stage).toBe("discovery_meeting");
  });

  it("ما يرجّعش المرحلة للخلف لو المشروع أبعد بالفعل", async () => {
    const { supabase, updated } = mockSupabase("build");
    await advanceProjectStage(supabase as never, "p1", "discovery_meeting");
    expect(updated.stage).toBeUndefined();
  });

  it("ما يعملش تحديث لو نفس المرحلة بالظبط", async () => {
    const { supabase, updated } = mockSupabase("discovery_meeting");
    await advanceProjectStage(supabase as never, "p1", "discovery_meeting");
    expect(updated.stage).toBeUndefined();
  });

  it("يتجاهل target غير معروف", async () => {
    const { supabase, updated } = mockSupabase("lead");
    await advanceProjectStage(supabase as never, "p1", "not_a_real_stage");
    expect(updated.stage).toBeUndefined();
  });

  it("يتجاهل مرحلة حالية حرة (custom) بأمان (index=-1) ويقدّم", async () => {
    const { supabase, updated } = mockSupabase("some_custom_stage");
    await advanceProjectStage(supabase as never, "p1", "discovery_meeting");
    expect(updated.stage).toBe("discovery_meeting");
  });
});
