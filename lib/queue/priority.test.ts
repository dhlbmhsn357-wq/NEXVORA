import { describe, it, expect } from "vitest";
import {
  ALL_PRIORITIES,
  BACKPRESSURE_HARD_LIMIT,
  BACKPRESSURE_SOFT_LIMIT,
  PRIORITY_RANK,
  STARVATION_THRESHOLD_MS,
  comparePriority,
  decideAdmission,
  effectivePriority,
  sortByExecutionOrder,
} from "./priority";
import type { JobPriority } from "./types";

const NOW = new Date("2026-01-01T12:00:00Z");
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000);

describe("ترتيب الأولويات", () => {
  it("الحرجة أعلى من كل شيء", () => {
    for (const p of ALL_PRIORITIES.filter((x) => x !== "critical")) {
      expect(comparePriority("critical", p)).toBeLessThan(0);
    }
  });

  it("الخلفية أدنى من كل شيء", () => {
    for (const p of ALL_PRIORITIES.filter((x) => x !== "background")) {
      expect(comparePriority("background", p)).toBeGreaterThan(0);
    }
  });

  it("الترتيب تصاعدي ليطابق order by في القاعدة", () => {
    const ranks = ALL_PRIORITIES.map((p) => PRIORITY_RANK[p]);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
  });
});

describe("الترقية ضد التجويع", () => {
  it("الانتظار القصير لا يرقّي", () => {
    expect(effectivePriority("low", 60_000)).toBe("low");
    expect(effectivePriority("background", STARVATION_THRESHOLD_MS - 1)).toBe("background");
  });

  it("تجاوز العتبة يرقّي درجة", () => {
    expect(effectivePriority("background", STARVATION_THRESHOLD_MS)).toBe("low");
    expect(effectivePriority("low", STARVATION_THRESHOLD_MS)).toBe("normal");
  });

  it("الانتظار الطويل يرقّي أكثر من درجة", () => {
    expect(effectivePriority("background", STARVATION_THRESHOLD_MS * 3)).toBe("high");
  });

  it("الترقية تتوقّف عند الحرجة", () => {
    expect(effectivePriority("background", STARVATION_THRESHOLD_MS * 100)).toBe("critical");
    expect(effectivePriority("critical", STARVATION_THRESHOLD_MS * 100)).toBe("critical");
  });
});

describe("ترتيب التنفيذ", () => {
  it("الأولوية أولًا", () => {
    const jobs = [
      { id: "bg", priority: "background" as JobPriority, createdAt: minutesAgo(1) },
      { id: "crit", priority: "critical" as JobPriority, createdAt: minutesAgo(1) },
      { id: "norm", priority: "normal" as JobPriority, createdAt: minutesAgo(1) },
    ];
    expect(sortByExecutionOrder(jobs, NOW).map((j) => j.id)).toEqual(["crit", "norm", "bg"]);
  });

  it("الأقدم أولًا داخل نفس الأولوية", () => {
    const jobs = [
      { id: "new", priority: "normal" as JobPriority, createdAt: minutesAgo(1) },
      { id: "old", priority: "normal" as JobPriority, createdAt: minutesAgo(30) },
    ];
    expect(sortByExecutionOrder(jobs, NOW).map((j) => j.id)).toEqual(["old", "new"]);
  });

  it("المهمة الجائعة تسبق الأحدث الأعلى أولوية", () => {
    // ده جوهر الحماية من التجويع: من غيرها تفضل مهام الخلفية في
    // الطابور للأبد طول ما فيه مهام أعلى بتوصل باستمرار.
    const jobs = [
      { id: "fresh-low", priority: "low" as JobPriority, createdAt: minutesAgo(1) },
      { id: "starved-bg", priority: "background" as JobPriority, createdAt: minutesAgo(180) },
    ];
    expect(sortByExecutionOrder(jobs, NOW)[0].id).toBe("starved-bg");
  });

  it("مابيعدّلش المصفوفة الأصلية", () => {
    const jobs = [
      { id: "a", priority: "low" as JobPriority, createdAt: minutesAgo(1) },
      { id: "b", priority: "critical" as JobPriority, createdAt: minutesAgo(1) },
    ];
    const before = jobs.map((j) => j.id);
    sortByExecutionOrder(jobs, NOW);
    expect(jobs.map((j) => j.id)).toEqual(before);
  });

  it("مستقر مع مصفوفة فارغة أو عنصر واحد", () => {
    expect(sortByExecutionOrder([], NOW)).toEqual([]);
    const one = [{ id: "x", priority: "normal" as JobPriority, createdAt: NOW }];
    expect(sortByExecutionOrder(one, NOW)).toHaveLength(1);
  });
});

describe("الضغط العكسي", () => {
  it("الطابور الخفيف يقبل كل شيء", () => {
    for (const p of ALL_PRIORITIES) {
      expect(decideAdmission(10, p).admit).toBe(true);
    }
  });

  it("الازدحام يرفض المنخفض ويقبل العادي وما فوقه", () => {
    const depth = BACKPRESSURE_SOFT_LIMIT + 1;
    expect(decideAdmission(depth, "critical").admit).toBe(true);
    expect(decideAdmission(depth, "high").admit).toBe(true);
    expect(decideAdmission(depth, "normal").admit).toBe(true);
    expect(decideAdmission(depth, "low").admit).toBe(false);
    expect(decideAdmission(depth, "background").admit).toBe(false);
  });

  it("التحميل الكامل يقبل الحرجة فقط", () => {
    const depth = BACKPRESSURE_HARD_LIMIT + 1;
    expect(decideAdmission(depth, "critical").admit).toBe(true);
    expect(decideAdmission(depth, "high").admit).toBe(false);
    expect(decideAdmission(depth, "normal").admit).toBe(false);
  });

  it("كل رفض بيحمل سببًا مفهومًا وفيه الرقم", () => {
    // الرفض الصريح مع سبب أفضل من القبول ثم انتظار ساعتين بلا تفسير.
    const decision = decideAdmission(BACKPRESSURE_SOFT_LIMIT + 5, "low");
    expect(decision.admit).toBe(false);
    if (!decision.admit) {
      expect(decision.reason.length).toBeGreaterThan(20);
      expect(decision.reason).toContain(String(BACKPRESSURE_SOFT_LIMIT + 5));
    }
  });

  it("الحدود بالظبط", () => {
    expect(decideAdmission(BACKPRESSURE_SOFT_LIMIT - 1, "background").admit).toBe(true);
    expect(decideAdmission(BACKPRESSURE_SOFT_LIMIT, "background").admit).toBe(false);
  });
});
