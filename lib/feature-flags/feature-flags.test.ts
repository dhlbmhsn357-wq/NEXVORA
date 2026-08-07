import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  isFeatureEnabled,
  invalidateFeatureFlagsCache,
  KNOWN_FLAGS,
} from "./index";

// نموذج بسيط لعميل Supabase — بيرجع rows اللي نحطهم في setupMock.
function mockClient(rows: Array<Record<string, unknown>>) {
  const from = vi.fn().mockReturnValue({
    select: vi.fn().mockResolvedValue({ data: rows, error: null }),
  });
  return { from } as unknown as import("@supabase/supabase-js").SupabaseClient;
}

const USER_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const USER_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

describe("feature-flags", () => {
  beforeEach(() => {
    invalidateFeatureFlagsCache();
  });

  it("KNOWN_FLAGS يحتوي على flags P1 الأساسية", () => {
    expect(KNOWN_FLAGS).toContain("product_mode");
    expect(KNOWN_FLAGS).toContain("extended_technical_delivery");
  });

  it("flag غير موجود = disabled (fail-safe)", async () => {
    const client = mockClient([]);
    const result = await isFeatureEnabled("nonexistent_flag", USER_A, client);
    expect(result).toBe(false);
  });

  it("enabled_globally=true بدون override → مفعّل للجميع", async () => {
    const client = mockClient([
      {
        name: "product_mode",
        description: "",
        enabled_globally: true,
        enabled_per_user: [],
        updated_at: "2026-01-01",
        updated_by: null,
      },
    ]);
    expect(await isFeatureEnabled("product_mode", USER_A, client)).toBe(true);
    expect(await isFeatureEnabled("product_mode", null, client)).toBe(true);
  });

  it("enabled_globally=false بدون override → معطّل للجميع", async () => {
    const client = mockClient([
      {
        name: "extended_technical_delivery",
        description: "",
        enabled_globally: false,
        enabled_per_user: [],
        updated_at: "2026-01-01",
        updated_by: null,
      },
    ]);
    expect(await isFeatureEnabled("extended_technical_delivery", USER_A, client)).toBe(false);
  });

  it("enabled_per_user يعكس السلوك عن enabled_globally (Beta test)", async () => {
    const client = mockClient([
      {
        name: "extended_technical_delivery",
        description: "",
        enabled_globally: false,
        enabled_per_user: [USER_A],
        updated_at: "2026-01-01",
        updated_by: null,
      },
    ]);
    // USER_A في override → مفعّل عنده
    expect(await isFeatureEnabled("extended_technical_delivery", USER_A, client)).toBe(true);
    // USER_B ليس في override → معطّل
    expect(await isFeatureEnabled("extended_technical_delivery", USER_B, client)).toBe(false);
  });

  it("enabled_per_user يعكس السلوك حتى لو enabled_globally=true (disable لمستخدم)", async () => {
    const client = mockClient([
      {
        name: "product_mode",
        description: "",
        enabled_globally: true,
        enabled_per_user: [USER_A],
        updated_at: "2026-01-01",
        updated_by: null,
      },
    ]);
    // USER_A في override → معطّل عنده
    expect(await isFeatureEnabled("product_mode", USER_A, client)).toBe(false);
    // USER_B ليس في override → مفعّل
    expect(await isFeatureEnabled("product_mode", USER_B, client)).toBe(true);
  });
});
