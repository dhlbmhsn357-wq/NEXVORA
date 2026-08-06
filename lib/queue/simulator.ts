import { assertTransition, canCancel } from "./state-machine";
import { decideRetry } from "./retry-policy";
import { comparePriority, decideAdmission } from "./priority";
import type { JobPriority, JobStatus } from "./types";

/**
 * محاكي الطابور في الذاكرة — أداة اختبار وقياس، لا مسار إنتاج.
 *
 * **لماذا موجود:** السلوك الحقيقي للطابور (الترتيب، السباق، القفل،
 * إسقاط التكرار، الاستئناف، الرسائل الميتة) لا يمكن التحقّق منه
 * بوحدات نقية منفصلة — هو ناتج **تفاعلها**. والاختبار على قاعدة
 * بيانات حقيقية يجعل الاختبارات بطيئة وهشّة ومعتمدة على الشبكة.
 *
 * المحاكي بيستخدم **نفس وحدات القرار** المستخدمة في الإنتاج
 * (`state-machine` · `retry-policy` · `priority`)، فاختبار المنطق هنا
 * اختبار للمنطق الحقيقي فعلًا. اللي بيحاكيه هو التخزين والذرّية فقط.
 *
 * **ما لا يثبته:** أداء PostgreSQL، وسلوك `SKIP LOCKED` تحت تزامن
 * حقيقي، وزمن الشبكة. دي محتاجة قياسًا على قاعدة حقيقية.
 */

export interface SimJob {
  id: string;
  type: string;
  status: JobStatus;
  priority: JobPriority;
  payload: Record<string, unknown>;
  checkpoint: Record<string, unknown> | null;
  progress: number;
  attempts: number;
  maxAttempts: number;
  lockKey: string | null;
  dedupeHash: string | null;
  idempotencyKey: string | null;
  workerId: string | null;
  availableAt: number;
  createdAt: number;
  error: string | null;
}

const ALIVE: JobStatus[] = ["pending", "queued", "waiting", "running", "retrying", "paused"];

export class QueueSimulator {
  readonly jobs = new Map<string, SimJob>();
  readonly deadLetters: SimJob[] = [];
  readonly locks = new Map<string, string>(); // lockKey → jobId
  readonly idempotency = new Map<string, string>(); // key → jobId
  readonly events: Array<{ type: string; jobId: string }> = [];

  private seq = 0;
  now: number;
  private readonly enforceBackpressure: boolean;

  /**
   * @param options.enforceBackpressure افتراضيًا `true` — نفس سلوك
   *   الإنتاج. القياس بيطفّيه عن قصد: الضغط العكسي بيرفض المهام
   *   منخفضة الأولوية بعد ٥٠٠، فقياس "٥٠٠٠ مهمة" كان هيقيس ٢٠٠٠
   *   فعليًا ويطلّع رقمًا مضلِّلًا.
   */
  constructor(startTime = 0, options: { enforceBackpressure?: boolean } = {}) {
    this.now = startTime;
    this.enforceBackpressure = options.enforceBackpressure ?? true;
  }

  advance(ms: number): void {
    this.now += ms;
  }

  private nextId(): string {
    this.seq += 1;
    return `job-${this.seq}`;
  }

  // ------------------------------------------------------------
  // الإدراج
  // ------------------------------------------------------------

  enqueue(input: {
    type: string;
    priority?: JobPriority;
    payload?: Record<string, unknown>;
    maxAttempts?: number;
    lockKey?: string | null;
    dedupeHash?: string | null;
    idempotencyKey?: string | null;
  }):
    | { status: "created"; job: SimJob }
    | { status: "deduplicated"; job: SimJob }
    | { status: "idempotent_replay"; job: SimJob }
    | { status: "rejected"; reason: string } {
    // ترتيب الفحوص مطابق للخدمة الحقيقية: Idempotency أولًا، لأن رفض
    // إعادة محاولة لعملية نجحت بالفعل خطأ صريح.
    if (input.idempotencyKey) {
      const existingId = this.idempotency.get(input.idempotencyKey);
      if (existingId) {
        const job = this.jobs.get(existingId);
        if (job) return { status: "idempotent_replay", job };
      }
    }

    const priority = input.priority ?? "normal";
    if (this.enforceBackpressure) {
      const admission = decideAdmission(this.queueDepth(), priority);
      if (!admission.admit) return { status: "rejected", reason: admission.reason };
    }

    if (input.dedupeHash) {
      const alive = [...this.jobs.values()].find(
        (j) => j.dedupeHash === input.dedupeHash && ALIVE.includes(j.status)
      );
      if (alive) return { status: "deduplicated", job: alive };
    }

    const job: SimJob = {
      id: this.nextId(),
      type: input.type,
      status: "queued",
      priority,
      payload: input.payload ?? {},
      checkpoint: null,
      progress: 0,
      attempts: 0,
      maxAttempts: input.maxAttempts ?? 3,
      lockKey: input.lockKey ?? null,
      dedupeHash: input.dedupeHash ?? null,
      idempotencyKey: input.idempotencyKey ?? null,
      workerId: null,
      availableAt: this.now,
      createdAt: this.now,
      error: null,
    };

    this.jobs.set(job.id, job);
    if (input.idempotencyKey) this.idempotency.set(input.idempotencyKey, job.id);
    this.events.push({ type: "created", jobId: job.id });

    return { status: "created", job };
  }

