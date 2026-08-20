import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

describe("sector-standards/service — markProjectAsSectorStandard input validation", () => {
  it("يرفض اسم قطاع فاضي حتى لو رقم الإصدار موجود", async () => {
    vi.resetModules();
    vi.doMock("@/lib/supabase/service", () => ({ createServiceClient: () => ({ from: () => ({ update: () => ({ eq: async () => ({ error: null }) }) }) }) }));
    vi.doMock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
    const { markProjectAsSectorStandard } = await import("./service");
    await expect(markProjectAsSectorStandard("p1", "   ", "1.0")).rejects.toThrow(/القطاع/);
  });

  it("يرفض رقم إصدار فاضي حتى لو اسم القطاع موجود", async () => {
    vi.resetModules();
    vi.doMock("@/lib/supabase/service", () => ({ createServiceClient: () => ({ from: () => ({ update: () => ({ eq: async () => ({ error: null }) }) }) }) }));
    vi.doMock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
    const { markProjectAsSectorStandard } = await import("./service");
    await expect(markProjectAsSectorStandard("p1", "عيادات", "  ")).rejects.toThrow(/إصدار/);
  });

  it("ينجح ويستدعي update بالقيم بعد trim", async () => {
    vi.resetModules();
    const updateSpy = vi.fn(() => ({ eq: async () => ({ error: null }) }));
    vi.doMock("@/lib/supabase/service", () => ({ createServiceClient: () => ({ from: () => ({ update: updateSpy }) }) }));
    vi.doMock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
    const { markProjectAsSectorStandard } = await import("./service");
    await markProjectAsSectorStandard("p1", "  عيادات  ", "  1.3  ");
    expect(updateSpy).toHaveBeenCalledWith({
      is_sector_standard: true,
      sector_name: "عيادات",
      standard_version: "1.3",
    });
  });
});
