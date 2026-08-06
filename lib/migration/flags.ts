/**
 * أعلام الترحيل — مفتاح الرجوع الفوري.
 *
 * كل خدمة تنتقل خلف علم مستقل. إطفاء العلم = رجوع فوري للمسار القديم،
 * بلا نشر وبلا تراجع في Git.
 *
 * ## قرار حاكم: الافتراضي **مطفأ**
 *
 * الترحيل يبدأ مغلقًا ويُفتح بقرار. العكس — أن يبدأ مفتوحًا — يعني أن
 * نشر الكود وحده يحوّل منصة حيّة إلى مسار لم يُختبر في الإنتاج بعد،
 * ومن غير أن يقرّر أحد ذلك.
 */

/** الخدمات القابلة للترحيل — واحدة لكل نطاق. */
export const MIGRATABLE_SERVICES = [
  "meeting",
  "discovery",
  "brain",
  "prd",
  "prototype",
  "qa",
  "prompt",
  "monitoring",
  "recommendations",
  "architecture",
  "support",
  "knowledge",
] as const;

export type MigratableService = (typeof MIGRATABLE_SERVICES)[number];

export type FlagState = "off" | "on";

export interface FlagRow {
  service: MigratableService;
  state: FlagState;
  /** نسبة الطلبات التي تسلك المسار الجديد (٠-١٠٠) — للنقل التدريجي. */
  rolloutPercent: number;
  updatedAt: Date;
  updatedBy: string | null;
  note: string | null;
}

export const DEFAULT_FLAGS: Record<MigratableService, FlagRow> = Object.fromEntries(
  MIGRATABLE_SERVICES.map((service) => [
    service,
    {
      service,
      state: "off" as FlagState,
      rolloutPercent: 0,
      updatedAt: new Date(0),
      updatedBy: null,
      note: "الافتراضي: مطفأ حتى قرار صريح.",
    },
  ])
) as Record<MigratableService, FlagRow>;

/**
 * يربط نوع مهمة الذكاء الاصطناعي بالخدمة المسؤولة عنه.
 *
 * الربط بالبادئة لا بقائمة كاملة: أنواع المهام ٦٣ ونمو مستمر، وقائمة
 * صريحة كانت ستتقادم صامتة مع كل نوع جديد — فيقع في «غير معروف»
 * ويُنفَّذ بالمسار القديم بلا أن يلاحظ أحد.
 */
const SERVICE_PATTERNS: Array<[RegExp, MigratableService]> = [
  [/^meeting|^transcription/, "meeting"],
  [/^discovery/, "discovery"],
  [/^brain|^project_brain/, "brain"],
  [/^prd/, "prd"],
  [/^prototype|^client_presentation|^developer_handoff/, "prototype"],
  [/^(static|security|database|architecture_review|code_quality|prd_compliance|performance)_review/, "qa"],
  [/^prompt/, "prompt"],
  [/^production_(monitoring|validation)/, "monitoring"],
  [/recommendation|^ai_product_advisor|^knowledge_extraction/, "recommendations"],
  [/^architecture|^knowledge_graph/, "architecture"],
  [/^support/, "support"],
  [/^knowledge_/, "knowledge"],
];

export function serviceForTaskType(taskType: string): MigratableService | null {
  const normalized = taskType.toLowerCase();
  for (const [pattern, service] of SERVICE_PATTERNS) {
    if (pattern.test(normalized)) return service;
  }
  return null;
}

export type RouteDecision =
  | { path: "new"; service: MigratableService; reason: string }
  | { path: "legacy"; service: MigratableService | null; reason: string };

/**
 * يقرّر مسار التنفيذ — وحدة نقية.
 *
 * @param sample رقم ٠-١٠٠ للنقل التدريجي. يُشتقّ من بصمة المدخل لا من
 *   العشوائية: نفس الطلب يجب أن يسلك نفس المسار عند إعادة المحاولة،
 *   وإلا صار سلوك النظام غير قابل لإعادة الإنتاج عند تشخيص عطل.
 */
export function decideRoute(input: {
  taskType: string;
  flags: Record<MigratableService, FlagRow>;
  sample: number;
}): RouteDecision {
  const service = serviceForTaskType(input.taskType);

  if (!service) {
    return {
      path: "legacy",
      service: null,
      reason: `نوع المهمة «${input.taskType}» غير مربوط بخدمة — المسار القديم.`,
    };
  }

  const flag = input.flags[service];
  if (!flag || flag.state === "off") {
    return { path: "legacy", service, reason: `علم «${service}» مطفأ.` };
  }

  if (flag.rolloutPercent >= 100) {
    return { path: "new", service, reason: `علم «${service}» مفعّل بالكامل.` };
  }
  if (flag.rolloutPercent <= 0) {
    return { path: "legacy", service, reason: `علم «${service}» مفعّل بنسبة صفر.` };
  }

  const inRollout = input.sample < flag.rolloutPercent;
  return inRollout
    ? { path: "new", service, reason: `ضمن نسبة النقل (${flag.rolloutPercent}٪).` }
    : { path: "legacy", service, reason: `خارج نسبة النقل (${flag.rolloutPercent}٪).` };
}

/**
 * يشتقّ عيّنة ثابتة ٠-٩٩ من نص.
 *
 * الثبات مقصود: نفس المدخل يعطي نفس الرقم دائمًا، فيسلك نفس المسار في
 * كل إعادة محاولة. العشوائية هنا كانت ستجعل مهمة تفشل في المسار الجديد
 * ثم تنجح في القديم عند الإعادة — فيبدو العطل عابرًا وهو بنيوي.
 */
export function stableSample(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % 100;
}

/** يقرأ تجاوزًا من متغيّرات البيئة — للطوارئ والاختبار المحلي. */
export function envOverride(
  service: MigratableService,
  env: Record<string, string | undefined> = process.env
): FlagState | null {
  const key = `MIGRATE_${service.toUpperCase()}`;
  const value = env[key]?.toLowerCase();
  if (value === "on" || value === "true" || value === "1") return "on";
  if (value === "off" || value === "false" || value === "0") return "off";
  return null;
}

/**
 * مفتاح إيقاف عام يغلب كل شيء.
 *
 * قيمته الوحيدة أنه لا يحتاج نشرًا ولا وصولًا لقاعدة البيانات: متغيّر
 * بيئة واحد على المنصة المستضيفة يعيد المنصة كلها للمسار القديم في
 * دقيقة. عند عطل واسع، لا وقت لإطفاء اثني عشر علمًا واحدًا واحدًا.
 */
export function killSwitchEngaged(
  env: Record<string, string | undefined> = process.env
): boolean {
  const value = env.MIGRATION_KILL_SWITCH?.toLowerCase();
  return value === "on" || value === "true" || value === "1";
}
