/**
 * مخطّط التحديث التزايدي — **وحدة نقية بلا I/O**.
 *
 * ## الفلسفة (من المواصفة)
 *
 * «إذا أضاف المستخدم ملفًا واحدًا أو Policy جديدة، لا تُعِد تشغيل كل
 * المراحل من البداية. حلّل الجديد فقط، واكتشف ما المراحل المتأثرة.»
 *
 * ده بيربط ثلاث حقائق:
 * 1. **الدلتا**: أي نوع معرفة اتغيّر؟
 * 2. **الأثر**: أي موديولات بتتأثّر بالنوع ده؟ (خريطة حتمية)
 * 3. **السياسة**: هل الموديول ده تحديثه تلقائي، أم موافقة، أم أبدًا؟
 *
 * النتيجة **خطة تحديث**: إيه اللي يتحدّث تلقائيًا، إيه اللي يستنّى
 * موافقة، إيه اللي يُتخطّى — بدل إعادة توليد المشروع كله.
 */

export const MODULE_KEYS = [
  "project_brain",
  "prd",
  "prototype_prompt",
  "client_presentation",
  "developer_handoff",
  "architecture",
  "recommendations",
  "knowledge_graph",
] as const;

export type ModuleKey = (typeof MODULE_KEYS)[number];

export const MODULE_LABELS: Record<ModuleKey, string> = {
  project_brain: "عقل المشروع",
  prd: "وثيقة المتطلبات (PRD)",
  prototype_prompt: "برومبت النموذج الأولي",
  client_presentation: "عرض العميل",
  developer_handoff: "تسليم المطوّر",
  architecture: "المعمار",
  recommendations: "التوصيات",
  knowledge_graph: "رسم المعرفة",
};

/** أنواع تغيّر المعرفة اللي بتطلق التحليل التزايدي. */
export type KnowledgeChangeType =
  | "requirement"
  | "business_rule"
  | "policy"
  | "decision"
  | "risk"
  | "workflow"
  | "entity"
  | "conflict_resolved";

/**
 * خريطة الأثر — أي موديولات يتأثّر بكل نوع تغيّر.
 *
 * مبنية على تبعية المعرفة الحقيقية، ومطابقة لمثال المواصفة:
 * «Requirement → Brain → PRD → Prompt» و«Policy → Brain, Architecture،
 * ولا تؤثّر على Prototype».
 */
export const CHANGE_IMPACT: Record<KnowledgeChangeType, ModuleKey[]> = {
  requirement: ["project_brain", "prd", "prototype_prompt", "knowledge_graph"],
  business_rule: ["project_brain", "prd", "architecture", "knowledge_graph"],
  policy: ["project_brain", "architecture"],
  decision: ["project_brain", "architecture", "recommendations", "knowledge_graph"],
  risk: ["project_brain", "recommendations"],
  workflow: ["project_brain", "prd", "architecture", "knowledge_graph"],
  entity: ["project_brain", "knowledge_graph"],
  conflict_resolved: ["project_brain", "prd", "recommendations"],
};

export type UpdatePolicy = "auto_update" | "manual_approval" | "never";

/** السياسة الافتراضية لموديول بلا صفّ سياسة — أأمن سلوك. */
export const DEFAULT_POLICY: UpdatePolicy = "manual_approval";

export interface UpdatePlanEntry {
  module: ModuleKey;
  policy: UpdatePolicy;
  /** أنواع التغيّر اللي أثّرت على الموديول ده. */
  triggeredBy: KnowledgeChangeType[];
}

export interface UpdatePlan {
  autoUpdate: UpdatePlanEntry[];
  needsApproval: UpdatePlanEntry[];
  skipped: Array<UpdatePlanEntry & { reason: string }>;
  /** الموديولات غير المتأثّرة أصلًا — للإفصاح: «ده ما اتغيّرش». */
  unaffected: ModuleKey[];
}

/**
 * يبني خطة التحديث من الدلتا والسياسات.
 *
 * @param changes أنواع التغيّر اللي حصلت في هذه الدفعة.
 * @param policies خريطة الموديول → السياسة (الغائب = الافتراضي).
 */
export function planUpdate(
  changes: KnowledgeChangeType[],
  policies: Partial<Record<ModuleKey, UpdatePolicy>> = {}
): UpdatePlan {
  // اتحاد الموديولات المتأثّرة، مع تتبّع مين أثّر على مين.
  const triggeredByModule = new Map<ModuleKey, Set<KnowledgeChangeType>>();
  for (const change of changes) {
    for (const mod of CHANGE_IMPACT[change] ?? []) {
      const set = triggeredByModule.get(mod) ?? new Set<KnowledgeChangeType>();
      set.add(change);
      triggeredByModule.set(mod, set);
    }
  }

  const autoUpdate: UpdatePlanEntry[] = [];
  const needsApproval: UpdatePlanEntry[] = [];
  const skipped: Array<UpdatePlanEntry & { reason: string }> = [];

  for (const [module, triggers] of triggeredByModule) {
    const policy = policies[module] ?? DEFAULT_POLICY;
    const entry: UpdatePlanEntry = {
      module,
      policy,
      triggeredBy: [...triggers].sort(),
    };
    if (policy === "auto_update") autoUpdate.push(entry);
    else if (policy === "manual_approval") needsApproval.push(entry);
    else skipped.push({ ...entry, reason: "السياسة: لا تُحدّث تلقائيًا أبدًا." });
  }

  const affected = new Set(triggeredByModule.keys());
  const unaffected = MODULE_KEYS.filter((m) => !affected.has(m));

  // ترتيب ثابت للعرض.
  const byModuleOrder = (a: UpdatePlanEntry, b: UpdatePlanEntry) =>
    MODULE_KEYS.indexOf(a.module) - MODULE_KEYS.indexOf(b.module);
  autoUpdate.sort(byModuleOrder);
  needsApproval.sort(byModuleOrder);
  skipped.sort(byModuleOrder);

  return { autoUpdate, needsApproval, skipped, unaffected };
}

/**
 * يلخّص خطة التحديث في جملة عربية — لسجلّ التغيير والإشعارات.
 */
export function describePlan(plan: UpdatePlan): string {
  const parts: string[] = [];
  if (plan.autoUpdate.length) {
    parts.push(`تحديث تلقائي: ${plan.autoUpdate.map((e) => MODULE_LABELS[e.module]).join("، ")}`);
  }
  if (plan.needsApproval.length) {
    parts.push(`بانتظار موافقة: ${plan.needsApproval.map((e) => MODULE_LABELS[e.module]).join("، ")}`);
  }
  if (plan.skipped.length) {
    parts.push(`متخطّى: ${plan.skipped.map((e) => MODULE_LABELS[e.module]).join("، ")}`);
  }
  return parts.join(" · ") || "لا توجد موديولات متأثّرة.";
}
