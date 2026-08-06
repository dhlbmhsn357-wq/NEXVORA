import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import {
  KNOWLEDGE_EVENTS,
  dedupeKeyFor,
  describeEvent,
  type KnowledgeEvent,
  type KnowledgeEventType,
} from "./events";
import { canTransition, type KnowledgeStatus } from "./model";
import {
  decideVersion,
  planRollback,
  type ChangeKind,
  type VersionSnapshot,
  type VersionedField,
} from "./versioning";

/**
 * مستودع المعرفة — **البوابة الوحيدة للكتابة على `knowledge_items`**.
 *
 * ## لماذا بوابة واحدة
 *
 * الكتابة كانت موزّعة على أربعة ملفات، وكل موضع بيعدّل الصفّ مباشرةً.
 * النتيجة إن أي ضمانة جديدة — إصدار، خط زمني، حدث — كانت هتحتاج
 * تعديل كل موضع، والموضع اللي يتنسى بيكسر الضمانة بصمت.
 *
 * البوابة بتقلب ده: الضمانة بتتكتب مرة واحدة هنا، وأي مستدعٍ بياخدها
 * سواء عرف بيها أو لأ.
 *
 * ## الترتيب مقصود
 *
 *   ١. اللقطة قبل التعديل — لو التعديل فشل، التاريخ مافيهوش صفّ كاذب
 *   ٢. التعديل نفسه
 *   ٣. الخط الزمني ثم الحدث — قياس لا يُسقط عملية نجحت
 *
 * الخطوتان ٣ لا يرميان أبدًا: نجاح الكتابة اتحقّق خلاص، وفشل سجلّ
 * مايجوزش يتحوّل لفشل عملية.
 */

type DB = SupabaseClient;

// ============================================================
// الأنواع
// ============================================================

export interface ItemRow {
  id: string;
  project_id: string;
  title: string;
  content: string;
  category: string;
  tags: string[];
  confidence: number;
  status: string;
  version: number;
  content_hash: string | null;
  metadata: Record<string, unknown>;
}

const ITEM_FIELDS =
  "id, project_id, title, content, category, tags, confidence, status, version, content_hash, metadata";

export interface WriteContext {
  /**
   * اختياري في التعديل والانتقال والرجوع: البوابة بتقرأ الصفّ أصلًا
   * وفيه `project_id`. طلبه من المستدعي كان بيفتح باب تمرير مشروع
   * غلط ينتهي بخطّ زمني مكتوب في المكان الخطأ.
   *
   * مطلوب في الإنشاء وحده — مافيش صفّ يُقرأ منه بعد.
   */
  projectId?: string;
  actorId?: string | null;
  actorKind?: "user" | "worker" | "system";
  reason?: string | null;
}

export type WriteResult =
  | { status: "created"; itemId: string; version: number }
  | { status: "updated"; itemId: string; version: number; changed: VersionedField[] }
  | { status: "unchanged"; itemId: string; version: number; reason: string }
  | { status: "rejected"; reason: string };

// ============================================================
// الإنشاء
// ============================================================

export interface CreateItemInput {
  sourceId: string;
  chunkId?: string | null;
  batchId?: string | null;
  title: string;
  content: string;
  category: string;
  tags?: string[];
  confidence?: number;
  evidence?: unknown[];
  contentHash?: string | null;
  metadata?: Record<string, unknown>;
  importance?: number;
}

/**
 * ينشئ كائن معرفة ويكتب إصداره الأول.
 *
 * الإصدار الأول بيتسجّل زي أي إصدار تاني: بدونه، أول رجوع بيلاقي
 * تاريخًا ناقص الحلقة الأولى.
 */
export async function createItem(
  input: CreateItemInput,
  ctx: WriteContext & { projectId: string },
  client?: DB
): Promise<WriteResult> {
  const db = client ?? createServiceClient();

  const { data, error } = await db
    .from("knowledge_items")
    .insert({
      project_id: ctx.projectId,
      source_id: input.sourceId,
      chunk_id: input.chunkId ?? null,
      batch_id: input.batchId ?? null,
      title: input.title,
      content: input.content,
      category: input.category,
      tags: input.tags ?? [],
      confidence: input.confidence ?? 50,
      evidence: input.evidence ?? [],
      content_hash: input.contentHash ?? null,
      metadata: input.metadata ?? {},
      importance: input.importance ?? 50,
      version: 1,
      created_by: ctx.actorId ?? null,
      updated_by: ctx.actorId ?? null,
    })
    .select(ITEM_FIELDS)
    .single();

  if (error || !data) {
    return { status: "rejected", reason: error?.message ?? "فشل إنشاء عنصر المعرفة." };
  }

  const row = data as ItemRow;

  await recordVersion(db, row, "create", ctx.reason ?? "إنشاء", ctx.actorId ?? null);
  await trail(db, {
    type: KNOWLEDGE_EVENTS.CREATED,
    projectId: ctx.projectId,
    itemId: row.id,
    sourceId: input.sourceId,
    actorId: ctx.actorId,
    actorKind: ctx.actorKind ?? "worker",
    summary: `أُضيفت معرفة: ${truncate(input.title)}`,
  });

  return { status: "created", itemId: row.id, version: 1 };
}

