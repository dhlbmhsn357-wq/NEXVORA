/**
 * النموذج الموحّد للمعرفة — **وحدة نقية بلا أي I/O**.
 *
 * ## لماذا نموذج واحد لكل المصادر
 *
 * المواصفة منعت أي مرحلة من الاعتماد على «اجتماع» أو «ملف PDF» مباشرةً.
 * السبب عملي لا تنظيمي: كل مرحلة تعرف مصادرها تعني أن إضافة مصدر جديد
 * تفتح كل المراحل للتعديل. النموذج الموحّد بيقلب المعادلة — المصدر
 * الجديد بيتحوّل لكائن معرفة، وكل المراحل بتشوفه بلا ما تعرف من فين جه.
 *
 * الملف ده **لا يحتوي أي استعلام**: كله أنواع ودوال قرار، فالاختبار
 * بيغطّيه بلا قاعدة بيانات.
 */

// ============================================================
// أنواع المصادر
// ============================================================

/**
 * أنواع المصادر المدعومة.
 *
 * مفتوحة عن قصد (`string` مش اتحاد مغلق في القاعدة): المواصفة عدّدت
 * ثلاثين نوعًا، والقائمة هتكبر. قفلها في `check` كان هيحوّل كل مصدر
 * جديد لترحيل قاعدة بيانات.
 */
export const KNOWLEDGE_SOURCE_TYPES = [
  // مصادر داخلية من المنصة نفسها
  "meeting",
  "discovery_answer",
  "manual_note",
  "brain_section",
  "support_ticket",

  // مستندات
  "pdf",
  "word",
  "excel",
  "csv",
  "powerpoint",
  "markdown",
  "text",
  "json",
  "xml",
  "zip",

  // وسائط
  "image",
  "audio",
  "video",
  "screenshot",
  "scanned_document",

  // مصادر مؤسسية
  "erp_export",
  "database_export",
  "api_docs",
  "architecture_doc",
  "business_rules",
  "process",
  "sop",
  "policy",
  "contract",
  "specification",
  "requirements",
  "flowchart",
  "legacy_system",
  "research",
  "client_documentation",

  // خارجي
  "external_url",
  "git_repository",
  "notion_export",
  "confluence_export",
] as const;

export type KnowledgeSourceType = (typeof KNOWLEDGE_SOURCE_TYPES)[number] | string;

/** المجموعة التي ينتمي لها المصدر — تحدّد أي عامل يعالجه. */
export type SourceGroup = "internal" | "document" | "media" | "structured" | "external";

const GROUP_BY_TYPE: Record<string, SourceGroup> = {
  meeting: "internal",
  discovery_answer: "internal",
  manual_note: "internal",
  brain_section: "internal",
  support_ticket: "internal",

  pdf: "document",
  word: "document",
  powerpoint: "document",
  markdown: "document",
  text: "document",
  scanned_document: "document",
  api_docs: "document",
  architecture_doc: "document",
  business_rules: "document",
  process: "document",
  sop: "document",
  policy: "document",
  contract: "document",
  specification: "document",
  requirements: "document",
  research: "document",
  client_documentation: "document",
  legacy_system: "document",

  excel: "structured",
  csv: "structured",
  json: "structured",
  xml: "structured",
  erp_export: "structured",
  database_export: "structured",

  image: "media",
  audio: "media",
  video: "media",
  screenshot: "media",
  flowchart: "media",

  zip: "external",
  external_url: "external",
  git_repository: "external",
  notion_export: "external",
  confluence_export: "external",
};

export function sourceGroup(type: KnowledgeSourceType): SourceGroup {
  return GROUP_BY_TYPE[type] ?? "document";
}

// ============================================================
// التصنيفات
// ============================================================

/**
 * التصنيفات الوظيفية.
 *
 * القائمة مرجع للواجهة والتحقّق، **مش قيدًا في القاعدة**: العمود نصّ
 * حر عن قصد من ٠٠٧١ عشان النظام يقدر يتعلّم تصنيفًا جديدًا بلا ترحيل.
 */
