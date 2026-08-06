/**
 * محرّك إعادة تنفيذ الترحيل (Migration Replay Engine) — **وحدة نقية بلا I/O**.
 *
 * يعيد تنفيذ كل خطوات الترحيل **خطوة بخطوة** داخل الـDigital Twin:
 * Extract → Clean/Transform → Validate → Load → Relationships → Business →
 * Constraints → Permissions → Indexes. لكل خطوة سجلّ (processed/failed/
 * سبب) بحيث يمكن معرفة أي خطوة فشلت ولماذا. يعيد استخدام محرّك المرحلة ٤
 * (transformRow/decideRow) بالكامل — لا يعيد تنفيذه.
 */

import { transformRow } from "@/lib/transformation/pipeline";
import type { Row } from "@/lib/transformation/rule-types";
import { createTwin, loadRow, duplicateKeys, hasKey } from "./digital-twin";
import { deriveExpectations, validateRow } from "./validators";
import type {
  SimulationPlan, ReplayResult, ReplayStepLog, ReplayStage, StepStatus,
  SimIssue, IssueCategory, IssueType, IssueSeverity, RowOutcomes, EntityBreakdown, DigitalTwin,
} from "./simulation-types";
import { SIM_LIMITS } from "./simulation-types";

// تقدير حتمي لزمن كل خطوة (ميكروثانية/صفّ) — لا Wall-clock (يبقى نقيًّا وقابلًا للاختبار).
const MICROS = { extract: 1, clean: 2, transform: 4, validate: 3, load: 1, relationships: 3, business: 2, constraints: 2, permissions: 1, indexes: 2 };

const SEVERITY: Record<IssueType, IssueSeverity> = {
  missing_required: "critical", broken_relation: "critical", business_rule_failure: "critical",
  data_loss: "high", aggregate_drift: "high", count_mismatch: "high", rule_error: "high", orphan_record: "high",
  invalid_email: "medium", invalid_phone: "medium", invalid_date: "medium", invalid_number: "medium", enum_violation: "medium", duplicate_key: "medium",
  empty_output: "low",
};

const CATEGORY: Partial<Record<IssueType, IssueCategory>> = {
  missing_required: "validation", data_loss: "transformation", invalid_email: "validation", invalid_phone: "validation",
  invalid_date: "validation", invalid_number: "validation", enum_violation: "validation", empty_output: "validation",
  duplicate_key: "constraint", rule_error: "transformation", broken_relation: "relationship", orphan_record: "relationship",
  aggregate_drift: "business", count_mismatch: "business", business_rule_failure: "business",
};

function trunc(v: string): string {
  const s = String(v ?? "");
  return s.length > SIM_LIMITS.sampleValueMaxLen ? s.slice(0, SIM_LIMITS.sampleValueMaxLen) + "…" : s;
}

/** مُجمِّع مشاكل — يدمج حسب (entity+type+field) ويقصّ العيّنات. */
class IssueBag {
  private map = new Map<string, SimIssue>();
  add(entity: string, issueType: IssueType, field: string, message: string, sample?: { oldValue: string; newValue: string }, ruleId?: string): void {
    const key = `${entity}|${issueType}|${field}`;
    let it = this.map.get(key);
    if (!it) {
      it = {
        entity, category: CATEGORY[issueType] ?? "validation", issueType, field,
        severity: SEVERITY[issueType], count: 0, message, ruleId, samples: [],
      };
      this.map.set(key, it);
    }
    it.count++;
    if (sample && it.samples.length < SIM_LIMITS.maxSamplesPerIssue) {
      it.samples.push({ oldValue: trunc(sample.oldValue), newValue: trunc(sample.newValue) });
    }
  }
  list(): SimIssue[] {
    const order: Record<IssueSeverity, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    return [...this.map.values()].sort((a, b) => order[a.severity] - order[b.severity] || b.count - a.count);
  }
}

function stepStatus(failed: number, processed: number): StepStatus {
  if (failed === 0) return "passed";
  if (failed >= Math.max(1, Math.ceil(processed * 0.1))) return "failed";
  return "warning";
}

