import type { Dataset } from "./dataset";

/**
 * التحقّق التجاري والسلامة المرجعية — **وحدة نقية بلا I/O**.
 *
 * يفحص قواعد العمل والعلاقات عبر مجموعات البيانات: فاتورة بلا عميل، طلب
 * بلا منتج، سجلّ يتيم (FK يشير لسجلّ غير موجود)، مرجع ناقص. يعتمد على
 * روابط مستنتَجة من أسماء الأعمدة (`customer_id → customers`).
 */

export type BusinessIssueType = "orphan_record" | "missing_reference" | "broken_relation" | "business_rule";

export interface BusinessIssue {
  type: BusinessIssueType;
  object: string;
  field: string;
  rowIndex: number;
  detail: string;
  value: string;
}

/** يستنتج روابط FK من أسماء الأعمدة عبر المجموعات المتاحة. */
export function inferLinks(datasets: Record<string, Dataset>): Array<{ childObject: string; childField: string; parentObject: string; parentKey: string }> {
  const names = Object.keys(datasets);
  const links: Array<{ childObject: string; childField: string; parentObject: string; parentKey: string }> = [];
  for (const child of names) {
    for (const field of datasets[child].fields) {
      if (!/_id$/i.test(field) || field.toLowerCase() === "id") continue;
      const base = field.replace(/_id$/i, "").toLowerCase();
      const parent = names.find((n) => {
        const pl = n.toLowerCase();
        return pl === base || pl === base + "s" || pl === base + "es" || pl.includes(base);
      });
      if (parent && parent !== child) {
        const parentKey = datasets[parent].fields.find((f) => f.toLowerCase() === "id") ?? "id";
        links.push({ childObject: child, childField: field, parentObject: parent, parentKey });
      }
    }
  }
  return links;
}

export function validateReferences(datasets: Record<string, Dataset>): BusinessIssue[] {
  const issues: BusinessIssue[] = [];
  const links = inferLinks(datasets);

  for (const link of links) {
    const parent = datasets[link.parentObject];
    const child = datasets[link.childObject];
    if (!parent || !child) continue;
    const parentKeys = new Set(parent.rows.map((r) => (r[link.parentKey] ?? "").trim()).filter(Boolean));

    child.rows.forEach((row, i) => {
      const fk = (row[link.childField] ?? "").trim();
      if (fk === "") {
        issues.push({ type: "missing_reference", object: link.childObject, field: link.childField, rowIndex: i, value: "", detail: `${link.childObject} بلا ${link.childField} (مرجع ناقص لـ${link.parentObject}).` });
      } else if (!parentKeys.has(fk)) {
        issues.push({ type: "orphan_record", object: link.childObject, field: link.childField, rowIndex: i, value: fk, detail: `${link.childField}=${fk} لا يوجد في ${link.parentObject} (سجلّ يتيم).` });
      }
    });
  }

  return issues;
}

/** قواعد عمل عامة داخل السجلّ الواحد (مستقلة عن الجداول الأخرى). */
export function validateBusinessRules(datasets: Record<string, Dataset>): BusinessIssue[] {
  const issues: BusinessIssue[] = [];
  for (const [name, ds] of Object.entries(datasets)) {
    const fields = ds.fields.map((f) => f.toLowerCase());
    const statusField = ds.fields.find((f) => /(status|state|حالة)/i.test(f));
    const amountField = ds.fields.find((f) => /(amount|total|paid|مبلغ)/i.test(f));

    ds.rows.forEach((row, i) => {
      // فاتورة/طلب بحالة «مدفوع/مكتمل» لكن المبلغ فارغ.
      if (statusField && amountField) {
        const st = (row[statusField] ?? "").toLowerCase();
        const amt = (row[amountField] ?? "").trim();
        if (/(paid|completed|closed|مدفوع|مكتمل|مغلق)/.test(st) && (amt === "" || amt === "0")) {
          issues.push({ type: "business_rule", object: name, field: amountField, rowIndex: i, value: amt, detail: `الحالة «${row[statusField]}» لكن ${amountField} فارغ/صفر — تناقض منطقي.` });
        }
      }
      void fields;
    });
  }
  return issues;
}
