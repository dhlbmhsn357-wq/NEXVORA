import { describe, it, expect } from "vitest";
import { QueueSimulator } from "./simulator";

/**
 * اختبارات السلوك المتكامل للطابور.
 *
 * الوحدات النقية مختبَرة كلٌّ على حدة. اللي هنا بيختبر **تفاعلها**:
 * الترتيب والسباق والقفل وإسقاط التكرار والاستئناف والرسائل الميتة —
 * وكلها سلوك ناتج عن التركيب لا عن وحدة بعينها.
 */

describe("إنشاء المهام", () => {
  it("ينشئ مهمة في حالة الطابور", () => {
    const sim = new QueueSimulator();
    const result = sim.enqueue({ type: "system.noop" });
    expect(result.status).toBe("created");
    if (result.status === "created") expect(result.job.status).toBe("queued");
  });

  it("المهام الجديدة تظهر في عمق الطابور", () => {
    const sim = new QueueSimulator();
    for (let i = 0; i < 5; i++) sim.enqueue({ type: "system.noop" });
    expect(sim.queueDepth()).toBe(5);
  });
});

describe("الترتيب والأولوية", () => {
  it("الحرجة تُسحب قبل العادية مهما كان ترتيب الإدراج", () => {
    const sim = new QueueSimulator();
    sim.enqueue({ type: "t", priority: "background" });
    sim.enqueue({ type: "t", priority: "normal" });
    sim.enqueue({ type: "t", priority: "critical" });

    expect(sim.claim("w1", ["t"])?.priority).toBe("critical");
    expect(sim.claim("w1", ["t"])?.priority).toBe("normal");
    expect(sim.claim("w1", ["t"])?.priority).toBe("background");
  });

  it("الأقدم أولًا داخل نفس الأولوية", () => {
    const sim = new QueueSimulator();
    const first = sim.enqueue({ type: "t" });
    sim.advance(1000);
    sim.enqueue({ type: "t" });

    const claimed = sim.claim("w1", ["t"]);
    expect(claimed?.id).toBe(first.status === "created" ? first.job.id : "");
  });

  it("العامل يسحب أنواعه فقط", () => {
    const sim = new QueueSimulator();
    sim.enqueue({ type: "ai.generate" });
    sim.enqueue({ type: "browser.check" });

    expect(sim.claim("w1", ["browser.check"])?.type).toBe("browser.check");
    expect(sim.claim("w1", ["browser.check"])).toBeNull();
  });

  it("الطابور الفارغ يرجّع null لا يرمي", () => {
    expect(new QueueSimulator().claim("w1", ["t"])).toBeNull();
  });
});

describe("السباق — منع المعالجة المزدوجة", () => {
  it("عاملان ماياخدوش نفس المهمة أبدًا", () => {
    const sim = new QueueSimulator();
    sim.enqueue({ type: "t" });

    const a = sim.claim("w1", ["t"]);
    const b = sim.claim("w2", ["t"]);

    expect(a).not.toBeNull();
    expect(b).toBeNull();
  });

  it("عشرة عمال على عشر مهام = كل مهمة مرة واحدة بالظبط", () => {
    const sim = new QueueSimulator();
    for (let i = 0; i < 10; i++) sim.enqueue({ type: "t" });

    const claimed: string[] = [];
    for (let w = 0; w < 10; w++) {
      const job = sim.claim(`w${w}`, ["t"]);
      if (job) claimed.push(job.id);
    }

    expect(claimed).toHaveLength(10);
    expect(new Set(claimed).size).toBe(10);
  });

  it("عمال أكثر من المهام — الزائد يرجع فاضي", () => {
    const sim = new QueueSimulator();
    sim.enqueue({ type: "t" });
    sim.enqueue({ type: "t" });

    const results = Array.from({ length: 5 }, (_, i) => sim.claim(`w${i}`, ["t"]));
    expect(results.filter(Boolean)).toHaveLength(2);
  });
});

