import { describe, expect, it } from "vitest";
import { buildGrowth, countBy } from "./monitoring";

const NOW = new Date("2026-07-30T12:00:00Z");

function row(date: string) {
  return { created_at: `${date}T10:00:00Z` };
}

describe("منحنى النمو", () => {
  it("يرجّع نقطة لكل يوم في النافذة", () => {
    expect(buildGrowth([], NOW, 30)).toHaveLength(30);
    expect(buildGrowth([], NOW, 7)).toHaveLength(7);
  });

  // منحنى بيقفز من يوم ليوم بعيد بيبان كأن النمو متواصل، وهو في
  // الحقيقة توقّف الأيام اللي بينهم.
  it("يملأ الأيام الفاضية بصفر بدل ما يحذفها", () => {
    const points = buildGrowth([row("2026-07-30"), row("2026-07-25")], NOW, 7);

    expect(points).toHaveLength(7);
    expect(points.filter((p) => p.added === 0)).toHaveLength(5);
  });

  it("التراكمي بيزيد ومابيقلّش أبدًا", () => {
    const points = buildGrowth(
      [row("2026-07-28"), row("2026-07-28"), row("2026-07-30")],
      NOW,
      7
    );

    for (let i = 1; i < points.length; i++) {
      expect(points[i].cumulative).toBeGreaterThanOrEqual(points[i - 1].cumulative);
    }
  });

  // التجاهل كان بيخلّي المنحنى يبان كأن المشروع بدأ من الصفر من
  // ثلاثين يومًا.
  it("يحسب ما أُضيف قبل النافذة في نقطة البداية", () => {
    const points = buildGrowth([row("2025-01-01"), row("2025-01-02"), row("2026-07-30")], NOW, 7);

    expect(points[0].cumulative).toBe(2);
    expect(points[points.length - 1].cumulative).toBe(3);
  });

  it("اليوم اللي فيه إضافات يعكس عددها", () => {
    const points = buildGrowth([row("2026-07-30"), row("2026-07-30")], NOW, 3);
    expect(points[points.length - 1].added).toBe(2);
  });

  it("مصفوفة فاضية تعطي منحنى أصفارًا بلا انهيار", () => {
    const points = buildGrowth([], NOW, 5);
    expect(points.every((p) => p.added === 0 && p.cumulative === 0)).toBe(true);
  });
});

describe("التجميع بالمفتاح", () => {
  it("يعدّ ويرتّب بالأكثر أولًا", () => {
    const result = countBy(
      [{ c: "a" }, { c: "b" }, { c: "b" }, { c: "b" }, { c: "a" }],
      (x) => x.c
    );

    expect(result).toEqual([
      { key: "b", count: 3 },
      { key: "a", count: 2 },
    ]);
  });

  it("المفتاح الفاضي بيتحوّل لغير مصنَّف بدل ما يختفي", () => {
    expect(countBy([{ c: "" }], (x) => x.c)).toEqual([{ key: "unknown", count: 1 }]);
  });

  it("قائمة فاضية تعطي قائمة فاضية", () => {
    expect(countBy([], () => "x")).toEqual([]);
  });
});
