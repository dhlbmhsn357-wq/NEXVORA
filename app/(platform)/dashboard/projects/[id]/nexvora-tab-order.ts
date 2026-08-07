/**
 * NEXVORA Tab Order (NEXVORA UX Cleanup)
 * ======================================
 * ترتيب موحّد لتبويبات صفحة المشروع لما `product_mode` مفعّل.
 *
 * المشكلة: قبل ده كانت التبويبات مخلوطة (v1 القديمة + v2 الجديدة) بترتيب
 * STAGE_REGISTRY فقط، فالمستخدم بيلاقي 25+ تبويبة بلا هيكل.
 *
 * الحل: تجميع لـ 8 phases واضحة، وترتيب داخل كل phase. أي تبويبة مش موجودة
 * في الـ ordering دي بتنزل في phase "أخرى" في الآخر (ما بنخفيش شيء عشان
 * نضمن ما نخسرش أي فيتشر عن طريق الخطأ).
 */

export interface TabPhase {
  key: string;
  label: string;
  /** أزرار التبويبات داخل هذه المرحلة، بالترتيب. */
  tabs: readonly string[];
}

export const NEXVORA_TAB_PHASES: readonly TabPhase[] = [
  {
    key: "discovery",
    label: "الاكتشاف",
    tabs: ["overview", "discovery", "analysis", "research"],
  },
  {
    key: "meetings",
    label: "الاجتماعات",
    tabs: ["meetingPreparation", "meetingPresentation", "meetings"],
  },
  {
    key: "knowledge",
    label: "المعرفة والدماغ",
    tabs: ["projectBrain", "knowledgeHub", "brainReview", "smartRecommendations"],
  },
  {
    key: "definition",
    label: "تعريف المنتج",
    tabs: ["definition", "stories", "traceability", "impact"],
  },
  {
    key: "docs",
    label: "المستندات والنموذج",
    tabs: ["prd", "prototypePrompt", "prototypeReview", "evaluation"],
  },
  {
    key: "approval",
    label: "اعتماد العميل",
    tabs: ["approvals"],
  },
  {
    key: "delivery",
    label: "تسليم العميل",
    tabs: ["clientDelivery", "developerHandoff", "handoff", "partners"],
  },
  {
    key: "execution",
    label: "التنفيذ والجودة",
    tabs: [
      "promptReview",           // Code Execution
      "engineeringQa",
      "engineeringQaReview",
      "fixPrompt",
      "productionMonitoring",
      "productionMonitoringPrompt",
      "productionMonitoringReview",
    ],
  },
  {
    key: "ops",
    label: "التجاري والإدارة",
    tabs: [
      "commercial-full",   // Proposals + Change Requests
      "commercial",        // Client Lifecycle + Contracts + Payments
      "deliveryMilestones",
      "tasks",
      "support",
      "organizationalIntelligence",
      "activity",
    ],
  },
];

/** كل الأكواد المُصنَّفة (للاستعلام السريع). */
const CLASSIFIED_KEYS = new Set<string>(
  NEXVORA_TAB_PHASES.flatMap((p) => p.tabs),
);

/** مرحلة "أخرى" الافتراضية — أي تبويبة غير مُصنَّفة تنزل هنا. */
const FALLBACK_PHASE_KEY = "other";
const FALLBACK_PHASE_LABEL = "أخرى";

/**
 * ترتب مصفوفة تبويبات (بأي ترتيب) حسب NEXVORA order.
 * ترجّع {phaseKey, phaseLabel, item} لكل تبويبة بالترتيب المطلوب،
 * والـ UI يستخدم phaseKey لعرض separator بين المجموعات.
 */
export interface OrderedTab<T> {
  phaseKey: string;
  phaseLabel: string;
  item: T;
}

export function orderTabsByNexvora<T extends { key: string }>(
  items: readonly T[],
): OrderedTab<T>[] {
  const byKey = new Map(items.map((i) => [i.key, i]));
  const seen = new Set<string>();
  const out: OrderedTab<T>[] = [];

  // 1) المُصنَّف حسب الترتيب الرسمي
  for (const phase of NEXVORA_TAB_PHASES) {
    for (const tabKey of phase.tabs) {
      const item = byKey.get(tabKey);
      if (item) {
        out.push({ phaseKey: phase.key, phaseLabel: phase.label, item });
        seen.add(tabKey);
      }
    }
  }

  // 2) غير المُصنَّف → phase "أخرى" (يبقى مرئي حتى لو مش في الخريطة)
  for (const item of items) {
    if (!seen.has(item.key) && !CLASSIFIED_KEYS.has(item.key)) {
      out.push({ phaseKey: FALLBACK_PHASE_KEY, phaseLabel: FALLBACK_PHASE_LABEL, item });
    }
  }
  return out;
}

/**
 * حسبة عدد التبويبات في كل مرحلة (للـ UI: badges على tab-group selector).
 */
export function countByPhase<T extends { key: string }>(items: readonly T[]): Map<string, number> {
  const counts = new Map<string, number>();
  const byKey = new Map(items.map((i) => [i.key, true]));
  for (const phase of NEXVORA_TAB_PHASES) {
    const c = phase.tabs.filter((k) => byKey.get(k)).length;
    if (c > 0) counts.set(phase.key, c);
  }
  // fallback count
  const fallback = items.filter((i) => !CLASSIFIED_KEYS.has(i.key)).length;
  if (fallback > 0) counts.set(FALLBACK_PHASE_KEY, fallback);
  return counts;
}
