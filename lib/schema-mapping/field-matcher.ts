import type { NormalizedObject, NormalizedColumn } from "@/lib/migration-discovery/schema-model";
import { tokenize } from "@/lib/migration-discovery/semantic-detection";
import type { CanonicalEntity } from "@/lib/migration-discovery/semantic-detection";
import { getCanonicalEntity, type CanonicalField } from "./canonical-model";
import { inferTransformation, type TransformationRule } from "./transformation-rules";
import { clampConfidence } from "./confidence";

/**
 * مطابقة الحقول — **وحدة نقية بلا I/O**.
 *
 * لكل عمود قديم، تجد أفضل حقل قياسي في الكيان الجديد **بالمعنى** (مرادفات
 * + نوع + دلائل)، وتحدّد نوع التحويل (مباشر/تقسيم/دمج) وقاعدة التحويل
 * والثقة والسبب والبدائل. الأعمدة بلا نظير تُعرَض لا تُهمَل.
 */

export type FieldMappingKind = "direct" | "split" | "merge" | "multi_source" | "unmapped";

export interface FieldMapping {
  oldObject: string;
  oldField: string;
  newEntity: CanonicalEntity;
  newField: string | null;
  newFieldLabel: string | null;
  kind: FieldMappingKind;
  confidence: number;
  reason: string;
  transformation: TransformationRule;
  suggestions: Array<{ field: string; confidence: number }>;
}

function singular(t: string): string {
  if (t.length > 4 && t.endsWith("ies")) return t.slice(0, -3) + "y";
  if (t.length > 3 && t.endsWith("s") && !t.endsWith("ss")) return t.slice(0, -1);
  return t;
}

/** درجة تطابق عمود مع حقل قياسي (٠-١٠٠): مرادفات + توافق نوع. */
function scoreFieldMatch(col: NormalizedColumn, field: CanonicalField): number {
  const colTokens = new Set(tokenize(col.name).map(singular));
  const colName = col.name.toLowerCase();
  let score = 0;

  for (const syn of field.synonyms) {
    const s = singular(syn.toLowerCase());
    if (colName === s || colTokens.has(s)) {
      score = Math.max(score, 85);
    } else if ([...colTokens].some((t) => t.includes(s) || s.includes(t))) {
      score = Math.max(score, 55);
    }
  }
  if (field.key.toLowerCase() === colName) score = Math.max(score, 90);

  // مكافأة توافق النوع.
  if (score > 0 && typeCompatible(col.dataType, field.type)) score = Math.min(98, score + 8);
  return score;
}

function typeCompatible(oldType: string, newType: string): boolean {
  const o = oldType.toLowerCase();
  const map: Record<string, RegExp> = {
    integer: /int|serial|number|decimal|numeric/,
    decimal: /decimal|numeric|float|double|money|real/,
    currency: /decimal|numeric|money|float|int/,
    date: /date|time/,
    timestamp: /date|time/,
    email: /text|char|varchar|email/,
    phone: /text|char|varchar|int/,
    boolean: /bool|bit|tinyint|int/,
    text: /text|char|varchar|clob|mixed/,
    enum: /text|char|varchar|enum|int/,
  };
  return map[newType]?.test(o) ?? true;
}

/**
 * يطابق كل أعمدة جدول قديم مع حقول الكيان القياسي المستهدف.
 */
export function matchFields(object: NormalizedObject, targetEntity: CanonicalEntity): FieldMapping[] {
  const def = getCanonicalEntity(targetEntity);
  if (!def) {
    return object.columns.map((c) => unmappedField(object.name, c, targetEntity, "لا يوجد نموذج قياسي للكيان المستهدف."));
  }

  return object.columns.map((col) => {
    const scored = def.fields
      .map((field) => ({ field, score: scoreFieldMatch(col, field) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score);

    if (scored.length === 0) {
      return unmappedField(object.name, col, targetEntity, `«${col.name}» بلا نظير واضح في ${def.label} — يحتاج مراجعة.`);
    }

    const best = scored[0];
    const confidence = clampConfidence(best.score);
    const transformation = inferTransformation(col, best.field);
    return {
      oldObject: object.name,
      oldField: col.name,
      newEntity: targetEntity,
      newField: best.field.key,
      newFieldLabel: best.field.label,
      kind: "direct" as FieldMappingKind,
      confidence,
      reason: `«${col.name}» يطابق «${best.field.label}» دلاليًا${transformation.kind !== "none" ? ` (يتطلّب ${transformation.kind})` : ""}.`,
      transformation,
      suggestions: scored.slice(1, 3).map((s) => ({ field: s.field.key, confidence: clampConfidence(s.score) })),
    };
  });
}

function unmappedField(oldObject: string, col: NormalizedColumn, entity: CanonicalEntity, reason: string): FieldMapping {
  return {
    oldObject,
    oldField: col.name,
    newEntity: entity,
    newField: null,
    newFieldLabel: null,
    kind: "unmapped",
    confidence: 0,
    reason,
    transformation: { kind: "none", description: "" },
    suggestions: [],
  };
}

/**
 * كشف حالات التقسيم والدمج على مستوى الحقول:
 * - **merge**: عدّة أعمدة قديمة تشير لنفس الحقل الجديد (first/last name → name).
 * - **multi_source**: نفس الحقل الجديد يأتي من جداول مختلفة.
 */
export function detectSplitMerge(mappings: FieldMapping[]): FieldMapping[] {
  const byTarget = new Map<string, FieldMapping[]>();
  for (const m of mappings) {
    if (!m.newField) continue;
    const key = `${m.newEntity}.${m.newField}`;
    const arr = byTarget.get(key) ?? [];
    arr.push(m);
    byTarget.set(key, arr);
  }
  for (const group of byTarget.values()) {
    if (group.length > 1) {
      const objects = new Set(group.map((m) => m.oldObject));
      const kind: FieldMappingKind = objects.size > 1 ? "multi_source" : "merge";
      for (const m of group) {
        m.kind = kind;
        m.reason = kind === "multi_source"
          ? `${m.reason} — يُدمَج من ${objects.size} جدول (Multi-Source).`
          : `${m.reason} — يُدمَج مع ${group.length - 1} عمود آخر في نفس الحقل (Merge).`;
      }
    }
  }
  return mappings;
}
