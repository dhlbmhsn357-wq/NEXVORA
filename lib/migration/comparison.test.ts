import { describe, expect, it } from "vitest";
import { MIN_SAMPLE_FOR_VERDICT, assessMigration, summarize, type ServiceComparison } from "./comparison";

type Row = Parameters<typeof summarize>[0][number];

function row(patch: Partial<Row> = {}): Row {
  return {
    service: "meeting",
    path: "new",
    latency_ms: 1000,
    success: true,
    fell_back: false,
    ...patch,
  };
}

function comparison(patch: Partial<ServiceComparison> = {}): ServiceComparison {
  return {
    service: "meeting",
    legacyCalls: 100,
    newCalls: 100,
    fallbacks: 0,
    legacyAvgMs: 2000,
    newAvgMs: 2100,
    legacySuccessRate: 0.95,
    newSuccessRate: 0.95,
    migratedShare: 0.5,
    ...patch,
  };
}

describe("التجميع", () => {
  it("يفصل المسارين ويحسب المتوسّطات لكلٍّ على حدة", () => {
    const [result] = summarize([
      row({ path: "legacy", latency_ms: 1000 }),
      row({ path: "legacy", latency_ms: 3000 }),
      row({ path: "new", latency_ms: 500 }),
    ]);

    expect(result.legacyCalls).toBe(2);
    expect(result.newCalls).toBe(1);
    expect(result.legacyAvgMs).toBe(2000);
    expect(result.newAvgMs).toBe(500);
  });

  // الصفر هنا يقرأ كـ«فشل كامل» أو «صفر مللي ثانية»، وكلاهما كذب.
  // غياب العيّنة لازم يظهر كغياب.
  it("مسار بلا عيّنات يعطي null لا صفرًا", () => {
    const [result] = summarize([row({ path: "new" })]);
    expect(result.legacyAvgMs).toBeNull();
    expect(result.legacySuccessRate).toBeNull();
  });

  it("يفصل الخدمات ويرتّبها بالحجم", () => {
    const results = summarize([
      row({ service: "support" }),
      row({ service: "meeting" }),
      row({ service: "meeting" }),
      row({ service: "meeting" }),
    ]);
    expect(results.map((r) => r.service)).toEqual(["meeting", "support"]);
  });

  it("نسبة النجاح تُحسب داخل كل مسار لا على المجموع", () => {
    const [result] = summarize([
      row({ path: "legacy", success: true }),
      row({ path: "legacy", success: true }),
      row({ path: "new", success: false }),
      row({ path: "new", success: true }),
    ]);
    expect(result.legacySuccessRate).toBe(1);
    expect(result.newSuccessRate).toBe(0.5);
  });

  it("مصفوفة فاضية تعطي نتيجة فاضية لا تنهار", () => {
    expect(summarize([])).toEqual([]);
  });
});

describe("الحكم على الترحيل", () => {
  it("يمتنع عن الحكم قبل عيّنة كافية", () => {
    const verdict = assessMigration(comparison({ newCalls: MIN_SAMPLE_FOR_VERDICT - 1 }));
    expect(verdict.verdict).toBe("insufficient_data");
  });

  it("أداء مكافئ = سليم", () => {
    expect(assessMigration(comparison()).verdict).toBe("healthy");
  });

  // الرجوع المتكرر معناه أن المسار الجديد لم يعمل أصلًا، والمستخدم نجا
  // بالقديم — فهو أخطر من البطء لأنه يبدو نجاحًا في كل المقاييس.
  it("رجوع متكرر = تدهور مع توصية بالرجوع", () => {
    const verdict = assessMigration(comparison({ newCalls: 50, fallbacks: 30 }));
    expect(verdict.verdict).toBe("degraded");
    expect(verdict).toHaveProperty("recommendRollback", true);
  });

  it("انخفاض نسبة النجاح عن القديم = تدهور مع توصية بالرجوع", () => {
    const verdict = assessMigration(comparison({ legacySuccessRate: 0.98, newSuccessRate: 0.7 }));
    expect(verdict.verdict).toBe("degraded");
    expect(verdict).toHaveProperty("recommendRollback", true);
  });

  // البطء وحده مقايضة مقصودة: الترحيل ينقل الحمل خارج Vercel، وزمن
  // أطول مقابل حمل أقل قرار تشغيلي لا عطل.
  it("بطء وحده = تدهور بلا توصية بالرجوع", () => {
    const verdict = assessMigration(comparison({ legacyAvgMs: 1000, newAvgMs: 5000 }));
    expect(verdict.verdict).toBe("degraded");
    expect(verdict).toHaveProperty("recommendRollback", false);
  });

  it("فرق زمن بسيط لا يُعتبر تدهورًا", () => {
    expect(assessMigration(comparison({ legacyAvgMs: 1000, newAvgMs: 1800 })).verdict).toBe("healthy");
  });

  it("غياب بيانات القديم لا يُحسب فشلًا للجديد", () => {
    const verdict = assessMigration(
      comparison({ legacyCalls: 0, legacyAvgMs: null, legacySuccessRate: null, newSuccessRate: 0.9 })
    );
    expect(verdict.verdict).toBe("healthy");
  });
});