describe("القفل الموزّع بالمورد", () => {
  it("مهمتان على نفس المورد لا تشتغلان معًا", () => {
    // `SKIP LOCKED` بيمنع سحب نفس **المهمة** مرتين، لكنه لا يمنع
    // مهمتين مختلفتين من الكتابة في نفس المورد.
    const sim = new QueueSimulator();
    sim.enqueue({ type: "brain.rebuild", lockKey: "brain:p1" });
    sim.enqueue({ type: "brain.rebuild", lockKey: "brain:p1" });

    expect(sim.claim("w1", ["brain.rebuild"])).not.toBeNull();
    expect(sim.claim("w2", ["brain.rebuild"])).toBeNull();
  });

  it("موارد مختلفة تشتغل بالتوازي", () => {
    const sim = new QueueSimulator();
    sim.enqueue({ type: "brain.rebuild", lockKey: "brain:p1" });
    sim.enqueue({ type: "brain.rebuild", lockKey: "brain:p2" });

    expect(sim.claim("w1", ["brain.rebuild"])).not.toBeNull();
    expect(sim.claim("w2", ["brain.rebuild"])).not.toBeNull();
  });

  it("القفل يُحرَّر عند الاكتمال", () => {
    const sim = new QueueSimulator();
    sim.enqueue({ type: "brain.rebuild", lockKey: "brain:p1" });
    sim.enqueue({ type: "brain.rebuild", lockKey: "brain:p1" });

    const first = sim.claim("w1", ["brain.rebuild"])!;
    sim.complete(first.id);

    expect(sim.claim("w2", ["brain.rebuild"])).not.toBeNull();
  });

  it("القفل يُحرَّر عند الفشل والإلغاء كمان", () => {
    // القفل اللي مايتحرّرش عند الفشل بيحجب المورد للأبد.
    const sim = new QueueSimulator();
    sim.enqueue({ type: "t", lockKey: "res:1" });
    const job = sim.claim("w1", ["t"])!;
    sim.fail(job.id, new Error("403 forbidden"));

    expect(sim.locks.has("res:1")).toBe(false);
  });
});

describe("إسقاط التكرار", () => {
  it("الطلب المكرّر يرجّع نفس المهمة", () => {
    // ده اللي بيحمي من الضغط العصبي خمس مرات على زرار.
    const sim = new QueueSimulator();
    const first = sim.enqueue({ type: "t", dedupeHash: "same" });
    const second = sim.enqueue({ type: "t", dedupeHash: "same" });

    expect(second.status).toBe("deduplicated");
    if (first.status === "created" && second.status === "deduplicated") {
      expect(second.job.id).toBe(first.job.id);
    }
    expect(sim.jobs.size).toBe(1);
  });

  it("بصمات مختلفة تنشئ مهام مختلفة", () => {
    const sim = new QueueSimulator();
    sim.enqueue({ type: "t", dedupeHash: "a" });
    sim.enqueue({ type: "t", dedupeHash: "b" });
    expect(sim.jobs.size).toBe(2);
  });

  it("بعد الاكتمال، نفس البصمة تنشئ مهمة جديدة", () => {
    // ده الفرق الجوهري بين إسقاط التكرار (نافذة قصيرة) وIdempotency
    // (دائم): إعادة التوليد بعد الانتهاء عملية مشروعة.
    const sim = new QueueSimulator();
    sim.enqueue({ type: "t", dedupeHash: "same" });
    const job = sim.claim("w1", ["t"])!;
    sim.complete(job.id);

    expect(sim.enqueue({ type: "t", dedupeHash: "same" }).status).toBe("created");
  });
});

describe("Idempotency", () => {
  it("نفس المفتاح يرجّع نفس المهمة", () => {
    const sim = new QueueSimulator();
    const first = sim.enqueue({ type: "t", idempotencyKey: "k1" });
    const second = sim.enqueue({ type: "t", idempotencyKey: "k1" });

    expect(second.status).toBe("idempotent_replay");
    if (first.status === "created" && second.status === "idempotent_replay") {
      expect(second.job.id).toBe(first.job.id);
    }
    expect(sim.jobs.size).toBe(1);
  });

  it("يعمل حتى بعد اكتمال المهمة — بخلاف إسقاط التكرار", () => {
    const sim = new QueueSimulator();
    sim.enqueue({ type: "t", idempotencyKey: "k1" });
    const job = sim.claim("w1", ["t"])!;
    sim.complete(job.id);

    const replay = sim.enqueue({ type: "t", idempotencyKey: "k1" });
    expect(replay.status).toBe("idempotent_replay");
    if (replay.status === "idempotent_replay") expect(replay.job.status).toBe("completed");
  });
});

