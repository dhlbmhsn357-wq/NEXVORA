import { createServiceClient } from "@/lib/supabase/service";
import {
  claimNextJob,
  completeJob,
  failJob,
  registerWorker,
  runMaintenance,
  stopWorker,
  workerHeartbeat,
} from "@/lib/queue/service";
import { handlerTypesForWorker, requireJobHandler } from "@/lib/queue/registry";
import type { JobRow } from "@/lib/queue/types";
import { buildJobContext, startHeartbeat } from "./context";

/**
 * وقت تشغيل العامل — عام تمامًا.
 *
 * **مافيهوش أي معرفة بأي نوع مهمة.** كل اللي بيعمله: يسأل السجل عن
 * الأنواع اللي بيخدمها نوع العامل ده، ويسحبها، وينفّذ المعالج المسجَّل.
 *
 * ده هو الشرط المعماري للمرحلة: إضافة عامل جديد لاحقًا = تسجيل معالج
 * جديد + متغيّر بيئة، **بدون لمس الملف ده إطلاقًا**.
 */

export interface WorkerConfig {
  /** نوع العامل — يحدّد أي أنواع مهام يخدم. */
  workerType: string;
  /** معرّف فريد لهذه النسخة. */
  workerKey: string;
  /** أقصى مهام متزامنة. */
  concurrency: number;
  /** فاصل السحب حين يكون الطابور فارغًا. */
  idlePollMs: number;
  /** فاصل النبضة. */
  heartbeatMs: number;
  /** مهلة الإيقاف الآمن قبل الخروج القسري. */
  shutdownGraceMs: number;
  version?: string;
}

export const DEFAULT_WORKER_CONFIG: Omit<WorkerConfig, "workerType" | "workerKey"> = {
  concurrency: 1,
  // ثانيتان: الطابور فارغ في الأغلب، والسحب المستمر بيحرق استعلامات
  // بلا فايدة. لما تكون فيه مهام، الحلقة بتسحب التالية فورًا بلا انتظار.
  idlePollMs: 2_000,
  heartbeatMs: 30_000,
  shutdownGraceMs: 120_000,
};

export class Worker {
  private running = false;
  private draining = false;
  private active = new Set<string>();
  private processed = 0;
  private failed = 0;
  private readonly client = createServiceClient();

  constructor(private readonly config: WorkerConfig) {}

  private get handledTypes(): string[] {
    return handlerTypesForWorker(this.config.workerType);
  }

  async start(): Promise<void> {
    const types = this.handledTypes;

    if (types.length === 0) {
      // فشل صريح مقصود: عامل بلا أنواع بيدور فاضي للأبد ويبدو سليمًا
      // في كل المقاييس — وهو أسوأ أنواع الأعطال.
      throw new Error(
        `مفيش أي معالج مسجّل لنوع العامل "${this.config.workerType}". ` +
          `تأكّد إن ملف المعالجات متسورد في handlers/index.ts.`
      );
    }

    await registerWorker(
      {
        workerKey: this.config.workerKey,
        workerType: this.config.workerType,
        handledTypes: types,
        concurrency: this.config.concurrency,
        hostname: process.env.HOSTNAME ?? undefined,
        version: this.config.version,
      },
      this.client
    );

    this.running = true;
    console.log(
      `[worker ${this.config.workerKey}] بدأ — ${types.length} نوع، تزامن ${this.config.concurrency}`
    );

    this.startHeartbeatLoop();
    await this.loop();
  }

  private startHeartbeatLoop(): void {
    const timer = setInterval(() => {
      if (!this.running) {
        clearInterval(timer);
        return;
      }
      void workerHeartbeat(
        this.config.workerKey,
        {
          status: this.draining ? "draining" : this.active.size > 0 ? "busy" : "idle",
          activeJobs: this.active.size,
          memoryMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
          jobsProcessed: this.processed,
          jobsFailed: this.failed,
        },
        this.client
      ).catch((err) => console.error("[worker] فشلت النبضة:", err));
    }, this.config.heartbeatMs);
  }

  private async loop(): Promise<void> {
    while (this.running) {
      if (this.draining || this.active.size >= this.config.concurrency) {
        await sleep(200);
        continue;
      }

      let job: JobRow | null = null;
      try {
        job = await claimNextJob(this.config.workerKey, this.handledTypes, this.client);
      } catch (err) {
        console.error("[worker] فشل السحب:", err);
        await sleep(this.config.idlePollMs);
        continue;
      }

      if (!job) {
        await sleep(this.config.idlePollMs);
        continue;
      }

      // بلا `await`: التزامن هو الهدف. المتابعة عبر `active`.
      void this.execute(job);
    }
  }

