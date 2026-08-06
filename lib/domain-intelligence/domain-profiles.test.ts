import { describe, expect, it } from "vitest";
import { detectDomainGaps, DOMAIN_PROFILES } from "./domain-profiles";

describe("detectDomainGaps", () => {
  it("مجال generic مالوش عناصر متوقّعة → مفيش فجوات أبدًا", () => {
    expect(detectDomainGaps("generic", [])).toEqual([]);
  });

  it("ERP بمشروع فاضي تمامًا → كل العناصر الـ20 فجوة", () => {
    const gaps = detectDomainGaps("erp", []);
    expect(gaps).toHaveLength(DOMAIN_PROFILES.erp.expectedItems.length);
  });

  it("ERP بعنصر موجود فعليًا (Chart of Accounts) → مش بيتحسب فجوة", () => {
    const gaps = detectDomainGaps("erp", ["Chart of Accounts Module", "General Ledger entity"]);
    expect(gaps).not.toContain("Chart of Accounts");
    expect(gaps).not.toContain("General Ledger");
    expect(gaps).toContain("Inventory");
  });

  it("المطابقة Case-Insensitive", () => {
    const gaps = detectDomainGaps("erp", ["chart of accounts"]);
    expect(gaps).not.toContain("Chart of Accounts");
  });
});