// ============================================================
// التسجيل الجماعي
// ============================================================

/** الحد الأقصى لصفوف الإدراج الواحد — أطول من كده والطلب بيتقل. */
const VERSION_INSERT_CHUNK = 100;

export interface BulkCreatedItem {
  id: string;
  title: string;
  content: string;
  category: string;
  tags?: string[] | null;
  confidence?: number | null;
  content_hash?: string | null;
  metadata?: Record<string, unknown> | null;
}

/**
 * يسجّل إصدارات وخطًّا زمنيًا لدفعة عناصر أُدرجت جماعيًا.
 *
 * ## لماذا دالة منفصلة عن `createItem`
 *
 * الاستخراج والإثراء بيدرجوا عشرات العناصر في نداء واحد. تمريرهم على
 * `createItem` واحدًا واحدًا كان هيحوّل رحلة شبكة واحدة لخمسين — وده
 * بالظبط نمط N+1 اللي أسقط المنصة في تدقيق المرحلة الأولى.
 *
 * الدالة دي بتحافظ على الإدراج الجماعي كما هو، وبتضيف **إدراجًا
 * جماعيًا تانيًا** للإصدارات، وصفًّا واحدًا في الخط الزمني للدفعة
 * كلها. رحلتان بدل مئة.
 *
 * الخط الزمني بيسجّل **الدفعة لا كل عنصر**: خمسون صفًّا لرفعة واحدة
 * بتغرق السجل وتخفي الأحداث اللي يهمّ الإنسان يشوفها.
 */
export async function recordBulkCreation(
  input: {
    projectId: string;
    sourceId?: string | null;
    items: BulkCreatedItem[];
    actorId?: string | null;
    actorKind?: "user" | "worker" | "system";
    reason?: string;
  },
  client?: DB
): Promise<{ recorded: number }> {
  if (input.items.length === 0) return { recorded: 0 };

  const db = client ?? createServiceClient();
  let recorded = 0;

  const rows = input.items.map((item) => ({
    item_id: item.id,
    project_id: input.projectId,
    version: 1,
    title: item.title ?? "",
    content: item.content ?? "",
    category: item.category ?? "unknown",
    tags: item.tags ?? [],
    confidence: item.confidence ?? 50,
    metadata: item.metadata ?? {},
    content_hash: item.content_hash ?? null,
    change_kind: "create" as const,
    change_reason: input.reason ?? "إنشاء جماعي",
    created_by: input.actorId ?? null,
  }));

  for (let i = 0; i < rows.length; i += VERSION_INSERT_CHUNK) {
    try {
      const { error } = await db
        .from("knowledge_object_versions")
        .insert(rows.slice(i, i + VERSION_INSERT_CHUNK));
      if (!error) recorded += Math.min(VERSION_INSERT_CHUNK, rows.length - i);
    } catch (err) {
      // فشل تسجيل الإصدارات مايجوزش يبطّل عناصر اتكتبت بنجاح.
      console.error("[knowledge-hub] تعذّر تسجيل إصدارات الدفعة:", err);
    }
  }

  await trail(db, {
    type: KNOWLEDGE_EVENTS.CREATED,
    projectId: input.projectId,
    sourceId: input.sourceId ?? null,
    actorId: input.actorId,
    actorKind: input.actorKind ?? "worker",
    summary: `أُضيف ${input.items.length} عنصر معرفة`,
    payload: { count: input.items.length, versionsRecorded: recorded },
  });

  return { recorded };
}

/**
 * يسجّل تغييرًا جماعيًا في الحالة (دمج تكرار، أرشفة، حذف).
 *
 * مافيش إصدارات هنا: الحالة مش من حقول الإصدار، وتغييرها بيتوثّق في
 * الخط الزمني بس. تسجيل إصدار لكل تغيير حالة كان هيضاعف التاريخ بلا
 * أي فرق في المحتوى.
 */
