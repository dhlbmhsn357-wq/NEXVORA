import { describe, expect, it, vi, beforeEach } from "vitest";

// vi.hoisted بيضمن إن القيم دي جاهزة قبل ما أي vi.mock() factory (اللي
// بتتحمّل فوق الـ imports كلها) يحاول يستخدمها — تجنّبًا لمشكلة
// "Cannot access before initialization" الكلاسيكية مع vi.mock.
const { afterCallbacks, tableRows, mockSupabase } = vi.hoisted(() => {
  const afterCallbacks: Array<() => Promise<void>> = [];
  const tableRows: Record<string, Record<string, unknown> | null> = {
    prd: null,
    prototype_prompt: null,
    client_presentations: null,
    developer_handoff: null,
    projects: { name: "مشروع تجريبي" },
  };
  const mockSupabase = {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: tableRows[table] ?? null }),
        }),
      }),
    }),
  };
  return { afterCallbacks, tableRows, mockSupabase };
});

vi.mock("next/server", () => ({
  after: vi.fn((cb: () => Promise<void>) => {
    afterCallbacks.push(cb);
  }),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => mockSupabase),
}));

vi.mock("@/lib/brain-v2/review-service", () => ({
  getBrainSettings: vi.fn(),
}));

vi.mock("@/lib/prd/generation-service", () => ({
  PRDGenerationEngine: {
    tryClaimLock: vi.fn(async () => true),
    runFullGenerationCore: vi.fn(async () => {}),
  },
}));

vi.mock("@/lib/prototype-prompt/generation-service", () => ({
  PrototypePromptGenerationEngine: {
    tryClaimLock: vi.fn(async () => true),
    runFullGenerationCore: vi.fn(async () => {}),
  },
}));

vi.mock("@/lib/presentation/generation-service", () => ({
  ClientPresentationGenerationEngine: {
    tryClaimLock: vi.fn(async () => true),
    runFullGenerationCore: vi.fn(async () => {}),
  },
}));

vi.mock("@/lib/developer-handoff/generation-service", () => ({
  DeveloperHandoffGenerationEngine: {
    precheck: vi.fn(async () => ({ ok: true })),
    tryClaimLock: vi.fn(async () => true),
    runFullGenerationCore: vi.fn(async () => {}),
  },
}));

import { notifyBrainChanged } from "./resync-engine";
import { getBrainSettings } from "@/lib/brain-v2/review-service";
import { PRDGenerationEngine } from "@/lib/prd/generation-service";
import { PrototypePromptGenerationEngine } from "@/lib/prototype-prompt/generation-service";
import { ClientPresentationGenerationEngine } from "@/lib/presentation/generation-service";
import { DeveloperHandoffGenerationEngine } from "@/lib/developer-handoff/generation-service";

function baseSettings(overrides: Partial<{ auto_resync_downstream: boolean }> = {}) {
  return {
    scope: "global" as const,
    confidence_threshold_percent: 70,
    auto_resync_downstream: false,
    updated_at: new Date(0).toISOString(),
    updated_by: null,
    ...overrides,
  };
}

