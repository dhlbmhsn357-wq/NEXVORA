import type { Dataset } from "./dataset";
import { profileDataset, type DatasetProfile } from "./profiling";
import { assessQuality, type DatasetQuality } from "./dimensions";
import { detectDuplicates, type DuplicateGroup } from "./duplicate-detection";
import { validateValue, inferValueKind } from "./validators";
import { normalizeValue } from "./normalization";
import { validateReferences, validateBusinessRules, type BusinessIssue } from "./business-validation";
import { rulesForDomain, countRulesByType, type QualityRule } from "./rules-engine";
import { needsReview, clampConfidence } from "./confidence";

/**
 * محرّك التنظيف — **وحدة نقية بلا I/O**.
 *
 * يركّب كل محرّكات الجودة على مجموعة/مجموعات بيانات ويرجّع **Cleaning
 * Blueprint** كاملًا: تحليل، أبعاد، تكرار، مشاكل (ناقص/غير صالح/تجاري)،
 * تصحيحات مقترَحة (نسخة عمل)، قواعد، ودرجة جودة + تحديث جاهزية. حتمي
 * بالكامل — لا يعدّل الأصل، لا يطبّق شيئًا تلقائيًا.
 */

export type IssueType = "missing" | "invalid" | "duplicate" | "orphan_record" | "missing_reference" | "broken_relation" | "business_rule";

export interface QualityIssue {
  type: IssueType;
  object: string;
  field: string;
  rowIndex: number;
  value: string;
  detail: string;
  suggestion: string | null; // تصحيح مقترَح (نسخة عمل، لا يُطبَّق)
  confidence: number;
  needsReview: boolean;
}

export interface CleaningBlueprint {
  profiles: DatasetProfile[];
  quality: DatasetQuality;
  duplicates: DuplicateGroup[];
  issues: QualityIssue[];
  rules: QualityRule[];
  ruleCounts: Record<string, number>;
  stats: {
    records: number;
    fields: number;
    missing: number;
    invalid: number;
    duplicateGroups: number;
    businessIssues: number;
    reviewQueue: number;
    autoFixable: number;
  };
  qualityScore: number;
  readinessDelta: number; // كم ترتفع الجاهزية لو طُبِّقت التصحيحات
  recommendations: string[];
}

const MAX_ISSUES_PER_TYPE = 5000;

