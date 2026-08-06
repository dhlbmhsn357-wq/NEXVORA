/**
 * أحداث المعرفة — **وحدة نقية للأسماء والقرارات**.
 *
 * ## لماذا أحداث لا نداءات مباشرة
 *
 * لو مركز المعرفة نادى عقل المشروع مباشرةً عند كل تغيير، بقى المركز
 * بيعرف كل مستهلكيه — وإضافة مستهلك جديد بتفتح المركز للتعديل. الحدث
 * بيقلب الاتجاه: المركز بينشر ما حدث، والمهتمّ بيسمع.
 *
 * النشر بيمرّ من `platform_events` القائم (ترحيل ٠٠٦٣) — نفس اللي
 * بيستخدمه الطابور. مافيش ناقل تاني.
 */

export const KNOWLEDGE_EVENTS = {
  CREATED: "knowledge.created",
  UPDATED: "knowledge.updated",
  ARCHIVED: "knowledge.archived",
  DELETED: "knowledge.deleted",
  VERSION_CREATED: "knowledge.version_created",
  REVIEWED: "knowledge.reviewed",
  ROLLED_BACK: "knowledge.rolled_back",
  SOURCE_INGESTED: "knowledge.source_ingested",
  SOURCE_FAILED: "knowledge.source_failed",
  QUALITY_COMPUTED: "knowledge.quality_computed",
} as const;

export type KnowledgeEventType = (typeof KNOWLEDGE_EVENTS)[keyof typeof KNOWLEDGE_EVENTS];

export const EVENT_LABELS: Record<KnowledgeEventType, string> = {
  "knowledge.created": "أُضيفت معرفة",
  "knowledge.updated": "عُدِّلت معرفة",
  "knowledge.archived": "أُرشفت معرفة",
  "knowledge.deleted": "حُذفت معرفة",
  "knowledge.version_created": "إصدار جديد",
  "knowledge.reviewed": "روجِعت معرفة",
  "knowledge.rolled_back": "رجوع لإصدار سابق",
  "knowledge.source_ingested": "اكتمل استيراد مصدر",
  "knowledge.source_failed": "فشل استيراد مصدر",
  "knowledge.quality_computed": "حُسبت درجة الجودة",
};

export interface KnowledgeEvent {
  type: KnowledgeEventType;
  projectId: string;
  itemId?: string | null;
  sourceId?: string | null;
  actorId?: string | null;
  actorKind?: "user" | "worker" | "system";
  summary: string;
  payload?: Record<string, unknown>;
}

/**
 * الأحداث التي تستدعي إعادة النظر في مخرَجات المراحل التالية.
 *
 * مش كل حدث بيبطّل شيئًا: قراءة أو حساب جودة ما بيغيّروش المعرفة
 * نفسها. الأحداث دي بس هي اللي بتخلّي عقل المشروع أو وثيقة المتطلبات
 * «قديمة» وتحتاج إعادة توليد.
 */
const INVALIDATING: ReadonlySet<string> = new Set([
  KNOWLEDGE_EVENTS.CREATED,
  KNOWLEDGE_EVENTS.UPDATED,
  KNOWLEDGE_EVENTS.DELETED,
  KNOWLEDGE_EVENTS.ARCHIVED,
  KNOWLEDGE_EVENTS.ROLLED_BACK,
  KNOWLEDGE_EVENTS.SOURCE_INGESTED,
]);

export function invalidatesDownstream(type: KnowledgeEventType): boolean {
  return INVALIDATING.has(type);
}

/**
 * مفتاح إسقاط التكرار.
 *
 * استيراد مصدر واحد بيولّد عشرات الأحداث من نوع `created`. بدون
 * المفتاح ده، إشعار لكل عنصر. المفتاح بيجمّعهم على مستوى المصدر
 * والنوع، فالمستخدم بيشوف «اكتمل استيراد المستند» مرة واحدة.
 */
export function dedupeKeyFor(event: KnowledgeEvent): string {
  const scope = event.sourceId ?? event.itemId ?? event.projectId;
  return `${event.type}:${scope}`;
}

/** وصف مقروء يُكتب في الخط الزمني. */
export function describeEvent(event: KnowledgeEvent): string {
  return event.summary || EVENT_LABELS[event.type];
}
