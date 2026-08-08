/**
 * NEXVORA Tab Order (NEXVORA UX Cleanup)
 * ======================================
 * ترتيب موحّد لتبويبات صفحة المشروع لما `product_mode` مفعّل.
 *
 * المشكلة: قبل ده كانت التبويبات مخلوطة (v1 القديمة + v2 الجديدة) بترتيب
 * STAGE_REGISTRY فقط، فالمستخدم بيلاقي 25+ تبويبة بلا هيكل.
 *
 * الحل: تجميع في **8 phases أساسية** واضحة، بالإضافة إلى phase تاسعة
 * (execution — التنفيذ والجودة) بتظهر **فقط لما feature flag
 * `extended_technical_delivery` مفعّل**. أي تبويبة مش موجودة في الـ
 * ordering دي بتنزل في phase "أخرى" في الآخر (ما بنخفيش شيء عشان نضمن
 * ما نخسرش أي فيتشر عن طريق الخطأ).
 *
 * الوضع الأساسي = 8 phases (discovery → delivery).
 * الوضع الممتد  = 9 phases (بإضافة execution خلف الفلاغ).
 *
 * Security note: Extended tabs محجوبة تمامًا لما الفلاغ off — server-side
 * redirect في page.tsx يرفض ?tab=<execution-key> ويعيد التوجيه للـ overview،
 * وكل server action مرتبط محمي بـ `requireExtendedTechnical()`. الفلترة في
 * الـ UI مجرد طبقة تجميلية فوق الحماية الحقيقية على الخادم.
 *
 * Essential / Advanced (UX Cleanup 2)
 * ------------------------------------
 * كل تبويبة عندها `category`:
 *   - "essential": بتظهر افتراضيًا (دورة حياة المنتج الأساسية).
 *   - "advanced": مخفية خلف زر «إظهار المتقدمة» (عمليات + legacy +
 *     أدوات متقدّمة). لو ?tab=<advanced-key> في الـ URL بيظهر تلقائيًا
 *     بغض النظر عن الـ toggle (deep-link يفوق الـ preference).
 */

export type TabCategory = "essential" | "advanced";

export interface TabDef {
  key: string;
  category: TabCategory;
}

export interface TabPhase {
  key: string;
  label: string;
  /** أزرار التبويبات داخل هذه المرحلة، بالترتيب. */
  tabs: readonly TabDef[];
  /**
   * لو `true`، الـ phase دي ما تظهرش في الوضع الأساسي وتحتاج feature flag
   * `extended_technical_delivery` عشان تبان (حاليًا: execution فقط).
   */
  requiresExtended?: boolean;
}

/** helper موجز لتعريف تبويب "أساسي". */
const e = (key: string): TabDef => ({ key, category: "essential" });
/** helper موجز لتعريف تبويب "متقدّم". */
const a = (key: string): TabDef => ({ key, category: "advanced" });

export const NEXVORA_TAB_PHASES: readonly TabPhase[] = [
  {
    key: "discovery",
    label: "الاكتشاف",
    tabs: [e("discovery"), e("overview"), e("analysis"), e("research")],
  },
  {
    key: "meetings",
    label: "الاجتماعات",
    tabs: [e("meetingPreparation"), e("meetingPresentation"), e("meetings")],
  },
  {
    key: "knowledge",
    label: "المعرفة والدماغ",
    tabs: [
      e("projectBrain"),
      a("knowledgeHub"),           // مركز المعرفة (advanced)
      e("brainReview"),
      a("smartRecommendations"),   // ذكاء توصيات — أداة متقدّمة
    ],
  },
  {
    key: "definition",
    label: "تعريف المنتج",
    tabs: [e("definition"), e("stories"), e("traceability"), e("impact")],
  },
  {
    key: "docs",
    label: "المستندات والنموذج",
    tabs: [e("prd"), e("prototypePrompt"), e("prototypeReview"), e("evaluation")],
  },
  {
    key: "ops",
    label: "التجاري والإدارة",
    tabs: [
      e("commercial"),                      // تجاري (essential — core deliverable)
      e("commercial-full"),                 // عروض وتغيير (essential — core deliverable)
      e("deliveryMilestones"),
      e("tasks"),
      a("support"),                         // طلبات الدعم
      a("organizationalIntelligence"),      // الذكاء التنظيمي (advanced — مرجع)
      a("activity"),                        // Activity — سجل عابر
    ],
  },
  {
    key: "approval",
    label: "اعتماد العميل",
    tabs: [e("approvals")],
  },
  {
    key: "delivery",
    label: "تسليم العميل",
    tabs: [e("clientDelivery"), e("developerHandoff"), e("handoff"), e("partners")],
  },
  {
    key: "execution",
    label: "التنفيذ والجودة",
    requiresExtended: true,
    tabs: [
      a("promptReview"),                    // Code Execution / Prompt Review
      a("engineeringQa"),
      a("engineeringQaReview"),
      a("fixPrompt"),
      a("productionMonitoring"),
      a("productionMonitoringPrompt"),      // Prompt Studio على المونيتورينج
      a("productionMonitoringReview"),
    ],
  },
];

