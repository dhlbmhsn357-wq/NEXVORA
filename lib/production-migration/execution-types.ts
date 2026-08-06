/**
 * أنواع محرّك الترحيل الحقيقي (Enterprise Production Migration Engine) —
 * **وحدة نقية بلا I/O**.
 *
 * المرحلة ٦: تنفيذ الترحيل الحقيقي بأمان ١٠٠٪. Mission Critical:
 * Safe · Recoverable · Auditable · Incremental · Repeatable · Zero Data Loss.
 *
 * **لا يبدأ إلا بعد محاكاة معتمَدة وغير محظورة (المرحلة ٥) + نسخة احتياطية
 * إلزامية + اجتياز كل فحوص ما قبل التنفيذ.** ينفّذ على دفعات (Chunks)
 * مرتّبة بالتبعية، قابلة للاستئناف من آخر نقطة ناجحة.
 */

export type ExecutionStatus =
  | "draft" | "preflight" | "backing_up" | "ready" | "running"
  | "paused" | "completed" | "failed" | "rolling_back" | "rolled_back" | "aborted";

/** مرحلة التنفيذ الحالية (للعرض الحيّ). */
export type ExecutionPhase =
  | "idle" | "extract" | "transform" | "validate" | "load"
  | "relationships" | "constraints" | "business" | "finalize";

// ────────────────────────────────────────────────────────────
// فحوص ما قبل التنفيذ (Pre-Migration Validation)
// ────────────────────────────────────────────────────────────

export type PreflightKey =
  | "simulation_approved" | "migration_score" | "not_blocked" | "backup_exists"
  | "rollback_ready" | "database_available" | "storage_available" | "disk_space"
  | "memory_available" | "queues_ready" | "workers_ready" | "api_available";

export interface PreflightCheck {
  key: PreflightKey;
  label: string;
  passed: boolean;
  blocking: boolean;
  detail: string;
}

export interface PreflightInput {
  simulationApproved: boolean;
  simulationBlocked: boolean;
  migrationScore: number;
  minScore: number;
  backupExists: boolean;
  rollbackReady: boolean;
  databaseAvailable: boolean;
  storageAvailable: boolean;
  diskOk: boolean;
  memoryOk: boolean;
  queuesReady: boolean;
  workersReady: boolean;
  apiAvailable: boolean;
}

export interface PreflightResult {
  checks: PreflightCheck[];
  passed: boolean;
  blockers: string[];
}

// ────────────────────────────────────────────────────────────
// ترتيب التبعية + الدفعات (Dependency + Chunk)
// ────────────────────────────────────────────────────────────

export interface EntityCount {
  entity: string;
  label: string;
  rows: number;
}

export interface OrderedEntity {
  entity: string;
  label: string;
  rows: number;
  /** مرتبة التنفيذ (المرجعية/الأب أولًا). */
  order: number;
  /** مستوى التبعية — الكيانات بنفس المستوى تُنفَّذ بالتوازي. */
  level: number;
}

export interface DependencyPlan {
  ordered: OrderedEntity[];
  /** دورات مكتشفة كُسِرت لضمان تقدّم التنفيذ. */
  brokenCycles: string[][];
}

export interface ChunkTask {
  entity: string;
  label: string;
  taskOrder: number;
  level: number;
  chunkIndex: number;
  chunkSize: number;
  rowStart: number;
  rowEnd: number;
}

// ────────────────────────────────────────────────────────────
// نتيجة تنفيذ دفعة (Chunk)
// ────────────────────────────────────────────────────────────

export interface ChunkIssue {
  field: string;
  issueType: string;
  count: number;
}

export interface ChunkResult {
  processed: number;
  migrated: number;
  skipped: number;
  archived: number;
  failed: number;
  /** الصفوف المحوّلة الجاهزة للتحميل (تُسلَّم للوجهة). */
  loaded: Array<Record<string, string>>;
  issues: ChunkIssue[];
  /** تحقّق ما بعد الدفعة: هل عدد السجلات المحمَّلة يطابق المتوقّع؟ */
  countMatch: boolean;
}

// ────────────────────────────────────────────────────────────
// الاستعادة الحيّة من الأخطاء (Live Error Recovery)
// ────────────────────────────────────────────────────────────

export type ErrorClass = "transient" | "constraint" | "resource" | "data" | "unknown";
export type RecoveryAction = "retry" | "skip" | "review" | "abort";

export interface RecoveryDecision {
  errorClass: ErrorClass;
  action: RecoveryAction;
  reason: string;
  /** آمن للتطبيق تلقائيًا (بعد موافقة المدير) أم يحتاج مراجعة. */
  autoSafe: boolean;
}

// ────────────────────────────────────────────────────────────
// حزمة التراجع (Rollback Package)
// ────────────────────────────────────────────────────────────

export interface RollbackStep {
  entity: string;
  order: number; // عكسي: الأبناء قبل الآباء
  rowCount: number;
  action: "delete_migrated" | "restore_backup";
}

export interface RollbackPackage {
  steps: RollbackStep[];
  reverseOrder: string[];
  note: string;
}

// ────────────────────────────────────────────────────────────
// لقطة المراقبة الحيّة (Live Monitoring)
// ────────────────────────────────────────────────────────────

export interface MonitoringSnapshot {
  progress: number; // 0-100
  processedRows: number;
  remainingRows: number;
  speedRowsPerSec: number;
  currentEntity: string | null;
  currentChunk: number | null;
  estimatedFinishSeconds: number;
  errors: number;
  warnings: number;
  retries: number;
}

export interface MonitoringAlert {
  key: string;
  title: string;
  severity: "info" | "warning" | "critical";
  suggestion: string;
}

/** حدود ثابتة (أمان). */
export const PM_LIMITS = {
  defaultChunkSize: 1000,
  minChunkSize: 100,
  maxChunkSize: 10_000,
  defaultWorkers: 4,
  maxWorkers: 12,
  maxRetries: 3,
  staleLockMs: 120_000,
} as const;