/** يعيد تنفيذ الترحيل كاملًا على الـTwin — القلب النقي للمحاكاة. */
export function replayMigration(plan: SimulationPlan): ReplayResult {
  const twin = createTwin(plan.entities, plan.relationships, plan.domain);
  const bag = new IssueBag();
  const outcomes: RowOutcomes = { migrated: 0, skipped: 0, archived: 0, failed: 0 };
  const byEntity: EntityBreakdown[] = [];

  const counters: Record<ReplayStage, { processed: number; failed: number }> = {
    extract: { processed: 0, failed: 0 }, clean: { processed: 0, failed: 0 }, transform: { processed: 0, failed: 0 },
    validate: { processed: 0, failed: 0 }, load: { processed: 0, failed: 0 }, relationships: { processed: 0, failed: 0 },
    business: { processed: 0, failed: 0 }, constraints: { processed: 0, failed: 0 }, permissions: { processed: 0, failed: 0 },
    indexes: { processed: 0, failed: 0 },
  };

  // ── المرور على الكيانات: Extract → Transform → Validate → Load → Business ──
  for (const ep of plan.entities) {
    const rows = ep.rows.slice(0, SIM_LIMITS.maxRowsPerEntity);
    const expectations = deriveExpectations(ep.rules);
    const eb: EntityBreakdown = { entity: ep.entity, label: ep.label, sourceRows: rows.length, targetRows: 0, migrated: 0, skipped: 0, archived: 0, failed: 0 };

    for (const src of rows) {
      counters.extract.processed++;
      let output: Row;
      try {
        counters.transform.processed++;
        const res = transformRow(ep.rules, plan.businessRules.filter((b) => sameEntity(b.entity, ep.entity)), src, {});
        output = res.output;

        // Validate.
        counters.validate.processed++;
        const vIssues = validateRow(expectations, src, output);
        if (vIssues.length) {
          counters.validate.failed++;
          for (const vi of vIssues) bag.add(ep.entity, vi.issueType as IssueType, vi.field, `حقل ${vi.field}: ${labelIssue(vi.issueType)}`, { oldValue: vi.oldValue, newValue: vi.newValue });
        }

        // Business decision (مصير السجلّ).
        counters.business.processed++;
        const decision = res.decision;
        if (decision.action === "migrate") {
          counters.load.processed++;
          loadRow(twin, ep.entity, output);
          outcomes.migrated++; eb.migrated++; eb.targetRows++;
        } else if (decision.action === "skip") {
          outcomes.skipped++; eb.skipped++;
        } else {
          outcomes.archived++; eb.archived++;
        }
      } catch (err) {
        counters.transform.failed++;
        outcomes.failed++; eb.failed++;
        bag.add(ep.entity, "rule_error", "*", `فشل تنفيذ قاعدة على صفّ: ${(err as Error).message}`, { oldValue: JSON.stringify(src).slice(0, SIM_LIMITS.sampleValueMaxLen), newValue: "" });
      }
    }
    byEntity.push(eb);
  }

  // ── Constraints / Indexes: تفرّد المفاتيح ──
  for (const te of twin.entities.values()) {
    counters.indexes.processed += te.rows.length;
    counters.constraints.processed += te.rows.length;
    for (const dup of duplicateKeys(te)) {
      counters.constraints.failed += dup.count - 1;
      bag.add(te.entity, "duplicate_key", te.keyField ?? "*", `مفتاح مكرّر (${dup.count}×) — ينتهك التفرّد`, { oldValue: dup.value, newValue: dup.value });
    }
  }

  // ── Relationships: بناء العلاقات + التحقّق المرجعي ──
  for (const rel of plan.relationships) {
    const child = twin.entities.get(rel.fromEntity);
    const parent = twin.entities.get(rel.toEntity);
    if (!child || !parent) continue;
    const fk = rel.viaColumns[0];
    if (!fk) continue;
    for (const row of child.rows) {
      counters.relationships.processed++;
      const v = (row[fk] ?? "").trim();
      if (!v) continue; // FK اختياري
      if (!hasKey(twin, rel.toEntity, v)) {
        counters.relationships.failed++;
        bag.add(rel.fromEntity, "broken_relation", fk, `مرجع مكسور: ${rel.fromEntity}.${fk} لا يطابق ${rel.toEntity}`, { oldValue: v, newValue: "—" });
      }
    }
  }

  // ── Permissions: خطوة هيكلية (لا تنفيذ فعلي — بيئة افتراضية) ──
  counters.permissions.processed = byEntity.length;

  const steps = buildSteps(counters);
  return { twin, steps, outcomes, issues: bag.list(), byEntity };
}

function buildSteps(counters: Record<ReplayStage, { processed: number; failed: number }>): ReplayStepLog[] {
  const order: Array<{ stage: ReplayStage; name: string }> = [
    { stage: "extract", name: "الاستخراج (Extraction)" },
    { stage: "clean", name: "التنظيف (Cleaning)" },
    { stage: "transform", name: "التحويل (Transformation)" },
    { stage: "validate", name: "التحقّق (Validation)" },
    { stage: "load", name: "التحميل (Loading)" },
    { stage: "relationships", name: "بناء العلاقات (Relationship Building)" },
    { stage: "business", name: "قواعد العمل (Business Rules)" },
    { stage: "constraints", name: "القيود (Constraints)" },
    { stage: "indexes", name: "الفهارس (Index Creation)" },
    { stage: "permissions", name: "الصلاحيات (Permissions)" },
  ];
  return order.map((o, i) => {
    const c = counters[o.stage];
    // clean يُطوى داخل transform (المرحلة ٣ مدمجة) — نعكس ذلك بصدق.
    const processed = o.stage === "clean" ? counters.transform.processed : c.processed;
    return {
      order: i + 1,
      stage: o.stage,
      name: o.name,
      status: stepStatus(c.failed, processed),
      processed,
      failed: c.failed,
      estimatedMs: Math.round((processed * MICROS[o.stage]) / 1000),
      detail: {},
      errors: [],
    };
  });
}

function sameEntity(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase() || b.toLowerCase().includes(a.toLowerCase()) || a.toLowerCase().includes(b.toLowerCase());
}

function labelIssue(t: string): string {
  const m: Record<string, string> = {
    missing_required: "حقل مطلوب مفقود", data_loss: "فقدان بيانات", invalid_email: "بريد غير صالح",
    invalid_phone: "هاتف غير صالح", invalid_date: "تاريخ غير صالح", invalid_number: "رقم غير صالح",
    enum_violation: "قيمة خارج التعداد", empty_output: "مخرَج فارغ",
  };
  return m[t] ?? t;
}

/** يصدّر الـTwin كإحصاءات قابلة للحفظ (لا صفوف خام). */
export function twinStats(twin: DigitalTwin): Array<{ entity: string; label: string; rows: number; uniqueKeys: number }> {
  return [...twin.entities.values()].map((te) => ({ entity: te.entity, label: te.label, rows: te.rows.length, uniqueKeys: te.keyCounts.size }));
}
