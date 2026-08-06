/**
 * اكتشاف الأنماط — **وحدة نقية بلا I/O**.
 *
 * ## الفلسفة (من المواصفة)
 *
 * «لا تكتفِ بنسخ المعلومات. اكتشف الأنماط: نجاح، فشل، مضادّة، قرارات
 * متكرّرة، أخطاء متكرّرة، قواعد وسير عمل متكرّرة.»
 *
 * الاكتشاف **حتمي**: التكرار عبر المشاريع هو الإشارة. شيء ظهر مرة =
 * حالة؛ ظهر في خمسة مشاريع = نمط. الإشارة (خطر محلول → نجاح، خطأ
 * متكرّر → فشل) تصنّف النمط.
 */

export interface ObservationFragment {
  /** مفتاح موضوعي مطبَّع — الملاحظات بنفس المفتاح تكرار. */
  key: string;
  statement: string;
  projectId: string;
  /** إشارة الطبيعة: resolved_risk/optimization → نجاح؛ mistake/failure → فشل. */
  signal: "success" | "failure" | "neutral";
  kind?: string;
}

export type PatternType = "success_pattern" | "failure_pattern" | "anti_pattern" | "best_practice";

export interface DiscoveredPattern {
  key: string;
  patternType: PatternType;
  statement: string;
  /** عدد المشاريع المتمايزة اللي أظهرت النمط. */
  projectCount: number;
  projectIds: string[];
}

/** أقل عدد مشاريع متمايزة يجعل التكرار «نمطًا» لا حالة. */
const MIN_PROJECTS_FOR_PATTERN = 2;

function normalize(text: string): string {
  return (text ?? "")
    .toLowerCase()
    .replace(/[ً-ْ]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * يكتشف الأنماط من ملاحظات عبر عدّة مشاريع.
 *
 * التجميع بالمفتاح المطبَّع، ثم النوع بالإشارة الغالبة:
 * - غالبية نجاح → نمط نجاح (أو أفضل ممارسة لو تكرّر كثيرًا).
 * - غالبية فشل → نمط فشل.
 * - نجاح وفشل معًا لنفس المفتاح → نمط مضادّ (نجح أحيانًا وفشل أحيانًا).
 */
export function discoverPatterns(fragments: ObservationFragment[]): DiscoveredPattern[] {
  const byKey = new Map<string, ObservationFragment[]>();
  for (const f of fragments) {
    const k = normalize(f.key);
    if (!k) continue;
    const list = byKey.get(k) ?? [];
    list.push(f);
    byKey.set(k, list);
  }

  const patterns: DiscoveredPattern[] = [];

  for (const [key, group] of byKey) {
    const projectIds = [...new Set(group.map((g) => g.projectId))];
    if (projectIds.length < MIN_PROJECTS_FOR_PATTERN) continue; // حالة لا نمط

    const successCount = group.filter((g) => g.signal === "success").length;
    const failureCount = group.filter((g) => g.signal === "failure").length;

    let patternType: PatternType;
    if (successCount > 0 && failureCount > 0) {
      patternType = "anti_pattern"; // متذبذب — نجح وفشل
    } else if (failureCount > successCount) {
      patternType = "failure_pattern";
    } else if (projectIds.length >= 5) {
      patternType = "best_practice"; // نجاح متكرّر بكثرة
    } else {
      patternType = "success_pattern";
    }

    // نختار أوضح صياغة (الأطول عادةً أغنى).
    const statement = group.map((g) => g.statement).sort((a, b) => b.length - a.length)[0];

    patterns.push({ key, patternType, statement, projectCount: projectIds.length, projectIds });
  }

  // الأكثر تكرارًا أولًا.
  return patterns.sort((a, b) => b.projectCount - a.projectCount);
}