describe("إعادة المحاولة والرسائل الميتة", () => {
  it("الفشل العابر يعيد للطابور بتأخير", () => {
    const sim = new QueueSimulator();
    sim.enqueue({ type: "t", maxAttempts: 3 });
    const job = sim.claim("w1", ["t"])!;
    sim.fail(job.id, new Error("503 unavailable"));

    expect(sim.jobs.get(job.id)?.status).toBe("queued");
    expect(sim.jobs.get(job.id)!.availableAt).toBeGreaterThan(sim.now);
  });

  it("المهمة المؤجَّلة ماتتسحبش قبل وقتها", () => {
    const sim = new QueueSimulator();
    sim.enqueue({ type: "t" });
    const job = sim.claim("w1", ["t"])!;
    sim.fail(job.id, new Error("503"));

    expect(sim.claim("w1", ["t"])).toBeNull();
    sim.advance(10 * 60 * 1000);
    expect(sim.claim("w1", ["t"])).not.toBeNull();
  });

  it("الفشل الدائم يذهب للرسائل الميتة فورًا", () => {
    // من غير التصنيف، الخطأ الدائم كان هيتعاد ثلاث مرات بلا فايدة.
    const sim = new QueueSimulator();
    sim.enqueue({ type: "t", maxAttempts: 5 });
    const job = sim.claim("w1", ["t"])!;
    sim.fail(job.id, new Error("400 invalid payload"));

    expect(sim.jobs.get(job.id)?.status).toBe("dead_letter");
    expect(sim.deadLetters).toHaveLength(1);
  });

  it("استنفاد المحاولات ينتهي بالرسائل الميتة", () => {
    const sim = new QueueSimulator();
    sim.enqueue({ type: "t", maxAttempts: 2 });

    for (let i = 0; i < 5; i++) {
      const job = sim.claim("w1", ["t"]);
      if (!job) break;
      sim.fail(job.id, new Error("503"));
      sim.advance(10 * 60 * 1000);
    }

    expect(sim.deadLetters).toHaveLength(1);
    expect(sim.deadLetters[0].attempts).toBe(2);
  });

  it("المهمة في الرسائل الميتة ماتتسحبش تاني", () => {
    // الدوران اللانهائي هو بالضبط ما يمنعه هذا الطابور.
    const sim = new QueueSimulator();
    sim.enqueue({ type: "t", maxAttempts: 1 });
    const job = sim.claim("w1", ["t"])!;
    sim.fail(job.id, new Error("503"));
    sim.advance(60 * 60 * 1000);

    expect(sim.claim("w1", ["t"])).toBeNull();
  });
});

describe("الإلغاء", () => {
  it("يلغي مهمة في الطابور", () => {
    const sim = new QueueSimulator();
    const created = sim.enqueue({ type: "t" });
    if (created.status !== "created") throw new Error("setup");

    expect(sim.cancel(created.job.id)).toBe(true);
    expect(sim.claim("w1", ["t"])).toBeNull();
  });

  it("يلغي مهمة قيد التنفيذ", () => {
    const sim = new QueueSimulator();
    sim.enqueue({ type: "t" });
    const job = sim.claim("w1", ["t"])!;
    expect(sim.cancel(job.id)).toBe(true);
    expect(sim.jobs.get(job.id)?.status).toBe("canceled");
  });

  it("لا يلغي مهمة مكتملة", () => {
    const sim = new QueueSimulator();
    sim.enqueue({ type: "t" });
    const job = sim.claim("w1", ["t"])!;
    sim.complete(job.id);
    expect(sim.cancel(job.id)).toBe(false);
  });

  it("الإلغاء يحفظ آخر تقدّم", () => {
    const sim = new QueueSimulator();
    sim.enqueue({ type: "t" });
    const job = sim.claim("w1", ["t"])!;
    sim.reportProgress(job.id, 60);
    sim.cancel(job.id);

    expect(sim.jobs.get(job.id)?.progress).toBe(60);
  });
});

describe("التقدّم والاستئناف", () => {
  it("التقدّم يُحفظ ويُقيَّد بين صفر ومئة", () => {
    const sim = new QueueSimulator();
    sim.enqueue({ type: "t" });
    const job = sim.claim("w1", ["t"])!;

    sim.reportProgress(job.id, 150);
    expect(sim.jobs.get(job.id)?.progress).toBe(100);
    sim.reportProgress(job.id, -10);
    expect(sim.jobs.get(job.id)?.progress).toBe(0);
  });

  it("نقطة التوقّف تبقى بعد الفشل فتُستأنف لا تُعاد من الصفر", () => {
    const sim = new QueueSimulator();
    sim.enqueue({ type: "t", maxAttempts: 3 });

    const first = sim.claim("w1", ["t"])!;
    sim.saveCheckpoint(first.id, { step: 40 });
    sim.fail(first.id, new Error("503"));
    sim.advance(10 * 60 * 1000);

    const second = sim.claim("w1", ["t"])!;
    expect(second.id).toBe(first.id);
    expect(second.checkpoint).toEqual({ step: 40 });
    expect(second.attempts).toBe(2);
  });

  it("الاكتمال يضبط التقدّم على مئة", () => {
    const sim = new QueueSimulator();
    sim.enqueue({ type: "t" });
    const job = sim.claim("w1", ["t"])!;
    sim.reportProgress(job.id, 30);
    sim.complete(job.id);

    expect(sim.jobs.get(job.id)?.progress).toBe(100);
  });
});