  private async execute(job: JobRow): Promise<void> {
    this.active.add(job.id);

    const handler = requireJobHandler(job.type);
    const controller = new AbortController();
    const stopHeartbeat = startHeartbeat(job.id, this.client, this.config.heartbeatMs / 2);

    // المهلة تُنفَّذ كإلغاء لا كرمي مباشر: المعالج ياخد فرصة ينظّف
    // بدل ما يتقطع في نص الكتابة.
    const timeout = setTimeout(() => controller.abort(), handler.timeoutMs);
    let timedOut = false;
    controller.signal.addEventListener("abort", () => {
      timedOut = true;
    });

    try {
      const ctx = buildJobContext(job, this.client, controller);
      const result = await handler.handler(ctx as never);

      // المعالج ممكن يكون خرج بسبب إلغاء — ساعتها المهمة اتحدّثت خلاص.
      if (await ctx.isCanceled()) {
        console.log(`[worker] المهمة ${job.id} اتلغت أثناء التنفيذ.`);
        return;
      }

      await completeJob(
        job.id,
        result?.result ?? null,
        { costUsd: result?.costUsd, workerId: this.config.workerKey },
        this.client
      );
      this.processed++;
    } catch (err) {
      this.failed++;
      const isTimeout = timedOut && controller.signal.aborted;
      await failJob(
        job.id,
        isTimeout ? new Error(`تجاوزت المهلة (${handler.timeoutMs} مللي ثانية)`) : err,
        { workerId: this.config.workerKey, isTimeout },
        this.client
      ).catch((e) => console.error("[worker] فشل تسجيل الفشل:", e));
    } finally {
      clearTimeout(timeout);
      stopHeartbeat();
      this.active.delete(job.id);
    }
  }

  /**
   * إيقاف آمن: يتوقّف عن السحب، وينهي الجاري، ويبقي النبضة حتى النهاية.
   *
   * القتل الفوري بيسيب مهام في `running` بلا عامل، وبتفضل معلّقة لحد ما
   * آلية التعافي تلقطها — تأخير بلا داعٍ للمستخدم.
   */
  async shutdown(reason = "إيقاف مطلوب"): Promise<void> {
    if (!this.running) return;
    console.log(`[worker ${this.config.workerKey}] بدء الإيقاف الآمن: ${reason}`);
    this.draining = true;

    const deadline = Date.now() + this.config.shutdownGraceMs;
    while (this.active.size > 0 && Date.now() < deadline) {
      await sleep(500);
    }

    if (this.active.size > 0) {
      console.warn(
        `[worker] انتهت مهلة الإيقاف و${this.active.size} مهمة لسه شغّالة — هتستعيدها آلية التعافي.`
      );
    }

    this.running = false;
    await stopWorker(this.config.workerKey, reason, this.client);
  }

  get stats() {
    return {
      running: this.running,
      draining: this.draining,
      active: this.active.size,
      processed: this.processed,
      failed: this.failed,
    };
  }
}

/**
 * المجدوِل — عملية مستقلة عن العمال.
 *
 * مسؤول عن استعادة المهام العالقة وترقية المؤجَّلة. **مستقل عن كل
 * استقصاء في المتصفح**، وعن `setInterval` في أي صفحة: ده الفرق بين
 * جدولة حقيقية وبين ما كان يحدث قبل المرحلة دي.
 *
 * نسخة واحدة تكفي — الازدواج بيعمل استعادة مكرّرة بلا ضرر لكنه هدر.
 */
export class Scheduler {
  private running = false;

  constructor(private readonly intervalMs = 30_000) {}

  start(): void {
    this.running = true;
    console.log(`[scheduler] بدأ — كل ${this.intervalMs / 1000} ثانية`);
    void this.loop();
  }

  stop(): void {
    this.running = false;
  }

  private async loop(): Promise<void> {
    while (this.running) {
      try {
        const { recovered, promoted } = await runMaintenance();
        if (recovered > 0) console.warn(`[scheduler] استُعيدت ${recovered} مهمة عالقة.`);
        if (promoted > 0) console.log(`[scheduler] رُقّيت ${promoted} مهمة مجدولة.`);
      } catch (err) {
        console.error("[scheduler] فشلت دورة الصيانة:", err);
      }
      await sleep(this.intervalMs);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