describe("notifyBrainChanged", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    afterCallbacks.length = 0;
    tableRows.prd = null;
    tableRows.prototype_prompt = null;
    tableRows.client_presentations = null;
    tableRows.developer_handoff = null;
    tableRows.projects = { name: "مشروع تجريبي" };
    vi.mocked(DeveloperHandoffGenerationEngine.precheck).mockResolvedValue({ ok: true });
    vi.mocked(DeveloperHandoffGenerationEngine.tryClaimLock).mockResolvedValue(true);
    vi.mocked(PRDGenerationEngine.tryClaimLock).mockResolvedValue(true);
    vi.mocked(PrototypePromptGenerationEngine.tryClaimLock).mockResolvedValue(true);
    vi.mocked(ClientPresentationGenerationEngine.tryClaimLock).mockResolvedValue(true);
  });

  it("متعملش حاجة خالص لو المزامنة التلقائية معطّلة (الإعداد الافتراضي)", async () => {
    vi.mocked(getBrainSettings).mockResolvedValue(baseSettings({ auto_resync_downstream: false }));
    tableRows.prd = { version: 3, sync_status: "idle" };

    const outcome = await notifyBrainChanged("p1", "actor1");

    expect(outcome.triggered).toEqual([]);
    expect(outcome.skipped.every((s) => s.reason.includes("معطّلة"))).toBe(true);
    expect(PRDGenerationEngine.tryClaimLock).not.toHaveBeenCalled();
  });

  it("يتجاهل مشتق لسه ما اتولّدش أبدًا (version = 0) حتى لو المزامنة مفعّلة", async () => {
    vi.mocked(getBrainSettings).mockResolvedValue(baseSettings({ auto_resync_downstream: true }));
    tableRows.prd = { version: 0, sync_status: "idle" };

    const outcome = await notifyBrainChanged("p1", "actor1");

    expect(outcome.triggered).not.toContain("prd");
    expect(PRDGenerationEngine.tryClaimLock).not.toHaveBeenCalled();
    const prdSkip = outcome.skipped.find((s) => s.artifact === "prd");
    expect(prdSkip?.reason).toContain("مالوش محتوى");
  });

  it("يشغّل إعادة توليد PRD في الخلفية لو عنده محتوى، مفيش توليد شغّال، والمزامنة مفعّلة", async () => {
    vi.mocked(getBrainSettings).mockResolvedValue(baseSettings({ auto_resync_downstream: true }));
    tableRows.prd = { version: 2, sync_status: "idle" };

    const outcome = await notifyBrainChanged("p1", "actor1");

    expect(outcome.triggered).toContain("prd");
    expect(PRDGenerationEngine.tryClaimLock).toHaveBeenCalledWith("p1");

    for (const cb of afterCallbacks) await cb();
    expect(PRDGenerationEngine.runFullGenerationCore).toHaveBeenCalledWith("p1", "auto_resync", "actor1");
  });

  it("يتجاهل PRD لو توليد شغّال عليه بالفعل — من غير ما يحاول يحجز Lock", async () => {
    vi.mocked(getBrainSettings).mockResolvedValue(baseSettings({ auto_resync_downstream: true }));
    tableRows.prd = { version: 2, sync_status: "generating" };

    const outcome = await notifyBrainChanged("p1", "actor1");

    expect(outcome.triggered).not.toContain("prd");
    expect(PRDGenerationEngine.tryClaimLock).not.toHaveBeenCalled();
    const prdSkip = outcome.skipped.find((s) => s.artifact === "prd");
    expect(prdSkip?.reason).toContain("شغّال بالفعل");
  });

  it("يشغّل Prototype Prompt بنفس target_tool المحفوظ", async () => {
    vi.mocked(getBrainSettings).mockResolvedValue(baseSettings({ auto_resync_downstream: true }));
    tableRows.prototype_prompt = { version: 1, sync_status: "idle", target_tool: "v0" };

    const outcome = await notifyBrainChanged("p1", "actor1");
    expect(outcome.triggered).toContain("prototype_prompt");

    for (const cb of afterCallbacks) await cb();
    expect(PrototypePromptGenerationEngine.runFullGenerationCore).toHaveBeenCalledWith(
      "p1",
      "v0",
      "auto_resync",
      "actor1"
    );
  });

  it("يشغّل Client Presentation باسم المشروع الفعلي", async () => {
    vi.mocked(getBrainSettings).mockResolvedValue(baseSettings({ auto_resync_downstream: true }));
    tableRows.client_presentations = { version: 1, status: "idle" };
    tableRows.projects = { name: "M2 Platform" };

    const outcome = await notifyBrainChanged("p1", "actor1");
    expect(outcome.triggered).toContain("client_presentation");

    for (const cb of afterCallbacks) await cb();
    expect(ClientPresentationGenerationEngine.runFullGenerationCore).toHaveBeenCalledWith(
      "p1",
      "M2 Platform",
      "actor1",
      "auto_resync"
    );
  });

  it("يتجاهل Developer Handoff بهدوء لو الـ precheck فشل (مفيش Review معتمد)", async () => {
    vi.mocked(getBrainSettings).mockResolvedValue(baseSettings({ auto_resync_downstream: true }));
    tableRows.developer_handoff = { version: 1, sync_status: "idle" };
    vi.mocked(DeveloperHandoffGenerationEngine.precheck).mockResolvedValue({
      ok: false,
      result: { status: "no_review", message: "لازم Review معتمد أولاً." },
    });

    const outcome = await notifyBrainChanged("p1", "actor1");

    expect(outcome.triggered).not.toContain("developer_handoff");
    expect(DeveloperHandoffGenerationEngine.tryClaimLock).not.toHaveBeenCalled();
    const skip = outcome.skipped.find((s) => s.artifact === "developer_handoff");
    expect(skip?.reason).toContain("Review معتمد");
  });

  it("يشغّل الأربعة مشتقات مع بعض لو كلهم عندهم محتوى ومفيش توليد شغّال", async () => {
    vi.mocked(getBrainSettings).mockResolvedValue(baseSettings({ auto_resync_downstream: true }));
    tableRows.prd = { version: 2, sync_status: "idle" };
    tableRows.prototype_prompt = { version: 1, sync_status: "idle", target_tool: "general" };
    tableRows.client_presentations = { version: 1, status: "idle" };
    tableRows.developer_handoff = { version: 1, sync_status: "idle" };

    const outcome = await notifyBrainChanged("p1", "actor1");

    expect(outcome.triggered.sort()).toEqual(
      ["client_presentation", "developer_handoff", "prd", "prototype_prompt"].sort()
    );
    expect(outcome.skipped).toEqual([]);
  });
});
