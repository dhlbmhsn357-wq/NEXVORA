import { extractJsonObject } from "@/lib/discovery-analysis/validation";
import {
  INSIGHT_TYPES,
  SEVERITIES,
  isInsightType,
  isSeverity,
  type Insight,
  type InsightSourceRef,
  type InsightType,
  type Severity,
} from "@/lib/knowledge-hub/intelligence/insight-model";

/**
 * مُحقّق مخرَج الطبقة الاستشارية.
 *
 * الحارس الأساسي هنا **حارس التأسيس**: الرأي بلا rationale أو impact أو
 * source_refs بيتشال. المستشار اللي بيدّي رأيًا بلا أساس بيهلوس — والرؤى
 * المؤسَّسة بس هي اللي تستحق مكانًا في اللوحة.
 *
 * المصفوفة الفارغة نتيجة صحيحة: معرفة ضئيلة لا تنتج رؤى مؤسَّسة، ورفض
 * ده كان هيجبر النموذج يخترع.
 */

export type IntelligenceValidationResult =
  | { ok: true; data: { insights: Insight[]; dropped: number } }
  | { ok: false; reason: string };

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function clampInt(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(100, Math.round(n)));
}

/** الأنواع اللي النموذج مسموح يرجّعها — التحليلية فقط (الحتمية محسوبة بره). */
const AI_ALLOWED_TYPES: InsightType[] = [
  "architecture",
  "business_process",
  "optimization",
  "risk_prediction",
  "recommendation",
  "opportunity",
];

function normalizeType(value: unknown): InsightType {
  if (isInsightType(value) && AI_ALLOWED_TYPES.includes(value)) return value;
  // نوع خارج المسموح (missing_capability/contradiction محسوبان حتميًا) →
  // نصنّفه توصية عامة بدل ما نسقطه.
  return "recommendation";
}

function normalizeSeverity(value: unknown): Severity {
  return isSeverity(value) ? value : "medium";
}

function parseSourceRefs(value: unknown): InsightSourceRef[] {
  if (!Array.isArray(value)) return [];
  const refs: InsightSourceRef[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const o = entry as Record<string, unknown>;
    const type = str(o.type) || "knowledge";
    const quote = str(o.quote);
    const id = str(o.id);
    if (!quote && !id) continue;
    refs.push({ type, id: id || undefined, quote: quote || undefined });
  }
  return refs;
}

export function validateKnowledgeIntelligence(raw: string | null): IntelligenceValidationResult {
  if (!raw || raw.trim().length === 0) {
    return { ok: false, reason: "الرد من نموذج الذكاء الاصطناعي فارغ." };
  }

  const parsed = extractJsonObject(raw);
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, reason: "الرد ليس كائن JSON صالحًا." };
  }

  const obj = parsed as Record<string, unknown>;
  const insights: Insight[] = [];
  let dropped = 0;
  const seenTitles = new Set<string>();

  if (Array.isArray(obj.insights)) {
    for (const entry of obj.insights) {
      if (!entry || typeof entry !== "object") continue;
      const o = entry as Record<string, unknown>;

      const title = str(o.title);
      const detail = str(o.detail);
      const rationale = str(o.rationale);
      const impact = str(o.impact);
      const sourceRefs = parseSourceRefs(o.source_refs);

      // حارس التأسيس: بلا عنوان أو تفصيل أو سبب أو أثر أو مصدر = يُشال.
      if (!title || !detail || !rationale || !impact || sourceRefs.length === 0) {
        dropped += 1;
        continue;
      }

      // منع التكرار داخل نفس الرد.
      const key = title.toLowerCase().replace(/\s+/g, " ");
      if (seenTitles.has(key)) {
        dropped += 1;
        continue;
      }
      seenTitles.add(key);

      insights.push({
        insightType: normalizeType(o.insight_type),
        title,
        detail,
        rationale,
        impact,
        module: str(o.module) || null,
        severity: normalizeSeverity(o.severity),
        effort: clampInt(o.effort, 50),
        confidence: clampInt(o.confidence, 60),
        sourceRefs,
      });
    }
  }

  return { ok: true, data: { insights, dropped } };
}

/** أنواع الرؤى المتاحة للنموذج — للتوثيق والاختبار. */
export { AI_ALLOWED_TYPES, INSIGHT_TYPES, SEVERITIES };
