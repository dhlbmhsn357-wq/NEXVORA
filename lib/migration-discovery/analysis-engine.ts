import type { NormalizedSchema } from "./schema-model";
import { computeSchemaStats } from "./schema-model";
import { detectEntities, type DetectedEntity } from "./semantic-detection";
import { analyzeDependencies, type DependencyReport } from "./relationship-intelligence";
import { assessQuality, type QualityBreakdown } from "./quality-model";
import { detectRisks, type Risk } from "./risk-model";
import { detectBusinessFlows, type BusinessFlow } from "./business-flow";
import { detectDomains, estimateComplexity, computeReadiness, type DomainDetection, type Complexity, type ReadinessResult } from "./readiness";

/**
 * محرّك التحليل الحتمي — **وحدة نقية بلا I/O**.
 *
 * يركّب كل محرّكات الاكتشاف على بنية مُطبَّعة واحدة، ويرجّع تحليلًا
 * كاملًا جاهزًا للحفظ ولتغذية تهذيب الذكاء الاصطناعي. **حتمي بالكامل**:
 * نفس المدخل يعطي نفس المخرَج (قابل للاختبار بلا أي عشوائية أو I/O).
 */

export interface FullAnalysis {
  stats: ReturnType<typeof computeSchemaStats>;
  entities: DetectedEntity[];
  dependencies: DependencyReport;
  quality: QualityBreakdown;
  risks: Risk[];
  businessFlows: BusinessFlow[];
  domains: DomainDetection;
  complexity: Complexity;
  readiness: ReadinessResult;
}

export function analyzeSchema(schema: NormalizedSchema): FullAnalysis {
  const stats = computeSchemaStats(schema);
  const entities = detectEntities(schema);
  const dependencies = analyzeDependencies(schema);
  const quality = assessQuality({ schema, dependencies });
  const risks = detectRisks({ schema, dependencies });
  const businessFlows = detectBusinessFlows(entities);
  const domains = detectDomains(entities);
  const complexity = estimateComplexity(schema, dependencies);
  const readiness = computeReadiness({ schema, entities, dependencies, quality, risks });

  return { stats, entities, dependencies, quality, risks, businessFlows, domains, complexity, readiness };
}

/** ملخّص مضغوط للتحليل — يُمرَّر لبرومبت الذكاء الاصطناعي (موفّر للتوكن). */
export function summarizeForPrompt(analysis: FullAnalysis): string {
  const lines: string[] = [];
  lines.push(`الإحصاءات: ${analysis.stats.tables} جدول، ${analysis.stats.columns} عمود، ${analysis.stats.rowCountTotal} صفّ.`);
  lines.push(`نوع النظام (حتمي): ${analysis.domains.systemType}؛ المجالات: ${analysis.domains.domains.join("، ")}.`);
  lines.push(
    `الكيانات المكتشَفة: ${analysis.entities
      .filter((e) => e.entity !== "unknown")
      .slice(0, 25)
      .map((e) => `${e.displayName}[${e.sourceObjects.join("،")}]`)
      .join(" | ") || "(لا شيء)"}`
  );
  lines.push(`الجداول الأساسية: ${analysis.dependencies.coreEntities.join("، ") || "(لا شيء)"}.`);
  lines.push(`الجداول الحرجة: ${analysis.dependencies.criticalTables.join("، ") || "(لا شيء)"}.`);
  lines.push(`تدفّقات الأعمال: ${analysis.businessFlows.map((f) => `${f.name} (${f.coverage}٪)`).join("، ") || "(لا شيء)"}.`);
  lines.push(`الجودة: ${analysis.quality.overall}٪ (اكتمال ${analysis.quality.completeness}، سلامة ${analysis.quality.integrity}).`);
  lines.push(
    `المخاطر (${analysis.risks.length}): ${analysis.risks.map((r) => `${r.title}[${r.severity}]`).join("، ") || "(لا شيء)"}.`
  );
  lines.push(`التعقيد: ${analysis.complexity}؛ الجاهزية الحتمية: ${analysis.readiness.score}/100.`);
  return lines.join("\n");
}
