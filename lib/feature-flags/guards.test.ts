import { describe, expect, it, vi, beforeEach } from "vitest";

// نموذج لعميل Supabase — يرجّع user ثابت وحالة flag من setup.
type FlagRow = {
  name: string;
  description: string;
  enabled_globally: boolean;
  enabled_per_user: string[];
  updated_at: string;
  updated_by: string | null;
};

let currentUser: { id: string } | null = { id: "user-1" };
let currentFlagRow: FlagRow | null = null;

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: currentUser } }),
    },
  })),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => ({
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockResolvedValue({
        data: currentFlagRow ? [currentFlagRow] : [],
        error: null,
      }),
    }),
  })),
}));

import { requireExtendedTechnical, EXTENDED_DISABLED_MESSAGE } from "./guards";
import { invalidateFeatureFlagsCache } from "./index";
import {
  EXTENDED_TAB_KEYS,
  isExtendedTechnicalTabKey,
  NEXVORA_TAB_PHASES,
} from "../../app/(platform)/dashboard/projects/[id]/nexvora-tab-order";

function setFlag(enabled: boolean): void {
  currentFlagRow = {
    name: "extended_technical_delivery",
    description: "",
    enabled_globally: enabled,
    enabled_per_user: [],
    updated_at: "2026-01-01",
    updated_by: null,
  };
}

describe("nexvora-tab-order — Extended tab helpers", () => {
  it("isExtendedTechnicalTabKey('engineeringQa') === true", () => {
    expect(isExtendedTechnicalTabKey("engineeringQa")).toBe(true);
  });

  it("isExtendedTechnicalTabKey('overview') === false", () => {
    expect(isExtendedTechnicalTabKey("overview")).toBe(false);
  });

  it("EXTENDED_TAB_KEYS يحتوي على كل tabs الـ execution phase (المصدر الواحد للحقيقة)", () => {
    const executionPhase = NEXVORA_TAB_PHASES.find((p) => p.key === "execution");
    expect(executionPhase).toBeDefined();
    const expected = new Set(executionPhase!.tabs.map((t) => t.key));
    // كل تبويبة execution لازم تكون في EXTENDED_TAB_KEYS
    for (const key of expected) {
      expect(EXTENDED_TAB_KEYS.has(key)).toBe(true);
    }
    // والعكس: EXTENDED_TAB_KEYS ما يحتويش على أي تبويبة من phase تانية
    for (const key of EXTENDED_TAB_KEYS) {
      expect(expected.has(key)).toBe(true);
    }
  });

  it("EXTENDED_TAB_KEYS ما يحتويش على تبويبات essential زي overview/prd", () => {
    expect(EXTENDED_TAB_KEYS.has("overview")).toBe(false);
    expect(EXTENDED_TAB_KEYS.has("prd")).toBe(false);
    expect(EXTENDED_TAB_KEYS.has("discovery")).toBe(false);
  });
});

describe("requireExtendedTechnical", () => {
  beforeEach(() => {
    invalidateFeatureFlagsCache();
    currentUser = { id: "user-1" };
  });

  it("يرمي خطأ لما الفلاغ off", async () => {
    setFlag(false);
    await expect(requireExtendedTechnical()).rejects.toThrow(EXTENDED_DISABLED_MESSAGE);
  });

  it("يمر بدون خطأ لما الفلاغ on", async () => {
    setFlag(true);
    await expect(requireExtendedTechnical()).resolves.toBeUndefined();
  });

  it("يرمي خطأ لما المستخدم غير مصادَق عليه", async () => {
    setFlag(true);
    currentUser = null;
    await expect(requireExtendedTechnical()).rejects.toThrow("غير مصادَق عليه");
  });
});
