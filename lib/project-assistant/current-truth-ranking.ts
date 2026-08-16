import type { InformationClassification, Confidentiality } from "@/lib/market-research/types";

/**
 * ترتيب "الحقيقة الحالية" (Current-Truth Ranking) — دالة نقية بالكامل
 * (بلا I/O)، Phase B من مساعد المشروع.
 *
 * ## الفكرة
 * التشابه الدلالي (similarity) وحده مش كافٍ: سؤال عن "السعة القصوى"
 * ممكن يرجّع ملاحظة Discovery قديمة بتشابه عالٍ (95%) *وكمان* قرار لاحق
 * اعتمد رقمًا مختلفًا بتشابه أقل (80%) — لازم القرار يفوز، لأنه "الحقيقة
 * الحالية"، مش الأعلى تشابهًا. الترتيب هنا أساسي (currentTruthRank)
 * والتشابه ثانوي (كسر تعادل جوّه نفس الطبقة فقط).
 *
 * ## الجدول القابل للصيانة (مش if/else هش لكل قيمة object_type حرفية)
 * كل نوع كائن (object_type) له "طبقة أساس" (base tier) في
 * `OBJECT_TYPE_BASE_TIER`. الطبقة بعدين تتعدّل حسب:
 *   • هل الحالة (status) تدل على اعتماد/نهائية (`isApprovedStatus`)؟
 *     الأنواع اللي عندها مفهوم "اعتماد" (`APPROVAL_SENSITIVE_TYPES`)
 *     بتنزل طبقة واحدة (أقل أولوية) لو مش معتمدة.
 *   • هل `classification==='decision'`؟ بيرفعها فورًا لطبقة القرار (1)
 *     بغضّ النظر عن object_type — تطابقًا مع "أي صف عليه classification=decision".
 *   • هل `classification` بيدل على دليل مُتحقَّق منه (`fact`/`verified`)؟
 *     بيرفع طبقة evidence من "خام" (6) لـ "مُتحقَّق" (5).
 *   • `isSuperseded` — override أخير: أي صف مُستبدَل بينزل لآخر طبقة (7)
 *     بغضّ النظر عن أي حساب سابق. القاعدة دي **دايمًا** آخر خطوة.
 *
 * إضافة نوع كائن جديد مستقبلًا = سطر واحد في `OBJECT_TYPE_BASE_TIER`،
 * مش تعديل منطق شرطي متفرّع.
 */

export interface RawRetrievedEntry {
  id: string;
  objectType: string;
  objectId: string;
  title: string;
  sourceTitle: string;
  content: string;
  domain: string | null;
  classification: InformationClassification | null;
  confidentiality: Confidentiality;
  status: string | null;
  version: number | null;
  isCurrent: boolean;
  isSuperseded: boolean;
  supersededBy: string | null;
  metadata: Record<string, unknown>;
  similarity: number;
}

export interface RetrievedEntry extends RawRetrievedEntry {
  /** 1 = أعلى أولوية (قرار حالي معتمد) … 7 = أقل أولوية (مُستبدَل). أصغر = أفضل. */
  currentTruthRank: number;
}

// ============================================================
// طبقات الأولوية — 1 (الأعلى) إلى 6 (الأدنى قبل override الاستبدال).
// طبقة 7 محجوزة حصريًا لـ isSuperseded=true (override، مش base tier).
// ============================================================
const TIER_DECISION = 1; // قرار معتمد/صريح حالي
const TIER_APPROVED_ARTIFACT = 2; // PRD/Handoff/Client Approval معتمدة
const TIER_CURRENT_DEFINITION = 3; // متطلب/قصة مستخدم/معيار قبول/قاعدة عمل معتمدة
const TIER_DRAFT_DEFINITION = 4; // نفس الفئة السابقة لكن لسه Draft، وكمان Brain الحالي
const TIER_VALIDATED_EVIDENCE = 5; // دليل مُتحقَّق منه (fact/verified)
const TIER_DISCOVERY_RAW = 6; // Discovery/Meetings/دليل خام/أي نوع تاني مش مصنَّف صراحةً
const TIER_SUPERSEDED = 7; // مُستبدَل — override نهائي، بيتفعّل بعد كل الحسابات