export function buildCleaningBlueprint(datasets: Record<string, Dataset>, domain = "generic"): CleaningBlueprint {
  const names = Object.keys(datasets);
  const profiles: DatasetProfile[] = [];
  const issues: QualityIssue[] = [];
  const allDuplicates: DuplicateGroup[] = [];

  for (const name of names) {
    const ds = datasets[name];
    const profile = profileDataset(ds);
    profiles.push(profile);

    // القيم الناقصة وغير الصالحة على مستوى الخلية (مع سقف للأداء).
    let missingCount = 0;
    let invalidCount = 0;
    for (const fp of profile.fields) {
      const kind = inferValueKind(fp.field);
      ds.rows.forEach((row, i) => {
        const raw = (row[fp.field] ?? "").trim();
        if (raw === "") {
          if (isRequiredField(fp.field) && missingCount < MAX_ISSUES_PER_TYPE) {
            missingCount++;
            issues.push({ type: "missing", object: name, field: fp.field, rowIndex: i, value: "", detail: `قيمة ناقصة في حقل مطلوب «${fp.field}».`, suggestion: null, confidence: 100, needsReview: true });
          }
          return;
        }
        const v = validateValue(kind, raw);
        if (!v.valid && invalidCount < MAX_ISSUES_PER_TYPE) {
          invalidCount++;
          const conf = v.suggestion ? 88 : 70;
          issues.push({ type: "invalid", object: name, field: fp.field, rowIndex: i, value: raw, detail: v.reason ?? "قيمة غير صالحة", suggestion: v.suggestion ?? null, confidence: conf, needsReview: needsReview(conf) });
        } else if (v.valid) {
          // توحيد مقترَح (thلا يُطبَّق).
          const norm = normalizeValue(fp.field, raw);
          if (norm.changed && issues.length < MAX_ISSUES_PER_TYPE * names.length) {
            issues.push({ type: "invalid", object: name, field: fp.field, rowIndex: i, value: raw, detail: `صيغة غير موحّدة (${norm.kind}).`, suggestion: norm.value, confidence: 90, needsReview: needsReview(90) });
          }
        }
      });
    }

    // التكرار.
    const dups = detectDuplicates(ds);
    allDuplicates.push(...dups);
    for (const g of dups) {
      issues.push({
        type: "duplicate",
        object: name,
        field: g.keyField,
        rowIndex: g.members[0].rowIndex,
        value: g.members.map((m) => m.value).join(" | "),
        detail: `${g.members.length} سجلّ متشابه (${g.matchMethod}) — إجراء مقترَح: ${g.suggestedAction}.`,
        suggestion: g.suggestedAction,
        confidence: g.confidence,
        needsReview: needsReview(g.confidence),
      });
    }
  }

  // التحقّق التجاري والسلامة المرجعية (عبر المجموعات).
  const bizRef: BusinessIssue[] = [...validateReferences(datasets), ...validateBusinessRules(datasets)];
  for (const b of bizRef) {
    issues.push({ type: b.type as IssueType, object: b.object, field: b.field, rowIndex: b.rowIndex, value: b.value, detail: b.detail, suggestion: null, confidence: 90, needsReview: true });
  }

  // الأبعاد والجودة (على أول/أكبر مجموعة، وتُجمَّع).
  const primaryProfile = profiles.sort((a, b) => b.records - a.records)[0] ?? profileDataset({ name: "empty", fields: [], rows: [] });
  const quality = assessQuality(primaryProfile);

  const rules = rulesForDomain(domain);
  const ruleCounts = countRulesByType(rules);

  const missing = issues.filter((i) => i.type === "missing").length;
  const invalid = issues.filter((i) => i.type === "invalid").length;
  const duplicateGroups = allDuplicates.length;
  const businessIssues = bizRef.length;
  const reviewQueue = issues.filter((i) => i.needsReview).length;
  const autoFixable = issues.filter((i) => !i.needsReview && i.suggestion).length;

  const records = profiles.reduce((s, p) => s + p.records, 0);
  const fields = profiles.reduce((s, p) => s + p.fields.length, 0);

  const qualityScore = quality.overall;
  // تحسين متوقّع: كل تصحيح قابل للتطبيق يرفع الجودة قليلًا (مسقوف).
  const readinessDelta = Math.min(100 - qualityScore, Math.round((autoFixable / Math.max(1, records)) * 100));

  return {
    profiles,
    quality,
    duplicates: allDuplicates.slice(0, 500),
    issues,
    rules,
    ruleCounts,
    stats: { records, fields, missing, invalid, duplicateGroups, businessIssues, reviewQueue, autoFixable },
    qualityScore,
    readinessDelta,
    recommendations: buildRecommendations({ missing, invalid, duplicateGroups, businessIssues, reviewQueue }),
  };
}

function isRequiredField(field: string): boolean {
  return /(name|email|id|اسم|بريد|رقم)/i.test(field) && !/optional|note|comment|ملاحظة/i.test(field);
}

function buildRecommendations(x: { missing: number; invalid: number; duplicateGroups: number; businessIssues: number; reviewQueue: number }): string[] {
  const recs: string[] = [];
  if (x.duplicateGroups > 0) recs.push(`${x.duplicateGroups} مجموعة تكرار محتمَلة — راجع اقتراحات الدمج قبل الترحيل.`);
  if (x.missing > 0) recs.push(`${x.missing} قيمة ناقصة في حقول مطلوبة — أكملها أو حدّد قيمًا افتراضية.`);
  if (x.invalid > 0) recs.push(`${x.invalid} قيمة غير صالحة/غير موحّدة — راجع التصحيحات المقترَحة.`);
  if (x.businessIssues > 0) recs.push(`${x.businessIssues} مشكلة سلامة مرجعية/قاعدة عمل (سجلّات يتيمة أو مراجع ناقصة).`);
  if (x.reviewQueue > 0) recs.push(`${x.reviewQueue} عنصر بثقة أقل من ٩٥٪ يحتاج اعتماد المدير قبل التطبيق.`);
  if (recs.length === 0) recs.push("جودة البيانات عالية — لا مشاكل حرجة ظاهرة، جاهزة للترحيل بعد مراجعة سريعة.");
  return recs;
}

export { clampConfidence };