export const KNOWLEDGE_CATEGORIES = [
  "business", "operations", "sales", "accounting", "hr", "erp", "workflow",
  "legal", "technical", "database", "architecture", "api", "security",
  "infrastructure", "deployment", "finance", "management", "requirements",
  "ui", "ux", "testing", "support", "compliance", "integrations",
  "marketing", "analytics", "ai", "unknown",
] as const;

export type KnowledgeCategory = (typeof KNOWLEDGE_CATEGORIES)[number] | string;

export const CATEGORY_LABELS: Record<string, string> = {
  business: "الأعمال", operations: "العمليات", sales: "المبيعات",
  accounting: "المحاسبة", hr: "الموارد البشرية", erp: "تخطيط الموارد",
  workflow: "سير العمل", legal: "قانوني", technical: "تقني",
  database: "قاعدة البيانات", architecture: "المعمارية", api: "الواجهات البرمجية",
  security: "الأمان", infrastructure: "البنية التحتية", deployment: "النشر",
  finance: "المالية", management: "الإدارة", requirements: "المتطلبات",
  ui: "واجهة المستخدم", ux: "تجربة المستخدم", testing: "الاختبار",
  support: "الدعم", compliance: "الامتثال", integrations: "التكاملات",
  marketing: "التسويق", analytics: "التحليلات", ai: "الذكاء الاصطناعي",
  unknown: "غير مصنَّف",
};

export function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? category;
}

export function isKnownCategory(category: string): boolean {
  return (KNOWLEDGE_CATEGORIES as readonly string[]).includes(category);
}

// ============================================================
// الحالات
// ============================================================

/**
 * حالات كائن المعرفة.
 *
 * `outdated` و`needs_review` مش أخطاء — دول حالتان صحّيتان لمعرفة
 * حقيقية: معلومة صحّت وقت كتابتها وبقت قديمة، ومعلومة محتاجة عين
 * بشرية. خلطهم مع `rejected` كان هيخفي الفرق بين «غلط» و«قديم».
 */
export const KNOWLEDGE_STATUSES = [
  "pending", "processing", "indexed", "verified",
  "rejected", "archived", "deleted", "outdated", "needs_review",
] as const;

export type KnowledgeStatus = (typeof KNOWLEDGE_STATUSES)[number];

export const STATUS_LABELS: Record<KnowledgeStatus, string> = {
  pending: "في الانتظار",
  processing: "قيد المعالجة",
  indexed: "مفهرَسة",
  verified: "مؤكَّدة",
  rejected: "مرفوضة",
  archived: "مؤرشفة",
  deleted: "محذوفة",
  outdated: "قديمة",
  needs_review: "تحتاج مراجعة",
};

/** الحالات التي تُعتبر المعرفة فيها صالحة للاستخدام في المراحل التالية. */
const USABLE: ReadonlySet<KnowledgeStatus> = new Set(["indexed", "verified", "needs_review"]);

/**
 * هل تدخل هذه المعرفة في سياق المراحل التالية؟
 *
 * `needs_review` **مشمولة** عن قصد: استبعادها كان معناه إن معرفة
 * صحيحة تُهمَل لمجرد إن محدش فتحها. الاستبعاد للمرفوض والقديم
 * والمحذوف — اللي فيهم قرار فعلي بعدم الصلاحية.
 */
export function isUsable(status: KnowledgeStatus): boolean {
  return USABLE.has(status);
}

/** الانتقالات المسموحة — أي انتقال خارجها خطأ برمجي لا حالة عابرة. */
const ALLOWED_TRANSITIONS: Record<KnowledgeStatus, KnowledgeStatus[]> = {
  pending: ["processing", "rejected", "deleted"],
  processing: ["indexed", "rejected", "needs_review", "pending"],
  indexed: ["verified", "needs_review", "outdated", "archived", "deleted", "rejected"],
  verified: ["outdated", "needs_review", "archived", "deleted"],
  needs_review: ["verified", "indexed", "rejected", "outdated", "archived", "deleted"],
  outdated: ["archived", "deleted", "needs_review"],
  rejected: ["deleted", "needs_review"],
  archived: ["deleted", "indexed"],
  deleted: [],
};

