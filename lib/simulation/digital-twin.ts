/**
 * Digital Twin — **بيئة افتراضية في الذاكرة تمثّل النظام الجديد**. وحدة نقية.
 *
 * تحاكي: الجداول، المفاتيح، الفهارس (عبر keyCounts)، والعلاقات. **لا ترتبط
 * بـProduction ولا تكتب أي بيانات حقيقية** — كل صفّ يُحمَّل هنا يعيش في
 * الذاكرة فقط ويُتلَف بنهاية المحاكاة (وهو ما يجعل التراجع آمنًا بطبيعته).
 */

import type { Row } from "@/lib/transformation/rule-types";
import type { DigitalTwin, TwinEntity, RelationshipSpec, EntityPlan } from "./simulation-types";

/** ينشئ Twin فارغًا بمخطّط الكيانات والعلاقات (بلا صفوف). */
export function createTwin(entities: EntityPlan[], relationships: RelationshipSpec[], domain: string): DigitalTwin {
  const map = new Map<string, TwinEntity>();
  for (const e of entities) {
    map.set(e.entity, { entity: e.entity, label: e.label, keyField: e.keyField, rows: [], keyCounts: new Map() });
  }
  return { entities: map, relationships, domain };
}

/** يُحمّل صفًّا محوّلًا داخل كيان في الـTwin (مع تحديث فهرس المفتاح). */
export function loadRow(twin: DigitalTwin, entity: string, row: Row): void {
  const te = twin.entities.get(entity);
  if (!te) return;
  te.rows.push(row);
  if (te.keyField) {
    const v = (row[te.keyField] ?? "").trim();
    if (v) te.keyCounts.set(v, (te.keyCounts.get(v) ?? 0) + 1);
  }
}

/** هل قيمة المفتاح موجودة في كيان (للتحقّق المرجعي FK). */
export function hasKey(twin: DigitalTwin, entity: string, value: string): boolean {
  const te = twin.entities.get(entity);
  if (!te) return false;
  return te.keyCounts.has((value ?? "").trim());
}

/** عدد صفوف كيان في الـTwin. */
export function entityRowCount(twin: DigitalTwin, entity: string): number {
  return twin.entities.get(entity)?.rows.length ?? 0;
}

/** قيم المفتاح المكرّرة (انتهاك تفرّد) داخل كيان. */
export function duplicateKeys(te: TwinEntity): Array<{ value: string; count: number }> {
  const out: Array<{ value: string; count: number }> = [];
  for (const [value, count] of te.keyCounts) if (count > 1) out.push({ value, count });
  return out;
}
