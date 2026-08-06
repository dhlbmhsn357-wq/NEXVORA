import { resolveWeight, sourceLabel } from "./weights";

/** حدود العرض في البرومبت — يمنع تضخّم النص وتجاوز حدود التوكن. */
const MAX_ENTRIES = 40;
const MAX_CONFLICTS = 10;
const MAX_STATEMENT_CHARS = 220;

/**
 * محرّك دمج المعرفة — **وحدة نقية بلا I/O**.
 *
 * ## الفلسفة (من المواصفة)
 *
 * يدمج معرفة المشروع + معرفة المجال + الذكاء + الأبحاث في **نموذج معرفة
 * واحد**، مرجَّح بقوّة كل مصدر. وعند التعارض بين معيار المجال وقرار
 * العميل: **لا يستبدل** — بل يعرض التعارض ويشرح ويوصي، والقرار للمستخدم.
 *
 * ده جوهر التحوّل: من «توليد مستندات» إلى «خبرة مؤسسية تراكمية».
 */

export interface KnowledgeFragment {
  /** مفتاح موضوعي — الشظايا بنفس المفتاح تتحدّث عن نفس الشيء. */
  key: string;
  statement: string;
  source: string;
  /** نوع البند (module/business_rule/...) — للتصنيف. */
  kind?: string;
}

export interface FusedEntry {
  key: string;
  statement: string;
  source: string;
  weight: number;
  kind?: string;
  /** مصادر أخرى تؤكّد نفس المعرفة — تقوّي الثقة. */
  corroboratedBy: string[];
}

export interface FusionConflict {
  key: string;
  /** الطرفان المتعارضان، مرتّبان بالوزن (الأقوى أولًا). */
  sides: Array<{ statement: string; source: string; weight: number }>;
  explanation: string;
  recommendation: string;
}

export interface FusionResult {
  fused: FusedEntry[];
  conflicts: FusionConflict[];
}

/** تطبيع نصّ للمقارنة: تشكيل، همزات، مسافات، حالة. */
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
 * يدمج الشظايا في نموذج واحد مرجَّح، ويكشف التعارضات.
 *
 * لكل مفتاح:
 * - شظية واحدة → تدخل كما هي بوزن مصدرها.
 * - عدّة شظايا **متّفقة** (نفس النصّ المطبَّع) → تُدمَج، والمصادر الأخرى
 *   تُسجَّل كتأكيد (تقوّي الثقة).
 * - عدّة شظايا **متعارضة** → **لا استبدال**: الأقوى وزنًا يدخل النموذج،
 *   لكن التعارض يُسجَّل بكل الأطراف مع شرح وتوصية للمستخدم.
 */
export function fuseKnowledge(
  fragments: KnowledgeFragment[],
  weightOverrides: Partial<Record<string, number>> = {}
): FusionResult {
  const byKey = new Map<string, KnowledgeFragment[]>();
  for (const f of fragments) {
    const k = normalize(f.key);
    if (!k) continue;
    const list = byKey.get(k) ?? [];
    list.push(f);
    byKey.set(k, list);
  }

  const fused: FusedEntry[] = [];
  const conflicts: FusionConflict[] = [];

  for (const [key, group] of byKey) {
    // رتّب بالوزن تنازليًا — الأقوى يمثّل المفتاح.
    const weighted = group
      .map((f) => ({ ...f, weight: resolveWeight(f.source, weightOverrides) }))
      .sort((a, b) => b.weight - a.weight);

    const winner = weighted[0];

    // اجمع النصوص المطبَّعة المتمايزة.
    const distinct = new Map<string, typeof weighted>();
    for (const w of weighted) {
      const nk = normalize(w.statement);
      const arr = distinct.get(nk) ?? [];
      arr.push(w);
      distinct.set(nk, arr);
    }

    if (distinct.size > 1) {
      // تعارض حقيقي — نصوص متمايزة لنفس المفتاح.
      const sides = [...distinct.values()].map((arr) => arr[0]).sort((a, b) => b.weight - a.weight);
      conflicts.push({
        key,
        sides: sides.map((s) => ({ statement: s.statement, source: s.source, weight: s.weight })),
        explanation: buildExplanation(sides[0], sides[1]),
        recommendation: buildRecommendation(sides[0], sides[1]),
      });
    }

    // الأقوى يدخل النموذج دائمًا؛ المصادر المتّفقة الأخرى تأكيد.
    const agreeingSources = weighted
      .filter((w) => normalize(w.statement) === normalize(winner.statement) && w.source !== winner.source)
      .map((w) => w.source);

    fused.push({
      key,
      statement: winner.statement,
      source: winner.source,
      weight: winner.weight,
      kind: winner.kind,
      corroboratedBy: [...new Set(agreeingSources)],
    });
  }

  fused.sort((a, b) => b.weight - a.weight);
  return { fused, conflicts };
}

