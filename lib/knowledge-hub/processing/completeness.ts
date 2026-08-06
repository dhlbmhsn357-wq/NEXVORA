import { riskPriority, type Likelihood, type Severity } from "./taxonomy";
import type { ProcessingExtract } from "./validator";

/**
 * حاسبة اكتمال المعرفة لكل مجال — **وحدة نقية**.
 *
 * ## السؤال اللي بتجاوب عليه
 *
 * «هل فهمنا المشروع كفاية؟» مش سؤال ذاتي — له مؤشرات. مجال بلا قواعد
 * عمل ولا سير عمل يعني إما إننا لسه ماستوعبناهوش، أو إن المصدر ناقص.
 * الحاسبة بتحوّل ده لرقم لكل مجال مع **الفجوة المحددة** — مش «٦٠٪»
 * مجرّدة، لكن «ناقص قواعد عمل وقرارات».
 *
 * الحساب هنا لا في القاعدة: القاعدة بتخزّن اللقطة، والاشتقاق منطق
 * أعمال يتغيّر مع فهمنا — تجميده في SQL كان بيربطه بترحيل كل مرة.
 */

export interface DomainCompleteness {
  domain: string;
  score: number;
  counts: {
    entities: number;
    relations: number;
    rules: number;
    workflows: number;
    requirements: number;
    decisions: number;
    risks: number;
  };
  /** الأبعاد الغائبة أو الضعيفة — قابلة للفعل مباشرة. */
  gaps: string[];
  criticalRiskCount: number;
}

/**
 * الأبعاد وأوزانها.
 *
 * الكيانات والعلاقات أساس (أعلى وزن): بلاهم مافيش رسم بياني. القرارات
 * والمخاطر أثقل من المتوسط لأن غيابها بيخفي «ليه» المشروع اتبنى كده —
 * وده أغلى المعرفة وأصعبها إعادة اكتساب.
 */
const DIMENSIONS: Array<{ key: keyof DomainCompleteness["counts"]; weight: number; label: string }> = [
  { key: "entities", weight: 22, label: "الكيانات" },
  { key: "relations", weight: 18, label: "العلاقات بين الكيانات" },
  { key: "rules", weight: 16, label: "قواعد العمل" },
  { key: "workflows", weight: 14, label: "سير العمل" },
  { key: "requirements", weight: 12, label: "المتطلبات" },
  { key: "decisions", weight: 10, label: "القرارات وأسبابها" },
  { key: "risks", weight: 8, label: "المخاطر" },
];

/**
 * أهداف التشبّع — العدد اللي بعده البعد يُعتبر «مغطّى بالكامل».
 *
 * مش خطّي: أول قاعدة عمل أثمن بكتير من العشرين. الوصول للهدف = درجة
 * كاملة للبعد، وما بعده مايزيدش. الأرقام معايرة على مشروع متوسط — لا
 * ضخم يجعل كل مجال ناقصًا، ولا ضئيل يجعل مصدرًا واحدًا «كاملًا».
 */
const SATURATION: Record<keyof DomainCompleteness["counts"], number> = {
  entities: 8,
  relations: 6,
  rules: 4,
  workflows: 2,
  requirements: 5,
  decisions: 3,
  risks: 3,
};

export function computeDomainCompleteness(
  domain: string,
  extract: ProcessingExtract
): DomainCompleteness {
  const counts = {
    entities: extract.entities.length,
    relations: extract.relations.length,
    rules: extract.rules.length,
    workflows: extract.workflows.length,
    requirements: extract.requirements.length,
    decisions: extract.decisions.length,
    risks: extract.risks.length,
  };

  let score = 0;
  const gaps: string[] = [];

  for (const dim of DIMENSIONS) {
    const count = counts[dim.key];
    const target = SATURATION[dim.key];
    const ratio = Math.min(1, count / target);
    score += dim.weight * ratio;

    if (count === 0) {
      gaps.push(`لا يوجد أي ${dim.label} مستخرَج`);
    } else if (ratio < 0.5) {
      gaps.push(`${dim.label} ناقصة (${count} فقط)`);
    }
  }

  const criticalRiskCount = extract.risks.filter((r) => {
    const { level } = riskPriority(r.likelihood as Likelihood, r.severity as Severity);
    return level === "critical";
  }).length;

  return {
    domain,
    score: Math.round(score),
    counts,
    gaps,
    criticalRiskCount,
  };
}

/**
 * يدمج لقطات مجالات متعددة في نظرة مشروع واحدة.
 *
 * المتوسط **مرجَّح بالحجم**: مجال فيه مئة كيان أهم من مجال فيه اثنين،
 * فمتوسطهما البسيط بيضلّل. الوزن بمجموع العناصر بيدّي صورة أصدق لنضج
 * المشروع ككل.
 */
export function aggregateCompleteness(domains: DomainCompleteness[]): {
  overallScore: number;
  totalCriticalRisks: number;
  weakestDomains: string[];
} {
  if (domains.length === 0) {
    return { overallScore: 0, totalCriticalRisks: 0, weakestDomains: [] };
  }

  const sizeOf = (d: DomainCompleteness) =>
    Object.values(d.counts).reduce((a, b) => a + b, 0);

  const totalSize = domains.reduce((sum, d) => sum + sizeOf(d), 0);

  const overallScore =
    totalSize === 0
      ? 0
      : Math.round(
          domains.reduce((sum, d) => sum + d.score * sizeOf(d), 0) / totalSize
        );

  const weakestDomains = [...domains]
    .sort((a, b) => a.score - b.score)
    .slice(0, 3)
    .filter((d) => d.score < 60)
    .map((d) => d.domain);

  return {
    overallScore,
    totalCriticalRisks: domains.reduce((s, d) => s + d.criticalRiskCount, 0),
    weakestDomains,
  };
}
