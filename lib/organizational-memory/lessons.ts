/**
 * بناء تقرير الدروس المستفادة — **وحدة نقية بلا I/O**.
 *
 * «أنشئ Lessons Learned Report: ما نجح، ما فشل، ما تحسّن، توصيات، نصائح
 * مستقبلية، أخطاء يجب تجنّبها.» ده بيحوّل الإشارات المصنّفة لتقرير
 * منظَّم.
 */

export interface LessonSignal {
  statement: string;
  category: "worked" | "failed" | "improved";
  /** أهمية الدرس ٠–١٠٠ — للترتيب. */
  weight?: number;
}

export interface LessonsReport {
  whatWorked: string[];
  whatFailed: string[];
  whatImproved: string[];
  recommendations: string[];
  avoidThese: string[];
  /** ملخّص سطر واحد. */
  summary: string;
}

/**
 * يبني التقرير من الإشارات المصنّفة.
 *
 * التوصيات تُشتقّ حتميًا: ما نجح → «كرّره»؛ ما فشل → «تجنّبه». التقرير
 * قابل للفعل لا وصفي فقط.
 */
export function buildLessonsReport(signals: LessonSignal[]): LessonsReport {
  const byCat = (cat: LessonSignal["category"]) =>
    signals
      .filter((s) => s.category === cat)
      .sort((a, b) => (b.weight ?? 50) - (a.weight ?? 50))
      .map((s) => s.statement.trim())
      .filter(Boolean);

  const whatWorked = byCat("worked");
  const whatFailed = byCat("failed");
  const whatImproved = byCat("improved");

  const recommendations = [
    ...whatWorked.slice(0, 5).map((s) => `كرّر: ${s}`),
    ...whatImproved.slice(0, 3).map((s) => `عمّم التحسين: ${s}`),
  ];
  const avoidThese = whatFailed.slice(0, 8).map((s) => `تجنّب: ${s}`);

  const summary =
    `${whatWorked.length} ممارسة ناجحة · ${whatFailed.length} إخفاق · ${whatImproved.length} تحسين` ||
    "لا دروس مستخلَصة.";

  return { whatWorked, whatFailed, whatImproved, recommendations, avoidThese, summary };
}
