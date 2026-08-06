import type { NormalizedObject, NormalizedSchema } from "@/lib/migration-discovery/schema-model";
import { classifyObject } from "@/lib/migration-discovery/semantic-detection";
import type { CanonicalEntity } from "@/lib/migration-discovery/semantic-detection";
import { isMappableEntity, canonicalEntityLabel } from "./canonical-model";
import { clampConfidence } from "./confidence";

/**
 * مطابقة الكيانات — **وحدة نقية بلا I/O**.
 *
 * تربط كل جدول/مجموعة قديمة بالكيان القياسي المناسب في النظام الجديد،
 * **بالمعنى لا بالاسم** (تعيد استخدام المطابقة الدلالية للمرحلة ١).
 * `tbl_customer / clients / crm_client / customer_master` → Customer.
 * تدمج الجداول المتعدّدة لنفس الكيان (Multi-Source على مستوى الكيان).
 */

export interface EntityMappingCandidate {
  oldObjects: string[];
  canonicalEntity: CanonicalEntity;
  canonicalLabel: string;
  confidence: number;
  reason: string;
  /** بدائل محتملة عند وجود أكثر من احتمال. */
  alternatives: Array<{ entity: CanonicalEntity; confidence: number }>;
}

export interface UnmappedObject {
  object: string;
  reason: string;
}

export interface EntityMappingResult {
  mappings: EntityMappingCandidate[];
  unmapped: UnmappedObject[];
}

export function matchEntities(schema: NormalizedSchema): EntityMappingResult {
  const byEntity = new Map<CanonicalEntity, EntityMappingCandidate>();
  const unmapped: UnmappedObject[] = [];

  for (const obj of schema.objects) {
    const hit = classifyObject(obj);
    if (!hit || !isMappableEntity(hit.spec.entity)) {
      unmapped.push({
        object: obj.name,
        reason: hit ? `صُنِّف كـ«${hit.spec.entity}» لكن لا يوجد نموذج قياسي له بعد.` : "لم يُفهم معناه دلاليًا — يحتاج مطابقة يدوية.",
      });
      continue;
    }

    const confidence = clampConfidence(hit.confidence);
    const existing = byEntity.get(hit.spec.entity);
    if (existing) {
      existing.oldObjects.push(obj.name);
      existing.confidence = Math.max(existing.confidence, confidence);
      existing.reason = `مجمّع من ${existing.oldObjects.length} جدول تمثّل نفس الكيان (Multi-Source).`;
    } else {
      byEntity.set(hit.spec.entity, {
        oldObjects: [obj.name],
        canonicalEntity: hit.spec.entity,
        canonicalLabel: canonicalEntityLabel(hit.spec.entity),
        confidence,
        reason: `تطابق دلالي: أسماء/محتوى «${obj.name}» تدلّ على كيان ${canonicalEntityLabel(hit.spec.entity)}.`,
        alternatives: alternativesFor(obj),
      });
    }
  }

  return { mappings: [...byEntity.values()].sort((a, b) => b.confidence - a.confidence), unmapped };
}

/** أفضل بديلين آخرين للكيان (للاقتراحات). */
function alternativesFor(obj: NormalizedObject): Array<{ entity: CanonicalEntity; confidence: number }> {
  // classifyObject يعيد الأفضل فقط؛ البدائل تُترك فارغة هنا وتُثرى بالذكاء
  // الاصطناعي عند الحاجة (تفادي منطق مكرّر).
  void obj;
  return [];
}