function buildExplanation(
  strong: { source: string; weight: number },
  weak: { source: string; weight: number }
): string {
  return `${sourceLabel(strong.source)} (وزن ${strong.weight}) يتعارض مع ${sourceLabel(weak.source)} (وزن ${weak.weight}) حول نفس النقطة.`;
}

function buildRecommendation(
  strong: { source: string; weight: number },
  weak: { source: string; weight: number }
): string {
  // معيار المجال لا يتغلّب على قرار العميل — يُنبَّه لا يُطبَّق.
  if (strong.source === "domain_standard" || strong.source === "best_practice") {
    return `المعيار القياسي أقوى وزنًا، لكن قرار العميل يبقى الفصل — راجع «${sourceLabel(weak.source)}» قبل الاعتماد.`;
  }
  return `الأرجح اعتماد «${sourceLabel(strong.source)}» لأعلى وزنه، مع توثيق سبب مخالفة «${sourceLabel(weak.source)}».`;
}

/** يقصّ نصًّا طويلًا مع «…» — يحافظ على حدود التوكن. */
function truncate(text: string, max = MAX_STATEMENT_CHARS): string {
  const t = (text ?? "").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/**
 * يحوّل نتيجة الدمج (الطبقات الثلاث) لكتلة نصية جاهزة تُدرَج في أي برومبت
 * توليد (PRD، Project Brain، ...) — **وحدة نقية بلا I/O**.
 *
 * الفلسفة: المعرفة المدمجة **مرجع استرشادي**، لا مصدر لاختراع حقائق عن
 * المشروع. تُعرَض أقوى البنود مرجَّحة بالمصدر (فمعيار المجال والخبرة
 * المؤسسية يظهران بوزنهما)، ثم التعارضات **معروضة لا محسومة** — تمامًا كما
 * تنصّ فلسفة الدمج. لو لا توجد أي معرفة، يرجّع نصًّا فارغًا فالمولّد
 * يتصرّف كأن الطبقة غير موجودة (توافق كامل مع ما قبلها).
 */
export function formatFusedContextForPrompt(result: FusionResult): string {
  if (result.fused.length === 0 && result.conflicts.length === 0) return "";

  const lines: string[] = [];
  lines.push(
    "## معرفة مؤسسية مدمجة (مرجع استرشادي — الطبقات الثلاث)",
    "معرفة مجمّعة من: معرفة المشروع + معايير المجال + خبرة المؤسسة المتراكمة، مرتّبة بقوّة المصدر (الأعلى وزنًا أوثق). **استرشد بها** لإثراء التحليل وطرح الأسئلة الصحيحة ومحاذاة المخرَج مع معايير المؤسسة — لكن **لا تخترع منها حقائق غير موجودة في بيانات هذا المشروع تحديدًا**، وعند التعارض قرار العميل هو الفصل."
  );

  if (result.fused.length > 0) {
    lines.push("\n### أقوى البنود");
    for (const e of result.fused.slice(0, MAX_ENTRIES)) {
      const corroboration =
        e.corroboratedBy.length > 0
          ? ` (مؤكَّد أيضًا من: ${e.corroboratedBy.map(sourceLabel).join("، ")})`
          : "";
      lines.push(`- [${sourceLabel(e.source)} · وزن ${e.weight}] ${truncate(e.statement)}${corroboration}`);
    }
  }

  if (result.conflicts.length > 0) {
    lines.push("\n### تعارضات تحتاج انتباه (معروضة لا محسومة)");
    for (const c of result.conflicts.slice(0, MAX_CONFLICTS)) {
      const sides = c.sides
        .map((s) => `«${truncate(s.statement, 120)}» (${sourceLabel(s.source)} · ${s.weight})`)
        .join(" مقابل ");
      lines.push(`- ${sides} — ${c.recommendation}`);
    }
  }

  return lines.join("\n");
}
