import { describe, expect, it } from "vitest";
import {
  DEFAULT_FLAGS,
  MIGRATABLE_SERVICES,
  decideRoute,
  envOverride,
  killSwitchEngaged,
  serviceForTaskType,
  stableSample,
  type FlagRow,
  type MigratableService,
} from "./flags";
import { jobTypeForService } from "./ai-adapter";

function flags(overrides: Partial<Record<MigratableService, Partial<FlagRow>>> = {}) {
  const base = structuredClone(DEFAULT_FLAGS);
  for (const [service, patch] of Object.entries(overrides)) {
    Object.assign(base[service as MigratableService], patch);
  }
  return base;
}

describe("الافتراض الآمن", () => {
  it("كل الأعلام تبدأ مطفأة", () => {
    for (const service of MIGRATABLE_SERVICES) {
      expect(DEFAULT_FLAGS[service].state).toBe("off");
      expect(DEFAULT_FLAGS[service].rolloutPercent).toBe(0);
    }
  });

  // الخاصية الحاكمة للمرحلة كلها: نشر الكود وحده لا يحوّل منصة حيّة
  // لمسار جديد. لو كسر أحد ده، انكسر عقد الأمان لا اختبار وحدة.
  it("بلا أي إعداد، كل نوع مهمة يسلك المسار القديم", () => {
    const samples = ["meeting_extraction", "discovery_analysis", "prd_generation", "support_chat"];
    for (const taskType of samples) {
      expect(decideRoute({ taskType, flags: flags(), sample: 0 }).path).toBe("legacy");
    }
  });

  it("نوع مهمة غير مربوط بخدمة يسلك القديم بلا خدمة", () => {
    const decision = decideRoute({ taskType: "something_unmapped", flags: flags(), sample: 0 });
    expect(decision.path).toBe("legacy");
    expect(decision.service).toBeNull();
  });
});

describe("النقل التدريجي", () => {
  it("مئة بالمئة يوجّه كل شيء للجديد", () => {
    const f = flags({ meeting: { state: "on", rolloutPercent: 100 } });
    for (const sample of [0, 37, 99]) {
      expect(decideRoute({ taskType: "meeting_extraction", flags: f, sample }).path).toBe("new");
    }
  });

  it("علم مفعّل بنسبة صفر يبقى على القديم", () => {
    const f = flags({ meeting: { state: "on", rolloutPercent: 0 } });
    expect(decideRoute({ taskType: "meeting_extraction", flags: f, sample: 0 }).path).toBe("legacy");
  });

  it("النسبة تفصل العيّنات على الحدّ بالضبط", () => {
    const f = flags({ meeting: { state: "on", rolloutPercent: 25 } });
    expect(decideRoute({ taskType: "meeting_extraction", flags: f, sample: 24 }).path).toBe("new");
    expect(decideRoute({ taskType: "meeting_extraction", flags: f, sample: 25 }).path).toBe("legacy");
  });

  it("إطفاء العلم يغلب أي نسبة", () => {
    const f = flags({ meeting: { state: "off", rolloutPercent: 100 } });
    expect(decideRoute({ taskType: "meeting_extraction", flags: f, sample: 0 }).path).toBe("legacy");
  });

  it("علم خدمة لا يؤثّر على خدمة أخرى", () => {
    const f = flags({ meeting: { state: "on", rolloutPercent: 100 } });
    expect(decideRoute({ taskType: "discovery_analysis", flags: f, sample: 0 }).path).toBe("legacy");
  });
});

describe("العيّنة الثابتة", () => {
  // بدون الثبات، مهمة تفشل في الجديد ثم تنجح في القديم عند الإعادة —
  // فيبدو العطل عابرًا وهو بنيوي، ويستحيل إعادة إنتاجه للتشخيص.
  it("نفس المدخل يعطي نفس الرقم دائمًا", () => {
    expect(stableSample("brain:abc123")).toBe(stableSample("brain:abc123"));
  });

  it("الناتج داخل المدى ٠-٩٩ لكل المدخلات", () => {
    for (const seed of ["", "أ", "x".repeat(500), "prd:9f8e", "دعم:١٢٣"]) {
      const value = stableSample(seed);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(100);
    }
  });

  it("مدخلات مختلفة تتوزّع لا تتكدّس على رقم واحد", () => {
    const seen = new Set(Array.from({ length: 200 }, (_, i) => stableSample(`job-${i}`)));
    expect(seen.size).toBeGreaterThan(50);
  });
});

describe("ربط أنواع المهام بالخدمات", () => {
  it("يربط الأنواع الحقيقية بخدماتها", () => {
    expect(serviceForTaskType("meeting_extraction")).toBe("meeting");
    expect(serviceForTaskType("transcription")).toBe("meeting");
    expect(serviceForTaskType("discovery_analysis")).toBe("discovery");
    expect(serviceForTaskType("prd_generation")).toBe("prd");
    expect(serviceForTaskType("security_review")).toBe("qa");
    expect(serviceForTaskType("support_chat")).toBe("support");
    expect(serviceForTaskType("production_monitoring_analysis")).toBe("monitoring");
  });

  it("لا يفرّق بين حالات الأحرف", () => {
    expect(serviceForTaskType("PRD_GENERATION")).toBe("prd");
  });

  // ده اللي بيمنع تسريب خدمة بلا عامل: كل خدمة لازم يكون ليها نوع مهمة
  // طابور، وإلا العلم يتفتح ويُدرَج شيء لا يسحبه أحد.
  it("كل خدمة قابلة للترحيل لها نوع مهمة في الطابور", () => {
    for (const service of MIGRATABLE_SERVICES) {
      expect(jobTypeForService(service)).toMatch(/^ai\./);
    }
  });
});

describe("تجاوزات البيئة", () => {
  it("يقرأ الصيغ الثلاث للتشغيل والإطفاء", () => {
    expect(envOverride("brain", { MIGRATE_BRAIN: "on" })).toBe("on");
    expect(envOverride("brain", { MIGRATE_BRAIN: "TRUE" })).toBe("on");
    expect(envOverride("brain", { MIGRATE_BRAIN: "1" })).toBe("on");
    expect(envOverride("brain", { MIGRATE_BRAIN: "off" })).toBe("off");
    expect(envOverride("brain", { MIGRATE_BRAIN: "0" })).toBe("off");
  });

  it("قيمة غير مفهومة تُعامَل كغياب لا كتفعيل", () => {
    expect(envOverride("brain", { MIGRATE_BRAIN: "maybe" })).toBeNull();
    expect(envOverride("brain", {})).toBeNull();
  });

  it("مفتاح الإيقاف العام يُقرأ من متغيّر واحد", () => {
    expect(killSwitchEngaged({ MIGRATION_KILL_SWITCH: "on" })).toBe(true);
    expect(killSwitchEngaged({ MIGRATION_KILL_SWITCH: "off" })).toBe(false);
    expect(killSwitchEngaged({})).toBe(false);
  });
});
