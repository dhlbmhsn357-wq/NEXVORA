import { describe, it, expect } from "vitest";
import {
  ALLOWED_TRANSITIONS,
  InvalidTransitionError,
  assertTransition,
  canCancel,
  canDeadLetter,
  canPause,
  canResume,
  canTransition,
} from "./state-machine";
import { TERMINAL_STATUSES, isActiveStatus, isTerminalStatus, type JobStatus } from "./types";

const ALL: JobStatus[] = [
  "pending",
  "queued",
  "waiting",
  "running",
  "retrying",
  "paused",
  "canceled",
  "completed",
  "failed",
  "dead_letter",
  "timeout",
];

describe("آلة الحالة — المسار السعيد", () => {
  it("المسار الكامل من الإنشاء للاكتمال", () => {
    expect(canTransition("pending", "queued")).toBe(true);
    expect(canTransition("queued", "running")).toBe(true);
    expect(canTransition("running", "completed")).toBe(true);
  });

  it("مسار إعادة المحاولة يعود للطابور", () => {
    expect(canTransition("running", "retrying")).toBe(true);
    expect(canTransition("retrying", "queued")).toBe(true);
  });

  it("مسار الرسائل الميتة بعد استنفاد المحاولات", () => {
    expect(canTransition("retrying", "dead_letter")).toBe(true);
    expect(canTransition("failed", "dead_letter")).toBe(true);
  });

  it("المهلة تُعامَل كفشل قابل لإعادة المحاولة", () => {
    // `timeout` منفصلة عن `failed` في القياس، لكنها تستحق إعادة محاولة:
    // المهمة اللي مامخلّصتش في وقتها ممكن تخلّص في محاولة أهدأ.
    expect(canTransition("running", "timeout")).toBe(true);
    expect(canTransition("timeout", "retrying")).toBe(true);
  });
});

describe("آلة الحالة — الحالات النهائية", () => {
  it("مفيش طريق رجوع للتنفيذ من أي حالة نهائية", () => {
    // الثابت الحقيقي مش "صفر انتقالات" — `failed` ليها انتقال إداري
    // واحد للأرشفة. الثابت اللي بيهمّ: **مستحيل ترجع تشتغل تاني**.
    // ولولا التمييز ده، مهمة فاشلة ممكن ترجع للطابور وتدور بلا نهاية.
    const EXECUTING: JobStatus[] = ["queued", "running", "retrying", "waiting", "pending"];

    for (const start of TERMINAL_STATUSES) {
      const seen = new Set<JobStatus>([start]);
      const stack: JobStatus[] = [start];

      while (stack.length > 0) {
        const current = stack.pop()!;
        for (const next of ALLOWED_TRANSITIONS[current]) {
          expect(EXECUTING, `${start} بترجع للتنفيذ عبر ${next}`).not.toContain(next);
          if (!seen.has(next)) {
            seen.add(next);
            stack.push(next);
          }
        }
      }
    }
  });

  it("النهايات الحقيقية بلا أي انتقال", () => {
    for (const status of ["completed", "canceled", "dead_letter"] as JobStatus[]) {
      expect(ALLOWED_TRANSITIONS[status]).toHaveLength(0);
    }
  });

  it("المهمة المكتملة ماتعودش تشتغل", () => {
    // ده مش تشدّد: العودة معناها نتيجة تُكتب مرتين.
    expect(canTransition("completed", "running")).toBe(false);
    expect(canTransition("completed", "queued")).toBe(false);
    expect(canTransition("completed", "retrying")).toBe(false);
  });

  it("المهمة الملغاة ماتُستأنفش", () => {
    expect(canTransition("canceled", "queued")).toBe(false);
    expect(canTransition("canceled", "running")).toBe(false);
  });

  it("الرسائل الميتة نهاية الطريق داخل نفس المهمة", () => {
    for (const target of ALL) {
      expect(canTransition("dead_letter", target)).toBe(false);
    }
  });
});