  // ------------------------------------------------------------
  // المطالبة — تحاكي `for update skip locked`
  // ------------------------------------------------------------

  /**
   * تسحب المهمة التالية ذرّيًا.
   *
   * الذرّية هنا مضمونة بأن JavaScript أحادي الخيط داخل الدالة: مفيش
   * `await` بين الاختيار والتحديث، فمستحيل عاملان ياخدوا نفس المهمة.
   * ده بالظبط اللي `SKIP LOCKED` بيضمنه في PostgreSQL.
   */
  claim(workerId: string, types: string[]): SimJob | null {
    const candidates = [...this.jobs.values()]
      .filter(
        (j) =>
          j.status === "queued" &&
          j.availableAt <= this.now &&
          types.includes(j.type) &&
          (j.lockKey === null || !this.locks.has(j.lockKey))
      )
      .sort((a, b) => {
        const byPriority = comparePriority(a.priority, b.priority);
        if (byPriority !== 0) return byPriority;
        if (a.availableAt !== b.availableAt) return a.availableAt - b.availableAt;
        return a.createdAt - b.createdAt;
      });

    const job = candidates[0];
    if (!job) return null;

    assertTransition(job.status, "running");
    if (job.lockKey) this.locks.set(job.lockKey, job.id);

    job.status = "running";
    job.workerId = workerId;
    job.attempts += 1;
    this.events.push({ type: "started", jobId: job.id });

    return job;
  }

  // ------------------------------------------------------------
  // إنهاء التنفيذ
  // ------------------------------------------------------------

  complete(jobId: string): void {
    const job = this.jobs.get(jobId);
    if (!job) return;
    assertTransition(job.status, "completed");
    job.status = "completed";
    job.progress = 100;
    job.workerId = null;
    this.releaseLock(job);
    this.events.push({ type: "completed", jobId });
  }

  fail(jobId: string, error: Error, random: () => number = () => 0.5): void {
    const job = this.jobs.get(jobId);
    if (!job) return;

    const decision = decideRetry({
      error,
      attemptsMade: job.attempts,
      maxAttempts: job.maxAttempts,
      now: new Date(this.now),
      random,
    });

    this.releaseLock(job);
    job.error = error.message;
    job.workerId = null;

    if (decision.action === "retry") {
      job.status = "queued";
      job.availableAt = this.now + decision.delayMs;
      this.events.push({ type: "retrying", jobId });
      return;
    }

    job.status = "dead_letter";
    this.deadLetters.push({ ...job });
    this.events.push({ type: "dead_lettered", jobId });
  }

  cancel(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    if (!job || !canCancel(job.status)) return false;
    job.status = "canceled";
    job.workerId = null;
    this.releaseLock(job);
    this.events.push({ type: "canceled", jobId });
    return true;
  }

  saveCheckpoint(jobId: string, checkpoint: Record<string, unknown>): void {
    const job = this.jobs.get(jobId);
    if (job) job.checkpoint = checkpoint;
  }

  reportProgress(jobId: string, percent: number): void {
    const job = this.jobs.get(jobId);
    if (job) job.progress = Math.max(0, Math.min(100, percent));
  }

  /**
   * تستعيد المهام العالقة — تحاكي `recover_stuck_jobs`.
   *
   * ده الحارس ضد العطل اللي أسقط المنصة: عامل يسقط وهو ماسك مهام،
   * فتفضل في "جاري التنفيذ" للأبد بلا كاشف.
   */
  recoverStuck(workerId: string): number {
    let count = 0;
    for (const job of this.jobs.values()) {
      if (job.status === "running" && job.workerId === workerId) {
        job.status = job.attempts >= job.maxAttempts ? "failed" : "queued";
        job.workerId = null;
        job.availableAt = this.now;
        this.releaseLock(job);
        count += 1;
      }
    }
    return count;
  }

  private releaseLock(job: SimJob): void {
    if (job.lockKey && this.locks.get(job.lockKey) === job.id) this.locks.delete(job.lockKey);
  }

  queueDepth(): number {
    return [...this.jobs.values()].filter((j) =>
      ["pending", "queued", "waiting", "retrying"].includes(j.status)
    ).length;
  }

  countByStatus(status: JobStatus): number {
    return [...this.jobs.values()].filter((j) => j.status === status).length;
  }
}