export function canTransition(from: KnowledgeStatus, to: KnowledgeStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function allowedTransitions(from: KnowledgeStatus): KnowledgeStatus[] {
  return [...ALLOWED_TRANSITIONS[from]];
}

/** الحالات النهائية — لا خروج منها. */
export function isTerminal(status: KnowledgeStatus): boolean {
  return ALLOWED_TRANSITIONS[status].length === 0;
}

// ============================================================
// كائن المعرفة
// ============================================================

export type KnowledgeVisibility = "project" | "workspace" | "private";

/**
 * كائن المعرفة الموحّد — **العقد الوحيد بين المركز وكل المراحل**.
 *
 * أي مرحلة (العقل، التوصيات، المراجعة الهندسية، وثيقة المتطلبات...)
 * بتستهلك النوع ده وبس. مصدر المعلومة تفصيلة في `sourceType` لا شرط
 * في الواجهة.
 */
export interface KnowledgeObject {
  id: string;
  projectId: string;
  workspaceId: string | null;

  sourceType: KnowledgeSourceType;
  sourceId: string | null;

  title: string;
  content: string;
  summary: string | null;
  language: string | null;

  category: KnowledgeCategory;
  tags: string[];
  status: KnowledgeStatus;

  /** ٠-١٠٠ — ثقة النظام في صحّة المحتوى. */
  confidence: number;
  /** ٠-١٠٠ — أهمية المحتوى للمشروع. تُرتَّب بها نتائج السياق. */
  importance: number;

  version: number;
  contentHash: string | null;

  visibility: KnowledgeVisibility;
  ownerId: string | null;
  createdBy: string | null;
  updatedBy: string | null;

  metadata: Record<string, unknown>;
  relationships: KnowledgeRelation[];

  createdAt: Date;
  updatedAt: Date;
  reviewedAt: Date | null;
}

export interface KnowledgeRelation {
  targetId: string;
  kind: string;
  confidence: number;
}

// ============================================================
// الترتيب للسياق
// ============================================================

/**
 * يرتّب كائنات المعرفة لبناء سياق الذكاء الاصطناعي.
 *
 * الترتيب مركّب عن قصد: **الأهمية أولًا، ثم الثقة، ثم الحداثة**.
 *
 * الترتيب بالحداثة وحدها — وهو الأسهل — كان بيدفن قاعدة عمل جوهرية
 * كُتبت من شهر تحت ملاحظة اتكتبت امبارح. والترتيب بالثقة وحدها بيرفع
 * معلومات تافهة مؤكَّدة فوق معلومات مهمة غير مؤكَّدة.
 */
export function rankForContext(objects: KnowledgeObject[]): KnowledgeObject[] {
  return [...objects].sort((a, b) => {
    if (b.importance !== a.importance) return b.importance - a.importance;
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    return b.updatedAt.getTime() - a.updatedAt.getTime();
  });
}

/**
 * يختار المعرفة الصالحة للسياق ضمن ميزانية حروف.
 *
 * الميزانية موجودة لأن السياق مش مجاني: كل حرف زيادة رموز وتكلفة
 * وبطء. القطع بيحصل على حدود الكائنات لا في نصّها — نصّ قاعدة عمل
 * مقطوع أسوأ من غيابها، لأنه بيبان كاملًا وهو ناقص.
 */
export function selectForContext(
  objects: KnowledgeObject[],
  charBudget: number
): { selected: KnowledgeObject[]; usedChars: number; droppedCount: number } {
  const usable = rankForContext(objects.filter((o) => isUsable(o.status)));
  const selected: KnowledgeObject[] = [];
  let usedChars = 0;

  for (const object of usable) {
    const cost = (object.summary ?? object.content).length;
    if (usedChars + cost > charBudget) continue;
    selected.push(object);
    usedChars += cost;
  }

  return { selected, usedChars, droppedCount: usable.length - selected.length };
}