describe("سقوط العامل والتعافي", () => {
  it("مهام العامل الساقط ترجع للطابور", () => {
    // ده بالظبط العطل اللي أسقط المنصة: مهام عالقة في "جاري التنفيذ"
    // بلا كاشف ولا مهلة.
    const sim = new QueueSimulator();
    sim.enqueue({ type: "t" });
    sim.enqueue({ type: "t" });

    sim.claim("dead-worker", ["t"]);
    sim.claim("dead-worker", ["t"]);
    expect(sim.countByStatus("running")).toBe(2);

    expect(sim.recoverStuck("dead-worker")).toBe(2);
    expect(sim.countByStatus("queued")).toBe(2);
  });

  it("التعافي يحرّر أقفال العامل الساقط", () => {
    const sim = new QueueSimulator();
    sim.enqueue({ type: "t", lockKey: "res:1" });
    sim.claim("dead-worker", ["t"]);
    expect(sim.locks.has("res:1")).toBe(true);

    sim.recoverStuck("dead-worker");
    expect(sim.locks.has("res:1")).toBe(false);
  });

  it("التعافي مايمسّش مهام العمال الأحياء", () => {
    const sim = new QueueSimulator();
    sim.enqueue({ type: "t" });
    sim.enqueue({ type: "t" });
    sim.claim("alive", ["t"]);
    sim.claim("dead", ["t"]);

    expect(sim.recoverStuck("dead")).toBe(1);
    expect(sim.countByStatus("running")).toBe(1);
  });

  it("المهمة المستنفدة محاولاتها تفشل بدل ما تدور", () => {
    const sim = new QueueSimulator();
    sim.enqueue({ type: "t", maxAttempts: 1 });
    sim.claim("dead", ["t"]);
    sim.recoverStuck("dead");

    expect(sim.countByStatus("failed")).toBe(1);
  });
});

describe("الضغط العكسي", () => {
  it("يرفض المهام منخفضة الأولوية عند الازدحام", () => {
    const sim = new QueueSimulator();
    for (let i = 0; i < 600; i++) sim.enqueue({ type: "t", priority: "normal" });

    expect(sim.enqueue({ type: "t", priority: "background" }).status).toBe("rejected");
    expect(sim.enqueue({ type: "t", priority: "critical" }).status).toBe("created");
  });
});

describe("دورة حياة كاملة", () => {
  it("مسار كامل: إدراج ← سحب ← تقدّم ← اكتمال", () => {
    const sim = new QueueSimulator();
    const created = sim.enqueue({ type: "t", priority: "high" });
    if (created.status !== "created") throw new Error("setup");

    const job = sim.claim("w1", ["t"])!;
    sim.reportProgress(job.id, 50);
    sim.saveCheckpoint(job.id, { half: true });
    sim.complete(job.id);

    const final = sim.jobs.get(job.id)!;
    expect(final.status).toBe("completed");
    expect(final.progress).toBe(100);
    expect(final.attempts).toBe(1);

    expect(sim.events.map((e) => e.type)).toEqual(["created", "started", "completed"]);
  });

  it("مسار الفشل الكامل: محاولتان ثم رسائل ميتة", () => {
    const sim = new QueueSimulator();
    sim.enqueue({ type: "t", maxAttempts: 2 });

    const a = sim.claim("w1", ["t"])!;
    sim.fail(a.id, new Error("503"));
    sim.advance(10 * 60 * 1000);

    const b = sim.claim("w1", ["t"])!;
    sim.fail(b.id, new Error("503"));

    expect(sim.deadLetters).toHaveLength(1);
    expect(sim.events.map((e) => e.type)).toEqual([
      "created",
      "started",
      "retrying",
      "started",
      "dead_lettered",
    ]);
  });
});