/**
 * يرجّع الـ phases الظاهرة في الـ UI بناءً على حالة الـ Extended
 * Technical Delivery flag. الوضع الأساسي = 8 phases، الممتد = 9.
 * ملاحظة: `orderTabsByNexvora` و`countByPhase` بيستخدموا القائمة الكاملة
 * دايمًا (لأن الـ tab keys لسه لازم تتفاعل مع deep-links)؛ الفلترة دي
 * للـ UI بس (phase pills + إخفاء تبويبات execution من الشريط).
 */
export function getVisibleNexvoraPhases(extendedEnabled: boolean): readonly TabPhase[] {
  if (extendedEnabled) return NEXVORA_TAB_PHASES;
  return NEXVORA_TAB_PHASES.filter((p) => !p.requiresExtended);
}

/**
 * مجموعة مفاتيح كل تبويبات phase الـ Execution (Extended Technical Delivery).
 * مصدر واحد للحقيقة — أي مستهلك (guard في page.tsx، server action، اختبار)
 * يستدعي الـ `isExtendedTechnicalTabKey` بدل ما يعيد كتابة نفس الشرط.
 */
export const EXTENDED_TAB_KEYS: ReadonlySet<string> = new Set<string>(
  NEXVORA_TAB_PHASES.filter((p) => p.requiresExtended).flatMap((p) =>
    p.tabs.map((t) => t.key),
  ),
);

/** يرجّع true لو الـ key ينتمي لأي تبويبة Extended Technical Delivery. */
export function isExtendedTechnicalTabKey(key: string): boolean {
  return EXTENDED_TAB_KEYS.has(key);
}

/** كل الأكواد المُصنَّفة (للاستعلام السريع). */
const CLASSIFIED_KEYS = new Set<string>(
  NEXVORA_TAB_PHASES.flatMap((p) => p.tabs.map((t) => t.key)),
);

/** خريطة سريعة key → category (للـ WorkflowNav وأي مستهلك خارجي). */
export const TAB_CATEGORY: Readonly<Record<string, TabCategory>> = Object.freeze(
  NEXVORA_TAB_PHASES.reduce<Record<string, TabCategory>>((acc, phase) => {
    for (const tab of phase.tabs) acc[tab.key] = tab.category;
    return acc;
  }, {}),
);

/** الفئة الافتراضية لأي تبويبة غير مُصنَّفة (fallback أخرى) = essential. */
export function getTabCategory(key: string): TabCategory {
  return TAB_CATEGORY[key] ?? "essential";
}

/** مرحلة "أخرى" الافتراضية — أي تبويبة غير مُصنَّفة تنزل هنا. */
const FALLBACK_PHASE_KEY = "other";
const FALLBACK_PHASE_LABEL = "أخرى";

/**
 * ترتب مصفوفة تبويبات (بأي ترتيب) حسب NEXVORA order.
 * ترجّع {phaseKey, phaseLabel, category, item} لكل تبويبة بالترتيب المطلوب،
 * والـ UI يستخدم phaseKey لعرض separator بين المجموعات.
 */
export interface OrderedTab<T> {
  phaseKey: string;
  phaseLabel: string;
  category: TabCategory;
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
    for (const tab of phase.tabs) {
      const item = byKey.get(tab.key);
      if (item) {
        out.push({ phaseKey: phase.key, phaseLabel: phase.label, category: tab.category, item });
        seen.add(tab.key);
      }
    }
  }

  // 2) غير المُصنَّف → phase "أخرى" (يبقى مرئي حتى لو مش في الخريطة)
  for (const item of items) {
    if (!seen.has(item.key) && !CLASSIFIED_KEYS.has(item.key)) {
      out.push({
        phaseKey: FALLBACK_PHASE_KEY,
        phaseLabel: FALLBACK_PHASE_LABEL,
        category: "essential",
        item,
      });
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
    const c = phase.tabs.filter((t) => byKey.get(t.key)).length;
    if (c > 0) counts.set(phase.key, c);
  }
  // fallback count
  const fallback = items.filter((i) => !CLASSIFIED_KEYS.has(i.key)).length;
  if (fallback > 0) counts.set(FALLBACK_PHASE_KEY, fallback);
  return counts;
}