export async function recordBulkTransition(
  input: {
    projectId: string;
    itemIds: string[];
    to: KnowledgeStatus | string;
    actorId?: string | null;
    actorKind?: "user" | "worker" | "system";
    summary: string;
  },
  client?: DB
): Promise<void> {
  if (input.itemIds.length === 0) return;

  await trail(client ?? createServiceClient(), {
    type: input.to === "archived" ? KNOWLEDGE_EVENTS.ARCHIVED : KNOWLEDGE_EVENTS.UPDATED,
    projectId: input.projectId,
    actorId: input.actorId,
    actorKind: input.actorKind ?? "worker",
    summary: input.summary,
    payload: { count: input.itemIds.length, to: input.to },
  });
}

// ============================================================
// التعديل
// ============================================================

export interface UpdateItemInput {
  title?: string;
  content?: string;
  category?: string;
  tags?: string[];
  confidence?: number;
  importance?: number;
  metadata?: Record<string, unknown>;
}

/**
 * يعدّل كائن معرفة — **بلقطة قبل التعديل**.
 *
 * التعديل بلا تغيير فعلي بيرجّع `unchanged` بلا صفّ إصدار. إعادة
 * تشغيل الإثراء بتنتج نفس الناتج في الأغلب، وتسجيل إصدار لكل تشغيل
 * كان هيملأ التاريخ بضجيج يخفي التغييرات الحقيقية.
 */
