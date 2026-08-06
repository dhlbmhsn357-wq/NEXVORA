import { describe, it, expect } from "vitest";
import {
  describeReconcile,
  normalizeTitle,
  reconcileStages,
  type ExistingStage,
  type PlanModule,
} from "./stage-reconciler";

function stage(index: number, title: string, status = "ready", hasContent = true): ExistingStage {
  return { id: `stage-${index}`, stage_index: index, title, status, has_content: hasContent };
}

function mod(index: number, title: string, dependsOn: number[] = []): PlanModule {
  return { index, title, summary: `ملخّص ${title}`, depends_on: dependsOn };
}

describe("normalizeTitle", () => {
  it("يتجاهل فروق المسافات وحالة الأحرف", () => {
    expect(normalizeTitle("  Auth   Module ")).toBe(normalizeTitle("auth module"));
  });

  it("يتجاهل التشكيل والتطويل", () => {
    expect(normalizeTitle("المصادقـــة")).toBe(normalizeTitle("المصادقة"));
  });
});

describe("reconcileStages — الوضع الإضافي", () => {
  const existing = [stage(0, "المصادقة"), stage(1, "لوحة التحكم")];
  const existingModules = [mod(0, "المصادقة"), mod(1, "لوحة التحكم")];

  it("لا يحذف أي مرحلة قائمة", () => {
    const r = reconcileStages(
      existing,
      [mod(0, "المصادقة"), mod(1, "لوحة التحكم"), mod(2, "التقارير")],
      existingModules,
      "additive"
    );
    expect(r.deleteStageIds).toEqual([]);
    expect(r.preservedCount).toBe(2);
  });

  it("يضيف الموديول الجديد بعد أعلى index موجود", () => {
    const r = reconcileStages(
      existing,
      [mod(0, "المصادقة"), mod(1, "لوحة التحكم"), mod(2, "التقارير")],
      existingModules,
      "additive"
    );
    expect(r.inserts).toHaveLength(1);
    expect(r.inserts[0].title).toBe("التقارير");
    expect(r.inserts[0].stage_index).toBe(2);
    expect(r.addedCount).toBe(1);
  });

  it("يحافظ على أرقام المراحل القديمة حتى لو الخطة الجديدة رتّبتها بشكل مختلف", () => {
    const r = reconcileStages(
      existing,
      [mod(0, "التقارير"), mod(1, "لوحة التحكم"), mod(2, "المصادقة")],
      existingModules,
      "additive"
    );
    // "التقارير" هي الجديدة الوحيدة — لازم تاخد index 2 مش 0
    expect(r.inserts).toHaveLength(1);
    expect(r.inserts[0].stage_index).toBe(2);
    // المراحل القديمة أرقامها ما اتغيّرتش
    const merged = r.mergedModules;
    expect(merged.find((m) => m.title === "المصادقة")?.index).toBe(0);
    expect(merged.find((m) => m.title === "لوحة التحكم")?.index).toBe(1);
  });

  it("يترجم الاعتماديات من ترقيم الخطة الجديدة لترقيم المراحل الفعلي", () => {
    // في الخطة الجديدة: التقارير (index 2) بتعتمد على لوحة التحكم (index 1)
    const r = reconcileStages(
      existing,
      [mod(0, "المصادقة"), mod(1, "لوحة التحكم"), mod(2, "التقارير", [1])],
      existingModules,
      "additive"
    );
    // لوحة التحكم مرحلة قائمة رقمها 1 — الاعتمادية تفضل 1
    expect(r.inserts[0].depends_on).toEqual([1]);
  });

  it("يترجم اعتمادية على موديول جديد كمان", () => {
    const r = reconcileStages(
      existing,
      [
        mod(0, "المصادقة"),
        mod(1, "لوحة التحكم"),
        mod(2, "التقارير"),
        mod(3, "التصدير", [2]),
      ],
      existingModules,
      "additive"
    );
    const exportStage = r.inserts.find((s) => s.title === "التصدير");
    const reportsStage = r.inserts.find((s) => s.title === "التقارير");
    expect(exportStage?.depends_on).toEqual([reportsStage?.stage_index]);
  });

  it("يشيل الاعتمادية على موديول مش موجود بدل ما يشاور على رقم غلط", () => {
    const r = reconcileStages(existing, [mod(0, "التقارير", [99])], existingModules, "additive");
    expect(r.inserts[0].depends_on).toEqual([]);
  });

  it("مايضيفش حاجة لو كل الموديولات موجودة بالفعل", () => {
    const r = reconcileStages(existing, existingModules, existingModules, "additive");
    expect(r.inserts).toEqual([]);
    expect(r.addedCount).toBe(0);
    expect(r.deleteStageIds).toEqual([]);
  });

  it("يطابق العناوين رغم فروق المسافات والتشكيل", () => {
    const r = reconcileStages(
      [stage(0, "المصادقـة")],
      [mod(0, "  المصادقة  ")],
      [mod(0, "المصادقة")],
      "additive"
    );
    expect(r.addedCount).toBe(0);
  });

  it("يبني وصف المراحل من الصفوف لو modules الخطة اتفضت", () => {
    const r = reconcileStages(existing, [mod(0, "التقارير")], [], "additive");
    expect(r.mergedModules).toHaveLength(3);
    expect(r.mergedModules.map((m) => m.index)).toEqual([0, 1, 2]);
  });

  it("يبدأ من الصفر لو مفيش مراحل قائمة", () => {
    const r = reconcileStages([], [mod(0, "أ"), mod(1, "ب")], [], "additive");
    expect(r.inserts.map((s) => s.stage_index)).toEqual([0, 1]);
    expect(r.mergedModules).toHaveLength(2);
  });
});

describe("reconcileStages — وضع الاستبدال", () => {
  it("يحذف كل المراحل القائمة ويعيد بناء الخطة", () => {
    const existing = [stage(0, "المصادقة"), stage(1, "لوحة التحكم")];
    const r = reconcileStages(existing, [mod(0, "جديد")], [mod(0, "المصادقة")], "replace");
    expect(r.deleteStageIds).toEqual(["stage-0", "stage-1"]);
    expect(r.inserts).toHaveLength(1);
    expect(r.mergedModules).toHaveLength(1);
    expect(r.preservedCount).toBe(0);
  });
});

describe("describeReconcile", () => {
  it("يوصّف الإضافة بدون حذف", () => {
    const r = reconcileStages(
      [stage(0, "المصادقة")],
      [mod(0, "المصادقة"), mod(1, "التقارير")],
      [mod(0, "المصادقة")],
      "additive"
    );
    const text = describeReconcile(r, "additive");
    expect(text).toContain("أُضيفت 1");
    expect(text).toContain("التقارير");
    expect(text).not.toContain("حُذف");
  });

  it("يوضّح إن مفيش مراحل جديدة", () => {
    const r = reconcileStages([stage(0, "أ")], [mod(0, "أ")], [mod(0, "أ")], "additive");
    expect(describeReconcile(r, "additive")).toContain("لا توجد مراحل جديدة");
  });

  it("يوضّح الحذف في وضع الاستبدال", () => {
    const r = reconcileStages([stage(0, "أ")], [mod(0, "ب")], [mod(0, "أ")], "replace");
    expect(describeReconcile(r, "replace")).toContain("حُذف");
  });
});
