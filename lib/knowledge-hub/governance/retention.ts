/**
 * محرّك دورة حياة المعرفة — **وحدة نقية بلا I/O**.
 *
 * ## الفلسفة
 *
 * المعرفة ليست أبدية. عنصر مرفوض من ستة أشهر، أو مصدر متقادم لم يُشَر
 * إليه منذ سنة، بيثقّل الرسم البياني والبحث بلا قيمة. الحوكمة بتقرّر —
 * **حتميًا وبشفافية** — إيه يُحتفَظ به، إيه يُؤرشَف، إيه يُحذَف.
 *
 * **القرار هنا مقترَح لا منفَّذ.** الوحدة بتقول «ده يستحق الأرشفة ولهذا
 * السبب»؛ التنفيذ الفعلي (خاصة الحذف) قرار بشري أو سياسة `automatic`
 * صريحة. الحذف الصامت للمعرفة خطر لا رجعة فيه.
 */

export type GovernanceObjectStatus = string;

export interface GovernableObject {
  id: string;
  status: GovernanceObjectStatus;
  confidence: number; // 0–100
  /** عمر العنصر بالأيام (يُحسب من المستدعي بزمن ثابت). */
  ageDays: number;
  /** أيام منذ آخر تعديل. */
  idleDays: number;
}

export type RetentionAction = "retain" | "archive" | "delete";

export interface RetentionPolicyConfig {
  /** الحالات اللي تنطبق عليها السياسة (فارغ = كل الحالات). */
  appliesToStatuses?: string[];
  /** أقصى عمر قبل الإجراء (بالأيام). */
  maxAgeDays?: number;
  /** أقصى خمول قبل الإجراء (بالأيام). */
  maxIdleDays?: number;
  /** أقل ثقة — الأدنى منها مرشّح للإجراء. */
  minConfidence?: number;
}

export interface RetentionPolicy {
  policyType: "retention" | "archive" | "deletion" | "version_retention";
  scope: string; // نوع الكائن أو 'all'
  enabled: boolean;
  enforcement: "suggest" | "automatic";
  config: RetentionPolicyConfig;
}

export interface RetentionDecision {
  objectId: string;
  action: RetentionAction;
  reason: string;
  /** هل السياسة تسمح بالتنفيذ التلقائي؟ */
  automatic: boolean;
}

function statusMatches(policy: RetentionPolicy, status: string): boolean {
  const list = policy.config.appliesToStatuses ?? [];
  return list.length === 0 || list.includes(status);
}

/**
 * هل الكائن استوفى شروط سياسة؟ كل الشروط المحدَّدة لازم تتحقّق (AND).
 */
function objectMeetsPolicy(policy: RetentionPolicy, obj: GovernableObject): boolean {
  if (!statusMatches(policy, obj.status)) return false;
  const c = policy.config;
  if (c.maxAgeDays !== undefined && obj.ageDays < c.maxAgeDays) return false;
  if (c.maxIdleDays !== undefined && obj.idleDays < c.maxIdleDays) return false;
  if (c.minConfidence !== undefined && obj.confidence >= c.minConfidence) return false;
  // لازم شرط واحد على الأقل يكون محدَّدًا، وإلا السياسة بتطبّق على الكل بلا معنى.
  return c.maxAgeDays !== undefined || c.maxIdleDays !== undefined || c.minConfidence !== undefined;
}

const ACTION_BY_TYPE: Record<RetentionPolicy["policyType"], RetentionAction> = {
  retention: "retain",
  archive: "archive",
  deletion: "delete",
  version_retention: "archive",
};

/** أولوية الإجراء — الأخطر يفوز عند تعارض سياستين على نفس الكائن. */
const ACTION_SEVERITY: Record<RetentionAction, number> = { retain: 0, archive: 1, delete: 2 };

/**
 * يقيّم كائنات مقابل سياسات ويرجّع القرارات.
 *
 * لو أكتر من سياسة انطبقت على كائن، **الأخطر يفوز** (حذف > أرشفة >
 * احتفاظ) — لكن الحذف التلقائي بيتطلّب سياسة حذف `automatic` صريحة،
 * وإلا بيتحوّل لاقتراح.
 */
export function evaluateRetention(
  objects: GovernableObject[],
  policies: RetentionPolicy[]
): RetentionDecision[] {
  const active = policies.filter((p) => p.enabled);
  const decisions: RetentionDecision[] = [];

  for (const obj of objects) {
    let best: RetentionDecision | null = null;

    for (const policy of active) {
      if (!objectMeetsPolicy(policy, obj)) continue;
      const action = ACTION_BY_TYPE[policy.policyType];
      if (action === "retain") continue; // الاحتفاظ هو الافتراضي، لا يُسجَّل قرارًا

      const automatic = policy.enforcement === "automatic";
      const candidate: RetentionDecision = {
        objectId: obj.id,
        action,
        reason: reasonFor(policy, obj),
        automatic,
      };
      if (!best || ACTION_SEVERITY[action] > ACTION_SEVERITY[best.action]) {
        best = candidate;
      }
    }

    if (best) decisions.push(best);
  }

  return decisions;
}

function reasonFor(policy: RetentionPolicy, obj: GovernableObject): string {
  const parts: string[] = [];
  const c = policy.config;
  if (c.maxAgeDays !== undefined) parts.push(`العمر ${obj.ageDays}ي ≥ ${c.maxAgeDays}ي`);
  if (c.maxIdleDays !== undefined) parts.push(`الخمول ${obj.idleDays}ي ≥ ${c.maxIdleDays}ي`);
  if (c.minConfidence !== undefined) parts.push(`الثقة ${obj.confidence}٪ < ${c.minConfidence}٪`);
  const verb = ACTION_BY_TYPE[policy.policyType] === "delete" ? "الحذف" : "الأرشفة";
  return `مرشّح لـ${verb}: ${parts.join(" · ")}`;
}

/** ملخّص القرارات — للعرض قبل التنفيذ. */
export function summarizeRetention(decisions: RetentionDecision[]): {
  archive: number;
  delete: number;
  automatic: number;
  needsApproval: number;
} {
  return {
    archive: decisions.filter((d) => d.action === "archive").length,
    delete: decisions.filter((d) => d.action === "delete").length,
    automatic: decisions.filter((d) => d.automatic).length,
    needsApproval: decisions.filter((d) => !d.automatic).length,
  };
}
