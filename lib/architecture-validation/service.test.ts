import { describe, it, expect, vi } from "vitest";

// Neutralise "server-only" + data-access deps so we can unit-test the pure mapping logic.
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => ({}) }));

import { buildArchitectureGapRecommendations } from "./service";

describe("buildArchitectureGapRecommendations", () => {
  it("maps missing modules, missing features, and semantic gaps to stable recommendation candidates", () => {
    const items = buildArchitectureGapRecommendations({
      missing_modules: [{ module_key: "crm", name: "إدارة العملاء", reason: "وحدة مطلوبة لمجال retail" }],
      missing_features: [{ module_key: "crm", feature: "تصدير جهات الاتصال" }],
      gaps: {
        permissions: ["صلاحية موافقة المدير"],
        reports: [],
      },
    });

    expect(items).toHaveLength(3);
    expect(items[0]).toMatchObject({
      sourceRef: "architecture_gap:module:crm",
      recommendation: "إضافة الوحدة المعمارية الناقصة: إدارة العملاء",
      rationale: "وحدة مطلوبة لمجال retail",
    });
    expect(items[1]).toMatchObject({
      sourceRef: "architecture_gap:feature:crm:تصدير_جهات_الاتصال",
      recommendation: "إضافة الميزة الناقصة: تصدير جهات الاتصال",
    });
    expect(items[2]).toMatchObject({
      sourceRef: "architecture_gap:permissions:صلاحية_موافقة_المدير",
      recommendation: "صلاحيات ناقصة: صلاحية موافقة المدير",
    });
  });

  it("falls back to a default rationale when a missing module has no reason", () => {
    const items = buildArchitectureGapRecommendations({
      missing_modules: [{ module_key: "billing", name: "الفوترة", reason: "" }],
      missing_features: [],
      gaps: {},
    });

    expect(items).toHaveLength(1);
    expect(items[0].rationale).toContain("billing");
  });

  it("produces identical source_ref values for the same gap across repeated calls (idempotency key stability)", () => {
    const report = {
      missing_modules: [{ module_key: "crm", name: "إدارة العملاء", reason: "" }],
      missing_features: [],
      gaps: {},
    };
    const first = buildArchitectureGapRecommendations(report);
    const second = buildArchitectureGapRecommendations(report);
    expect(first[0].sourceRef).toBe(second[0].sourceRef);
  });

  it("returns nothing for an empty report", () => {
    expect(buildArchitectureGapRecommendations({ missing_modules: [], missing_features: [], gaps: {} })).toHaveLength(0);
  });

  it("skips blank gap entries", () => {
    const items = buildArchitectureGapRecommendations({
      missing_modules: [],
      missing_features: [],
      gaps: { security: ["  ", "تشفير البيانات"] },
    });
    expect(items).toHaveLength(1);
    expect(items[0].recommendation).toBe("ميزات أمان ناقصة: تشفير البيانات");
  });
});
