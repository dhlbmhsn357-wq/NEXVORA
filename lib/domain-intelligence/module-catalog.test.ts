import { describe, it, expect } from "vitest";
import {
  MODULE_CATALOG,
  DOMAIN_MODULE_MAP,
  getRequiredModules,
  detectModule,
  analyzeArchitecture,
} from "./module-catalog";
import { parseArchitectureValidation } from "@/lib/architecture-validation/prompt";

describe("module catalog", () => {
  it("ERP requires Accounting (cross-module dependency)", () => {
    expect(DOMAIN_MODULE_MAP.erp).toContain("accounting");
    const keys = getRequiredModules("erp").map((m) => m.key);
    expect(keys).toContain("accounting");
    expect(keys).toContain("inventory");
  });

  it("Accounting module carries the deep sub-features (Chart of Accounts, GL, Trial Balance...)", () => {
    const acc = MODULE_CATALOG.accounting;
    expect(acc.features).toEqual(
      expect.arrayContaining(["Chart of Accounts", "General Ledger", "Trial Balance", "Profit & Loss", "Balance Sheet"])
    );
  });

  it("falls back to generic modules for unknown/generic domain", () => {
    expect(getRequiredModules("generic").map((m) => m.key)).toEqual(DOMAIN_MODULE_MAP.generic);
  });
});

describe("detectModule", () => {
  it("marks a module present when a sub-feature title appears", () => {
    const res = detectModule(MODULE_CATALOG.accounting, ["نظام Chart of Accounts للعميل", "تقرير General Ledger"]);
    expect(res.present).toBe(true);
    expect(res.detectedFeatures).toEqual(expect.arrayContaining(["Chart of Accounts", "General Ledger"]));
    expect(res.missingFeatures).toContain("Trial Balance");
  });

  it("marks a module absent when nothing matches", () => {
    const res = detectModule(MODULE_CATALOG.accounting, ["لوحة عرض المنتجات"]);
    expect(res.present).toBe(false);
    expect(res.detectedFeatures).toHaveLength(0);
  });
});

describe("analyzeArchitecture (cross-module, deterministic)", () => {
  it("flags missing required modules for an ERP with only accounting present", () => {
    const titles = ["Chart of Accounts", "General Ledger", "Journal Entries"];
    const a = analyzeArchitecture("erp", titles);
    const presentKeys = a.presentModules.map((m) => m.key);
    const missingKeys = a.missingModules.map((m) => m.module_key);
    expect(presentKeys).toContain("accounting");
    expect(missingKeys).toContain("inventory");
    expect(missingKeys).toContain("sales");
    expect(a.readinessScore).toBeGreaterThanOrEqual(0);
    expect(a.readinessScore).toBeLessThan(100);
  });

  it("detects missing sub-features inside a present module", () => {
    const a = analyzeArchitecture("accounting", ["Chart of Accounts"]);
    const accMissing = a.missingFeatures.filter((f) => f.module_key === "accounting").map((f) => f.feature);
    expect(accMissing).toContain("General Ledger");
    expect(accMissing).toContain("Trial Balance");
  });

  it("empty knowledge → no present modules, all required missing", () => {
    const a = analyzeArchitecture("crm", []);
    expect(a.presentModules).toHaveLength(0);
    expect(a.missingModules.length).toBe(DOMAIN_MODULE_MAP.crm.length);
  });
});

describe("parseArchitectureValidation", () => {
  it("extracts gap categories and summary from AI JSON", () => {
    const out = `حاضر: {"roles":["مدير مالي"],"integrations":["بوابة دفع"],"reports":[],"executive_summary":"جاهزية جيدة"}`;
    const { gaps, summary } = parseArchitectureValidation(out);
    expect(gaps.roles).toEqual(["مدير مالي"]);
    expect(gaps.integrations).toEqual(["بوابة دفع"]);
    expect(gaps.reports).toBeUndefined(); // empty arrays dropped
    expect(summary).toBe("جاهزية جيدة");
  });

  it("returns empty on non-JSON", () => {
    expect(parseArchitectureValidation("no json here")).toEqual({ gaps: {}, summary: "" });
    expect(parseArchitectureValidation(null)).toEqual({ gaps: {}, summary: "" });
  });
});
