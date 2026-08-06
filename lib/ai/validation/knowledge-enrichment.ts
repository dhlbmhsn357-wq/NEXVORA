import { extractJsonObject } from "@/lib/discovery-analysis/validation";

/**
 * مُحقّق نتيجة الإثراء والربط.
 *
 * الحارس الأساسي هنا **حارس المعرّفات**: أي علاقة أو تعارض بيشاور على
 * معرّف مش في القائمة اللي بعتناها بيتشال. من غيره كان النموذج ممكن
 * يخترع عنصرًا ويربطه، فنكتب في قاعدة البيانات علاقة لكيان مش موجود.
 *
 * وحارس تاني أخف بس مهم: العلاقة بين العنصر ونفسه بتتشال — بتحصل لما
 * النموذج يتلخبط في الترقيم، ولو دخلت كانت هتلوّث الشبكة بحلقات فاضية.
 */

export const RELATION_TYPES = [
  "supports",
  "contradicts",
  "duplicates",
  "depends_on",
  "refines",
  "relates_to",
] as const;

export type RelationType = (typeof RELATION_TYPES)[number];

export const RELATION_LABELS: Record<RelationType, string> = {
  supports: "يدعم",
  contradicts: "يتعارض مع",
  duplicates: "مكرّر لـ",
  depends_on: "يعتمد على",
  refines: "يفصّل",
  relates_to: "مرتبط بـ",
};

export interface RelationDraft {
  leftRef: string;
  rightRef: string;
  type: RelationType;
  rationale: string;
  confidence: number;
}

export interface ConflictDraft {
  leftRef: string;
  rightRef: string;
  description: string;
  severity: "high" | "medium" | "low";
}

export interface GlossaryDraft {
  term: string;
  expansion: string;
  note: string;
}

export interface KnowledgeEnrichmentData {
  relations: RelationDraft[];
  conflicts: ConflictDraft[];
  glossary: GlossaryDraft[];
  /** عدد المدخلات اللي اتشالت لأنها بتشاور على معرّف مش موجود. */
  droppedUnknownRef: number;
  /** عدد المدخلات اللي اتشالت لأنها بتربط العنصر بنفسه. */
  droppedSelfLink: number;
}

export type KnowledgeEnrichmentResult =
  | { ok: true; data: KnowledgeEnrichmentData }
  | { ok: false; reason: string };

const SEVERITIES = ["high", "medium", "low"] as const;

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function clampConfidence(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 50;
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function validateKnowledgeEnrichment(
  raw: string | null,
  /** المعرّفات المسموح بها — اللي بعتناها في الـ Prompt. */
  knownRefs: Set<string>
): KnowledgeEnrichmentResult {
  if (!raw || raw.trim().length === 0) {
    return { ok: false, reason: "الرد من نموذج الذكاء الاصطناعي فارغ." };
  }

  const parsed = extractJsonObject(raw);
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, reason: "الرد ليس كائن JSON صالحًا." };
  }
  const obj = parsed as Record<string, unknown>;

  let droppedUnknownRef = 0;
  let droppedSelfLink = 0;

  const checkPair = (left: string, right: string): boolean => {
    if (!knownRefs.has(left) || !knownRefs.has(right)) {
      droppedUnknownRef += 1;
      return false;
    }
    if (left === right) {
      droppedSelfLink += 1;
      return false;
    }
    return true;
  };

  const relations: RelationDraft[] = [];
  const seenRelations = new Set<string>();

  if (Array.isArray(obj.relations)) {
    for (const entry of obj.relations) {
      if (!entry || typeof entry !== "object") continue;
      const o = entry as Record<string, unknown>;

      const leftRef = str(o.left_ref);
      const rightRef = str(o.right_ref);
      if (!checkPair(leftRef, rightRef)) continue;

      const type = str(o.type) as RelationType;
      if (!RELATION_TYPES.includes(type)) continue;

      // منع التكرار داخل نفس الرد: النموذج بيعيد نفس العلاقة أحيانًا،
      // والجدول عنده قيد فريد فالإدراج كان هيفشل بالكامل بسببها.
      const key = `${leftRef}|${rightRef}|${type}`;
      if (seenRelations.has(key)) continue;
      seenRelations.add(key);

      relations.push({
        leftRef,
        rightRef,
        type,
        rationale: str(o.rationale),
        confidence: clampConfidence(o.confidence),
      });
    }
  }

  const conflicts: ConflictDraft[] = [];
  const seenConflicts = new Set<string>();

  if (Array.isArray(obj.conflicts)) {
    for (const entry of obj.conflicts) {
      if (!entry || typeof entry !== "object") continue;
      const o = entry as Record<string, unknown>;

      const leftRef = str(o.left_ref);
      const rightRef = str(o.right_ref);
      if (!checkPair(leftRef, rightRef)) continue;

      const description = str(o.description);
      if (description.length === 0) continue;

      // التعارض بين أ وب هو نفسه بين ب وأ — بنوحّد الاتجاه عشان
      // مانسجّلش نفس التعارض مرتين.
      const key = [leftRef, rightRef].sort().join("|");
      if (seenConflicts.has(key)) continue;
      seenConflicts.add(key);

      const severity = str(o.severity) as (typeof SEVERITIES)[number];
      conflicts.push({
        leftRef,
        rightRef,
        description,
        severity: SEVERITIES.includes(severity) ? severity : "medium",
      });
    }
  }

  const glossary: GlossaryDraft[] = [];
  const seenTerms = new Set<string>();

  if (Array.isArray(obj.glossary)) {
    for (const entry of obj.glossary) {
      if (!entry || typeof entry !== "object") continue;
      const o = entry as Record<string, unknown>;
      const term = str(o.term);
      const expansion = str(o.expansion);
      if (term.length === 0 || expansion.length === 0) continue;

      const key = term.toLowerCase();
      if (seenTerms.has(key)) continue;
      seenTerms.add(key);

      glossary.push({ term, expansion, note: str(o.note) });
    }
  }

  return {
    ok: true,
    data: { relations, conflicts, glossary, droppedUnknownRef, droppedSelfLink },
  };
}
