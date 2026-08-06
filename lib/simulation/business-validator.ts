/**
 * التحقّق التجاري (Business Consistency) — **وحدة نقية بلا I/O**.
 *
 * يتأكّد أن منطق الأعمال لم يتغيّر بعد الترحيل: سلامة عدد السجلات، اكتمال
 * حقول الهوية، عدم انهيار الإجماليات المالية (أرصدة/فواتير/مخزون)، وعدم
 * ظهور قيم سالبة/تالفة في الحقول المالية. مقارنة قديم ← جديد بشفافية.
 */

import type { SimulationPlan, DigitalTwin, EntityBreakdown, BusinessCheck, BusinessReport } from "./simulation-types";

const MONEY_HINT = /(amount|total|balance|price|salary|revenue|tax|qty|quantity|stock|count|credit|debit|due|paid)/i;

function num(v: string): number {
  const n = Number(String(v ?? "").replace(/[,\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export function validateBusiness(plan: SimulationPlan, twin: DigitalTwin, byEntity: EntityBreakdown[]): BusinessReport {
  const checks: BusinessCheck[] = [];

  for (const e of byEntity) {
    // ١) سلامة العدّ: المصدر = المرحَّل + المتخطّى + المؤرشف + الفاشل.
    const accounted = e.migrated + e.skipped + e.archived + e.failed;
    checks.push({
      key: `count:${e.entity}`, title: "سلامة عدد السجلات", entity: e.entity,
      passed: accounted === e.sourceRows,
      oldValue: String(e.sourceRows), newValue: String(accounted),
      message: accounted === e.sourceRows ? "كل السجلات محسوبة." : `تسرّب: ${e.sourceRows - accounted} سجلًا غير محسوب.`,
      severity: "critical",
    });

    const te = twin.entities.get(e.entity);
    if (!te || te.rows.length === 0) continue;

    // ٢) اكتمال الهوية.
    if (te.keyField) {
      const empties = te.rows.filter((r) => !(r[te.keyField as string] ?? "").trim()).length;
      checks.push({
        key: `identity:${e.entity}`, title: "اكتمال حقل الهوية", entity: e.entity,
        passed: empties === 0,
        oldValue: String(te.rows.length), newValue: String(te.rows.length - empties),
        message: empties === 0 ? "كل السجلات لها مفتاح." : `${empties} سجلًا بلا مفتاح هوية.`,
        severity: "high",
      });
    }

    // ٣) الإجماليات المالية: لا انهيار (قديم>0 والجديد=0) ولا قيم سالبة.
    const src = plan.entities.find((p) => p.entity === e.entity);
    const moneyFields = new Set<string>();
    for (const r of te.rows.slice(0, 50)) for (const k of Object.keys(r)) if (MONEY_HINT.test(k)) moneyFields.add(k);
    for (const f of moneyFields) {
      const newSum = te.rows.reduce((s, r) => s + num(r[f]), 0);
      const oldSum = src ? src.rows.reduce((s, r) => s + num(r[f]), 0) : newSum;
      const negatives = te.rows.filter((r) => num(r[f]) < 0).length;
      const collapsed = oldSum > 0 && newSum === 0;
      checks.push({
        key: `money:${e.entity}:${f}`, title: `سلامة الإجمالي المالي (${f})`, entity: e.entity,
        passed: !collapsed && negatives === 0,
        oldValue: fmt(oldSum), newValue: fmt(newSum),
        message: collapsed ? `انهيار إجمالي ${f}: من ${fmt(oldSum)} إلى صفر.` : negatives > 0 ? `${negatives} قيمة سالبة في ${f}.` : `الإجمالي محفوظ (${fmt(newSum)}).`,
        severity: collapsed ? "critical" : "high",
      });
    }
  }

  const failures = checks.filter((c) => !c.passed).length;
  return { checks, failures, passed: failures === 0 };
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}
