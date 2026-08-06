import type { NormalizedSchema } from "./schema-model";
import type { DetectedEntity, CanonicalEntity } from "./semantic-detection";
import type { DependencyReport } from "./relationship-intelligence";
import type { QualityBreakdown } from "./quality-model";
import type { Risk } from "./risk-model";
import { computeRiskScore } from "./risk-model";

/**
 * جاهزية الترحيل واكتشاف المجال — **وحدة نقية بلا I/O**.
 *
 * يدمج الجودة + المخاطر + التغطية البنيوية في درجة جاهزية واحدة /١٠٠ مع
 * تفسير واضح، ويستنتج نوع النظام ومجالاته من الكيانات المكتشَفة.
 */

export type ProjectDomain =
  | "erp" | "crm" | "lms" | "healthcare" | "accounting" | "hospital"
  | "ecommerce" | "hr" | "school" | "warehouse" | "marketplace" | "custom" | "generic";

/** توقيع كل مجال: كيانات مميّزة تدلّ عليه. */
const DOMAIN_SIGNATURES: Array<{ domain: ProjectDomain; label: string; signals: CanonicalEntity[] }> = [
  { domain: "accounting", label: "نظام محاسبي", signals: ["account", "transaction", "invoice", "payment"] },
  { domain: "crm", label: "نظام إدارة علاقات العملاء", signals: ["customer", "quotation", "ticket", "contract"] },
  { domain: "ecommerce", label: "نظام تجارة إلكترونية", signals: ["product", "order", "payment", "shipment"] },
  { domain: "hospital", label: "نظام مستشفى", signals: ["patient", "appointment", "prescription"] },
  { domain: "school", label: "نظام مدرسي", signals: ["student", "course", "enrollment"] },
  { domain: "hr", label: "نظام موارد بشرية", signals: ["employee", "department"] },
  { domain: "warehouse", label: "نظام مستودعات", signals: ["inventory", "product", "shipment", "supplier"] },
  { domain: "erp", label: "نظام ERP متكامل", signals: ["customer", "supplier", "product", "invoice", "employee", "account"] },
];

export interface DomainDetection {
  domains: ProjectDomain[];
  systemType: string;
  scores: Array<{ domain: ProjectDomain; label: string; score: number }>;
}

export function detectDomains(entities: DetectedEntity[]): DomainDetection {
  const present = new Set(entities.filter((e) => e.entity !== "unknown").map((e) => e.entity));
  const scores = DOMAIN_SIGNATURES.map((sig) => {
    const hits = sig.signals.filter((s) => present.has(s)).length;
    return { domain: sig.domain, label: sig.label, score: Math.round((hits / sig.signals.length) * 100) };
  })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  const strong = scores.filter((s) => s.score >= 50);
  const domains = strong.length > 0 ? strong.map((s) => s.domain) : scores.length > 0 ? [scores[0].domain] : ["custom" as ProjectDomain];

  let systemType: string;
  if (strong.length >= 3 || strong.some((s) => s.domain === "erp")) systemType = "نظام مؤسسي متعدّد المجالات (ERP-like)";
  else if (strong.length === 1) systemType = DOMAIN_SIGNATURES.find((d) => d.domain === strong[0].domain)?.label ?? "نظام مخصّص";
  else if (scores.length > 0) systemType = scores[0].label;
  else systemType = "نظام مخصّص غير مصنّف";

  return { domains, systemType, scores };
}

export type Complexity = "low" | "medium" | "high" | "very_high";

export function estimateComplexity(schema: NormalizedSchema, deps: DependencyReport): Complexity {
  const tables = schema.objects.length;
  const rels = deps.relationships.filter((r) => r.kind !== "missing" && r.kind !== "broken").length;
  const circular = deps.circularChains.length;
  const score = tables + rels * 0.5 + circular * 5;
  if (score >= 120) return "very_high";
  if (score >= 60) return "high";
  if (score >= 25) return "medium";
  return "low";
}

export interface ReadinessInput {
  schema: NormalizedSchema;
  entities: DetectedEntity[];
  dependencies: DependencyReport;
  quality: QualityBreakdown;
  risks: Risk[];
}

export interface ReadinessResult {
  score: number;
  riskScore: number;
  level: "not_ready" | "needs_work" | "mostly_ready" | "ready";
  explanation: string;
  humanReviewNeeded: string[];
}

/**
 * درجة الجاهزية = جودة عالية − مخاطر − نقص بنيوي. التفسير يشرح الرقم،
 * وقائمة المراجعة البشرية تُبرِز ما لا يُحسَم آليًا.
 */
export function computeReadiness({ schema, entities, dependencies, quality, risks }: ReadinessInput): ReadinessResult {
  const riskScore = computeRiskScore(risks);

  if (schema.objects.length === 0) {
    return {
      score: 0,
      riskScore,
      level: "not_ready",
      explanation: "لا توجد بنية مُستخرَجة — أضف مصدرًا صالحًا أولًا.",
      humanReviewNeeded: ["لم يُستخرَج أي جدول — تحقّق من صحّة المصدر أو الملف."],
    };
  }

  // تغطية دلالية: نسبة الكائنات التي فُهم معناها.
  const known = entities.filter((e) => e.entity !== "unknown").reduce((s, e) => s + e.sourceObjects.length, 0);
  const semanticCoverage = Math.round((known / schema.objects.length) * 100);

  // الدرجة: جودة (٥٠٪) + تغطية دلالية (٢٠٪) − مخاطر (حتى ٣٠).
  const base = Math.round(quality.overall * 0.5 + semanticCoverage * 0.2 + 30);
  const score = Math.max(0, Math.min(100, base - Math.round(riskScore * 0.3)));

  const level: ReadinessResult["level"] =
    score >= 80 ? "ready" : score >= 60 ? "mostly_ready" : score >= 35 ? "needs_work" : "not_ready";

  const humanReviewNeeded: string[] = [];
  for (const r of risks.filter((x) => x.severity === "critical" || x.severity === "high")) {
    humanReviewNeeded.push(`${r.title}: ${r.detail}`);
  }
  const unknownEntities = entities.filter((e) => e.entity === "unknown");
  if (unknownEntities.length > 0) {
    humanReviewNeeded.push(`${unknownEntities.length} كائن لم يُفهم معناه دلاليًا — يحتاج تصنيفًا يدويًا.`);
  }
  if (dependencies.circularChains.length > 0) {
    humanReviewNeeded.push("علاقات دائرية تحتاج قرارًا حول ترتيب الترحيل.");
  }

  const explanation =
    `الجاهزية ${score}/100 (${levelLabel(level)}). ` +
    `الجودة العامة ${quality.overall}٪، التغطية الدلالية ${semanticCoverage}٪، ودرجة المخاطر ${riskScore}/100. ` +
    (humanReviewNeeded.length > 0 ? `${humanReviewNeeded.length} بند يحتاج مراجعة بشرية قبل الترحيل.` : "لا عوائق حرجة ظاهرة.");

  return { score, riskScore, level, explanation, humanReviewNeeded };
}

function levelLabel(level: ReadinessResult["level"]): string {
  return {
    not_ready: "غير جاهز",
    needs_work: "يحتاج عملًا",
    mostly_ready: "جاهز غالبًا",
    ready: "جاهز",
  }[level];
}
