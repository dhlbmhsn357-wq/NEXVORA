import type { DetectedRelationship } from "@/lib/migration-discovery/relationship-intelligence";
import type { EntityMappingCandidate } from "./entity-matcher";

/**
 * مطابقة العلاقات — **وحدة نقية بلا I/O**.
 *
 * تأخذ علاقات المرحلة ١ (بين الجداول القديمة) وتترجمها لعلاقات بين
 * الكيانات القياسية الجديدة، وتصنّف نوعها في النظام الجديد.
 */

export type NewRelationshipKind = "one_to_one" | "one_to_many" | "many_to_many" | "recursive" | "weak" | "composite";

export interface RelationshipMapping {
  fromEntity: string | null;
  toEntity: string | null;
  fromObject: string;
  toObject: string;
  oldKind: string;
  newKind: NewRelationshipKind;
  confidence: number;
  note: string;
}

const KIND_MAP: Record<string, NewRelationshipKind> = {
  parent_child: "one_to_many",
  one_to_one: "one_to_one",
  many_to_many: "many_to_many",
  recursive: "recursive",
  weak: "weak",
};

export function mapRelationships(
  relationships: DetectedRelationship[],
  entityMappings: EntityMappingCandidate[]
): RelationshipMapping[] {
  const objToEntity = new Map<string, string>();
  for (const em of entityMappings) {
    for (const obj of em.oldObjects) objToEntity.set(obj.toLowerCase(), em.canonicalEntity);
  }

  const out: RelationshipMapping[] = [];
  for (const r of relationships) {
    if (r.kind === "broken" || r.kind === "missing") continue;
    const newKind = KIND_MAP[r.kind] ?? "weak";
    const fromEntity = objToEntity.get(r.from.toLowerCase()) ?? null;
    const toEntity = objToEntity.get(r.to.toLowerCase()) ?? null;
    const composite = r.viaColumns.length > 1;

    out.push({
      fromEntity,
      toEntity,
      fromObject: r.from,
      toObject: r.to,
      oldKind: r.kind,
      newKind: composite ? "composite" : newKind,
      confidence: r.confidence,
      note: composite
        ? "مفتاح مركّب — يحتاج معالجة خاصة في الترحيل."
        : fromEntity && toEntity
        ? `علاقة ${newKind} بين ${fromEntity} و${toEntity}.`
        : "أحد طرفَي العلاقة بلا كيان قياسي مطابق — راجعه.",
    });
  }
  return out;
}