describe("آلة الحالة — الرفض", () => {
  it("الانتقال لنفس الحالة مرفوض", () => {
    for (const status of ALL) {
      expect(canTransition(status, status)).toBe(false);
    }
  });

  it("القفز من الطابور للاكتمال مرفوض", () => {
    // مهمة تكتمل من غير ما تشتغل معناها نتيجة بلا تنفيذ.
    expect(canTransition("queued", "completed")).toBe(false);
  });

  it("assertTransition بيرمي بخطأ يحمل الطرفين", () => {
    try {
      assertTransition("completed", "running");
      expect.unreachable("المفروض يرمي");
    } catch (err) {
      expect(err).toBeInstanceOf(InvalidTransitionError);
      expect((err as InvalidTransitionError).from).toBe("completed");
      expect((err as InvalidTransitionError).to).toBe("running");
    }
  });

  it("assertTransition مابيرميش على انتقال صحيح", () => {
    expect(() => assertTransition("queued", "running")).not.toThrow();
  });
});

describe("آلة الحالة — الإلغاء", () => {
  it("الإلغاء متاح من كل حالة حيّة", () => {
    for (const status of ALL.filter(isActiveStatus)) {
      expect(canCancel(status)).toBe(true);
      expect(canTransition(status, "canceled")).toBe(true);
    }
  });

  it("الإلغاء ممنوع على أي حالة نهائية", () => {
    for (const status of TERMINAL_STATUSES) {
      expect(canCancel(status)).toBe(false);
    }
  });
});

describe("آلة الحالة — الإيقاف والاستئناف", () => {
  it("الإيقاف من الطابور أو التنفيذ فقط", () => {
    expect(canPause("queued")).toBe(true);
    expect(canPause("running")).toBe(true);
    expect(canPause("pending")).toBe(false);
    expect(canPause("completed")).toBe(false);
  });

  it("الاستئناف من الإيقاف فقط", () => {
    expect(canResume("paused")).toBe(true);
    for (const status of ALL.filter((s) => s !== "paused")) {
      expect(canResume(status)).toBe(false);
    }
  });

  it("الموقوفة ترجع للطابور لا للتنفيذ مباشرة", () => {
    // العامل هو اللي بيسحب — الانتقال المباشر للتنفيذ بيتخطّى المطالبة
    // الذرّية، وده بيسمح لعاملين بأخذ نفس المهمة.
    expect(canTransition("paused", "queued")).toBe(true);
    expect(canTransition("paused", "running")).toBe(false);
  });
});

describe("آلة الحالة — الرسائل الميتة", () => {
  it("متاحة من الفشل وإعادة المحاولة والمهلة", () => {
    expect(canDeadLetter("failed")).toBe(true);
    expect(canDeadLetter("retrying")).toBe(true);
    expect(canDeadLetter("timeout")).toBe(true);
  });

  it("غير متاحة من النجاح أو الإلغاء", () => {
    expect(canDeadLetter("completed")).toBe(false);
    expect(canDeadLetter("canceled")).toBe(false);
    expect(canDeadLetter("running")).toBe(false);
  });
});

describe("آلة الحالة — الثبات البنيوي", () => {
  it("كل حالة معرَّفة في الخريطة", () => {
    for (const status of ALL) {
      expect(ALLOWED_TRANSITIONS[status]).toBeDefined();
    }
  });

  it("كل هدف انتقال حالة صالحة", () => {
    for (const [, targets] of Object.entries(ALLOWED_TRANSITIONS)) {
      for (const target of targets) {
        expect(ALL).toContain(target);
      }
    }
  });

  it("كل حالة حيّة تقدر توصل لحالة نهائية", () => {
    // بحث بالعرض: أي حالة حيّة مالهاش طريق لنهاية معناها مهمة تعلق للأبد.
    for (const start of ALL.filter(isActiveStatus)) {
      const seen = new Set<JobStatus>([start]);
      const queue: JobStatus[] = [start];
      let reachedTerminal = false;

      while (queue.length > 0) {
        const current = queue.shift()!;
        if (isTerminalStatus(current)) {
          reachedTerminal = true;
          break;
        }
        for (const next of ALLOWED_TRANSITIONS[current]) {
          if (!seen.has(next)) {
            seen.add(next);
            queue.push(next);
          }
        }
      }

      expect(reachedTerminal, `${start} مالهاش طريق لحالة نهائية`).toBe(true);
    }
  });
});