export async function updateItem(
  itemId: string,
  patch: UpdateItemInput,
  ctx: WriteContext,
  client?: DB
): Promise<WriteResult> {
  const db = client ?? createServiceClient();

  const current = await readItem(db, itemId);
  if (!current) return { status: "rejected", reason: "عنصر المعرفة مش موجود." };

  const next = {
    title: patch.title ?? current.title,
    content: patch.content ?? current.content,
    category: patch.category ?? current.category,
    tags: patch.tags ?? current.tags,
    confidence: patch.confidence ?? current.confidence,
  };

  const decision = decideVersion({
    current: {
      title: current.title,
      content: current.content,
      category: current.category,
      tags: current.tags,
      confidence: current.confidence,
    },
    next,
    currentVersion: current.version,
  });

  if (decision.action === "skip") {
    // الأهمية والبيانات الوصفية مش من حقول الإصدار: تغييرها لوحده
    // يستحق كتابة، لكنه مايستحقش إصدارًا.
    if (patch.importance !== undefined || patch.metadata !== undefined) {
      await db
        .from("knowledge_items")
        .update({
          ...(patch.importance !== undefined ? { importance: patch.importance } : {}),
          ...(patch.metadata !== undefined ? { metadata: patch.metadata } : {}),
          updated_by: ctx.actorId ?? null,
        })
        .eq("id", itemId);
    }
    return { status: "unchanged", itemId, version: current.version, reason: decision.reason };
  }

  // اللقطة **قبل** التعديل: لو التعديل فشل، التاريخ مافيهوش صفّ كاذب.
  await recordVersion(db, current, "update", ctx.reason ?? decision.reason, ctx.actorId ?? null);

  const { error } = await db
    .from("knowledge_items")
    .update({
      ...next,
      ...(patch.importance !== undefined ? { importance: patch.importance } : {}),
      ...(patch.metadata !== undefined ? { metadata: patch.metadata } : {}),
      version: decision.version,
      updated_by: ctx.actorId ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", itemId);

  if (error) return { status: "rejected", reason: error.message };

  await trail(db, {
    type: KNOWLEDGE_EVENTS.UPDATED,
    projectId: current.project_id,
    itemId,
    actorId: ctx.actorId,
    actorKind: ctx.actorKind ?? "user",
    summary: `عُدِّلت معرفة: ${decision.reason}`,
    payload: { changed: decision.changed, version: decision.version },
  });

  return { status: "updated", itemId, version: decision.version, changed: decision.changed };
}

// ============================================================
// تغيير الحالة
// ============================================================

/**
 * ينقل عنصرًا لحالة جديدة عبر آلة الحالات.
 *
 * الانتقال غير المسموح **يُرفض لا يُنفَّذ**: لو الكود طلب انتقالًا
 * مستحيلًا، ده خطأ برمجي — تنفيذه بيخفيه، ورفضه بيكشفه.
 */
export async function transitionItem(
  itemId: string,
  to: KnowledgeStatus,
  ctx: WriteContext,
  client?: DB
): Promise<WriteResult> {
  const db = client ?? createServiceClient();

  const current = await readItem(db, itemId);
  if (!current) return { status: "rejected", reason: "عنصر المعرفة مش موجود." };

  const from = current.status as KnowledgeStatus;
  if (!canTransition(from, to)) {
    return { status: "rejected", reason: `انتقال غير مسموح: ${from} ← ${to}.` };
  }

  const isReview = to === "verified" || to === "rejected";

  const { error } = await db
    .from("knowledge_items")
    .update({
      status: to,
      updated_by: ctx.actorId ?? null,
      ...(isReview
        ? { reviewed_at: new Date().toISOString(), reviewed_by: ctx.actorId ?? null }
        : {}),
    })
    .eq("id", itemId);

  if (error) return { status: "rejected", reason: error.message };

  await trail(db, {
    type: eventForStatus(to),
    projectId: current.project_id,
    itemId,
    actorId: ctx.actorId,
    actorKind: ctx.actorKind ?? "user",
    summary: `الحالة: ${from} ← ${to}`,
    payload: { from, to, reason: ctx.reason ?? null },
  });

  return { status: "updated", itemId, version: current.version, changed: [] };
}

function eventForStatus(to: KnowledgeStatus): KnowledgeEventType {
  if (to === "archived") return KNOWLEDGE_EVENTS.ARCHIVED;
  if (to === "deleted") return KNOWLEDGE_EVENTS.DELETED;
  if (to === "verified" || to === "rejected") return KNOWLEDGE_EVENTS.REVIEWED;
  return KNOWLEDGE_EVENTS.UPDATED;
}

// ============================================================
// الرجوع
// ============================================================

/**
 * يرجع بعنصر لإصدار سابق.
 *
 * الرجوع **بيكتب إصدارًا جديدًا** بمحتوى القديم — ما بيمسحش اللي بعده.
 * التاريخ بيفضل كامل، ويبان إن فيه رجوع حصل وإمتى ومين عمله. مسح
 * الإصدارات كان هيخلّي الرجوع نفسه غير قابل للتدقيق.
 */
export async function rollbackItem(
  itemId: string,
  targetVersion: number,
  ctx: WriteContext,
  client?: DB
): Promise<WriteResult> {
  const db = client ?? createServiceClient();

  const current = await readItem(db, itemId);
  if (!current) return { status: "rejected", reason: "عنصر المعرفة مش موجود." };

  const { data } = await db
    .from("knowledge_object_versions")
    .select("*")
    .eq("item_id", itemId)
    .eq("version", targetVersion)
    .maybeSingle();

  const plan = planRollback({
    target: data ? rowToSnapshot(data as Record<string, unknown>) : null,
    currentVersion: current.version,
  });

  if (!plan.ok) return { status: "rejected", reason: plan.reason };

  // لقطة للحالة الحالية قبل ما تُستبدل — وإلا الرجوع نفسه غير قابل
  // للرجوع.
  await recordVersion(db, current, "rollback", plan.reason, ctx.actorId ?? null);

  const { error } = await db
    .from("knowledge_items")
    .update({
      ...plan.restore,
      version: plan.newVersion,
      updated_by: ctx.actorId ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", itemId);

  if (error) return { status: "rejected", reason: error.message };

  await trail(db, {
    type: KNOWLEDGE_EVENTS.ROLLED_BACK,
    projectId: current.project_id,
    itemId,
    actorId: ctx.actorId,
    actorKind: ctx.actorKind ?? "user",
    summary: plan.reason,
    payload: { targetVersion, newVersion: plan.newVersion },
  });

  return { status: "updated", itemId, version: plan.newVersion, changed: [] };
}

// ============================================================
// القراءة
// ============================================================

export async function readItem(db: DB, itemId: string): Promise<ItemRow | null> {
  const { data } = await db.from("knowledge_items").select(ITEM_FIELDS).eq("id", itemId).maybeSingle();
  return (data as ItemRow) ?? null;
}

export async function listVersions(
  itemId: string,
  client?: DB
): Promise<VersionSnapshot[]> {
  const db = client ?? createServiceClient();
  const { data } = await db
    .from("knowledge_object_versions")
    .select("*")
    .eq("item_id", itemId)
    .order("version", { ascending: false });

  return ((data ?? []) as Array<Record<string, unknown>>).map(rowToSnapshot);
}

export interface TimelineEntry {
  id: number;
  eventType: string;
  actorId: string | null;
  actorKind: string;
  summary: string;
  details: Record<string, unknown>;
  createdAt: Date;
}

export async function listTimeline(
  projectId: string,
  options: { limit?: number; itemId?: string } = {},
  client?: DB
): Promise<TimelineEntry[]> {
  const db = client ?? createServiceClient();

  let query = db
    .from("knowledge_timeline")
    .select("id, event_type, actor_id, actor_kind, summary, details, created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(options.limit ?? 50);

  if (options.itemId) query = query.eq("item_id", options.itemId);

  const { data } = await query;

  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: Number(row.id),
    eventType: String(row.event_type),
    actorId: (row.actor_id as string) ?? null,
    actorKind: String(row.actor_kind ?? "system"),
    summary: String(row.summary ?? ""),
    details: (row.details as Record<string, unknown>) ?? {},
    createdAt: new Date(row.created_at as string),
  }));
}

// ============================================================
// الداخلي
// ============================================================

async function recordVersion(
  db: DB,
  row: ItemRow,
  changeKind: ChangeKind,
  reason: string | null,
  actorId: string | null
): Promise<void> {
  try {
    await db.from("knowledge_object_versions").insert({
      item_id: row.id,
      project_id: row.project_id,
      version: row.version,
      title: row.title,
      content: row.content,
      category: row.category,
      tags: row.tags,
      confidence: row.confidence,
      metadata: row.metadata,
      content_hash: row.content_hash,
      change_kind: changeKind,
      change_reason: reason,
      created_by: actorId,
    });
  } catch (err) {
    // التصادم على (item_id, version) معناه إن الإصدار متسجّل خلاص —
    // إعادة تشغيل أو نداء مكرَّر. مش خطأ يوقف العملية.
    console.error("[knowledge-hub] تعذّر تسجيل الإصدار:", err);
  }
}

/**
 * يكتب الخط الزمني وينشر الحدث.
 *
 * **لا يرمي أبدًا.** الكتابة الأساسية نجحت خلاص، وفشل سجلّ مايجوزش
 * يتحوّل لفشل عملية — نفس القاعدة اللي اتعلّمناها في بوابة الذكاء
 * الاصطناعي لما فشل حفظ الأرشيف كان بيضيّع نداءً اتدفع تمنه.
 */
async function trail(db: DB, event: KnowledgeEvent): Promise<void> {
  try {
    await db.from("knowledge_timeline").insert({
      project_id: event.projectId,
      item_id: event.itemId ?? null,
      source_id: event.sourceId ?? null,
      event_type: event.type,
      actor_id: event.actorId ?? null,
      actor_kind: event.actorKind ?? "system",
      summary: describeEvent(event),
      details: event.payload ?? {},
    });
  } catch (err) {
    console.error("[knowledge-hub] تعذّر كتابة الخط الزمني:", err);
  }

  // الكتابة في `platform_events` مباشرةً لا عبر `emitEvent`.
  //
  // `emitEvent` بياخد `EventType` — اتحاد مغلق لأحداث الأتمتة، ومربوط
  // بمحرّك قواعد بيطابق كل حدث. توسيع الاتحاد بأحداث المعرفة كان
  // هيجرّ المحرّك ده معاه بلا أي قاعدة تستهلكه.
  //
  // الجدول واحد — فالمستهلك المستقبلي هيلاقي الأحداث في مكانها الطبيعي.
  try {
    await db.from("platform_events").insert({
      event_type: event.type,
      project_id: event.projectId,
      actor_id: event.actorId ?? null,
      dedupe_key: dedupeKeyFor(event),
      payload: {
        itemId: event.itemId ?? null,
        sourceId: event.sourceId ?? null,
        summary: describeEvent(event),
        ...(event.payload ?? {}),
      },
    });
  } catch (err) {
    console.error("[knowledge-hub] تعذّر نشر الحدث:", err);
  }
}

function rowToSnapshot(row: Record<string, unknown>): VersionSnapshot {
  return {
    itemId: String(row.item_id),
    version: Number(row.version),
    title: String(row.title ?? ""),
    content: String(row.content ?? ""),
    category: String(row.category ?? "unknown"),
    tags: (row.tags as string[]) ?? [],
    confidence: Number(row.confidence ?? 50),
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    contentHash: (row.content_hash as string) ?? null,
    changeKind: (row.change_kind as ChangeKind) ?? "update",
    changeReason: (row.change_reason as string) ?? null,
    createdBy: (row.created_by as string) ?? null,
    createdAt: new Date(row.created_at as string),
  };
}

function truncate(text: string, max = 60): string {
  return text.length <= max ? text : `${text.slice(0, max)}…`;
}