/** الطبقة الأساسية لكل object_type لو معتمد (approval-sensitive types تنزل طبقة واحدة لو مش معتمدة). */
const OBJECT_TYPE_BASE_TIER: Record<string, number> = {
  decision: TIER_DECISION,

  prd_section: TIER_APPROVED_ARTIFACT,
  handoff_item: TIER_APPROVED_ARTIFACT,
  client_approval: TIER_APPROVED_ARTIFACT,

  requirement: TIER_CURRENT_DEFINITION,
  user_story: TIER_CURRENT_DEFINITION,
  acceptance_criteria: TIER_CURRENT_DEFINITION,
  business_rule: TIER_CURRENT_DEFINITION,

  brain: TIER_DRAFT_DEFINITION,

  evidence: TIER_DISCOVERY_RAW, // بيترفّع لـ TIER_VALIDATED_EVIDENCE لو classification=fact/verified

  discovery: TIER_DISCOVERY_RAW,
  meeting: TIER_DISCOVERY_RAW,
  persona: TIER_DISCOVERY_RAW,
  user_flow: TIER_DISCOVERY_RAW,
  evaluation_scenario: TIER_DISCOVERY_RAW,
  prototype_review: TIER_DISCOVERY_RAW,
  commercial: TIER_DISCOVERY_RAW,
  task: TIER_DISCOVERY_RAW,
  open_question: TIER_DISCOVERY_RAW,
  system_message: TIER_DISCOVERY_RAW,
  risk: TIER_DISCOVERY_RAW,
  workflow: TIER_DISCOVERY_RAW,
  entity: TIER_DISCOVERY_RAW,
  item: TIER_DISCOVERY_RAW,
};

/** الأنواع اللي مفهوم "الاعتماد" بيفرّق فيها بين طبقتين. غيرها بتاخد طبقتها الأساسية دايمًا. */
const APPROVAL_SENSITIVE_TYPES = new Set<string>([
  "prd_section",
  "handoff_item",
  "client_approval",
  "requirement",
  "user_story",
  "acceptance_criteria",
  "business_rule",
]);

/**
 * قيم status اللي بتدل على "معتمد/نهائي" عبر أنواع الكائنات المختلفة —
 * المصطلحات متفاوتة حسب المصدر (PRD/Requirement بتستخدم approved،
 * meeting_decision/knowledge_decision بتستخدم active، Client Approval
 * ممكن يستخدم accepted). قرار قابل للتوسعة لو ظهرت مصطلحات جديدة.
 */
const APPROVED_STATUS_VALUES = new Set<string>([
  "approved",
  "active",
  "accepted",
  "final",
  "completed",
  "done",
  "resolved",
]);

function isApprovedStatus(status: string | null): boolean {
  if (!status) return false;
  return APPROVED_STATUS_VALUES.has(status.trim().toLowerCase());
}

const VERIFIED_CLASSIFICATIONS = new Set<InformationClassification>(["fact", "verified"]);

function computeBaseTier(entry: Pick<RawRetrievedEntry, "objectType" | "classification" | "status">): number {
  // أي صف معلَّم صراحةً كـ "قرار" (بغضّ النظر عن object_type) بياخد طبقة القرار.
  if (entry.classification === "decision") {
    return TIER_DECISION;
  }

  const baseTier = OBJECT_TYPE_BASE_TIER[entry.objectType] ?? TIER_DISCOVERY_RAW;

  if (entry.objectType === "evidence") {
    return entry.classification && VERIFIED_CLASSIFICATIONS.has(entry.classification)
      ? TIER_VALIDATED_EVIDENCE
      : TIER_DISCOVERY_RAW;
  }

  if (APPROVAL_SENSITIVE_TYPES.has(entry.objectType) && !isApprovedStatus(entry.status)) {
    // مش معتمد بعد — تنزل طبقة واحدة (Draft artifacts وDraft definitions
    // بيشتركوا في نفس طبقة "لسه مش نهائي" TIER_DRAFT_DEFINITION).
    return TIER_DRAFT_DEFINITION;
  }

  return baseTier;
}

/** يحسب currentTruthRank لصف واحد — يُصدَّر منفردًا لتيسير الاختبار الوحدوي المباشر. */
export function computeCurrentTruthRank(
  entry: Pick<RawRetrievedEntry, "objectType" | "classification" | "status" | "isSuperseded">
): number {
  if (entry.isSuperseded) return TIER_SUPERSEDED; // override نهائي — دايمًا آخر طبقة
  return computeBaseTier(entry);
}

/**
 * يرتّب مجموعة نتائج الاسترجاع حسب "الحقيقة الحالية": أساسًا حسب
 * currentTruthRank تصاعديًا (1 = الأعلى أولوية)، وثانويًا حسب similarity
 * تنازليًا **داخل نفس الطبقة فقط** — تشابه عالٍ في طبقة أدنى لا يتغلّب
 * أبدًا على طبقة أعلى.
 */
export function rankByCurrentTruth(entries: RawRetrievedEntry[]): RetrievedEntry[] {
  return entries
    .map((entry) => ({ ...entry, currentTruthRank: computeCurrentTruthRank(entry) }))
    .sort((a, b) => {
      if (a.currentTruthRank !== b.currentTruthRank) return a.currentTruthRank - b.currentTruthRank;
      return b.similarity - a.similarity;
    });
}
