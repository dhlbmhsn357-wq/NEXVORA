import { describe, it, expect, vi } from "vitest";

// تحييد "server-only" + طبقة الوصول للبيانات عشان نختبر منطق بناء الصف الخالص فقط.
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => ({}) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));

import { buildProspectInsertRow } from "./service";
import type { ProspectColumnMapping } from "./import-service";

const mapping: ProspectColumnMapping = {
  organization_name: "الاسم",
  primary_phone_raw: "الهاتف",
  email: "البريد",
  governorate: "المحافظة",
  sector: "القطاع",
};

describe("buildProspectInsertRow", () => {
  it("يبني صفًا صالحًا بحالة new عند وجود هاتف صالح", () => {
    const built = buildProspectInsertRow(
      { الاسم: "مدرسة النور", الهاتف: "01012345678", البريد: "", المحافظة: "القاهرة", القطاع: "تعليم" },
      mapping,
      "batch-1",
      "user-1"
    );
    expect(built).not.toBeNull();
    expect(built!.initialStatus).toBe("new");
    expect(built!.row.primary_phone_normalized).toBe("201012345678");
    expect(built!.row.verification_status).toBe("unverified");
    expect(built!.row.import_batch_id).toBe("batch-1");
    expect(built!.row.created_by).toBe("user-1");
  });

  it("بلا اسم منظمة → null", () => {
    const built = buildProspectInsertRow({ الاسم: "", الهاتف: "01012345678" }, mapping, "batch-1", null);
    expect(built).toBeNull();
  });

  it("هاتف غير صالح لكن بريد موجود → status new وverification_status unverified", () => {
    const built = buildProspectInsertRow(
      { الاسم: "جهة", الهاتف: "0223456789", البريد: "x@y.com" },
      mapping,
      "batch-1",
      null
    );
    expect(built!.initialStatus).toBe("new");
    expect(built!.row.primary_phone_normalized).toBeNull();
  });

  it("هاتف غير صالح وبلا بريد → needs_verification وverification_status invalid_phone", () => {
    const built = buildProspectInsertRow({ الاسم: "جهة", الهاتف: "0223456789", البريد: "" }, mapping, "batch-1", null);
    expect(built!.initialStatus).toBe("needs_verification");
    expect(built!.row.verification_status).toBe("invalid_phone");
  });

  it("normalized_name مُطبَّع (lowercase + مسافات مفردة)", () => {
    const built = buildProspectInsertRow({ الاسم: "  Al  Nour   School  ", الهاتف: "01012345678" }, mapping, "b", null);
    expect(built!.row.normalized_name).toBe("al nour school");
  });
});
