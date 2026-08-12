/**
 * NEXVORA Definition ← Brain Import — Data Access
 * ================================================
 * يبني جسر بيانات باتجاه واحد من Project Brain المعتمد (`brain_review_objects`
 * بحالة approved/approved_with_modification) إلى تعريف المنتج:
 *   - stakeholders                    → Persona draft
 *   - functional_requirements         → Requirement draft (functional)
 *   - non_functional_requirements     → Requirement draft (non_functional)
 *
 * حتمي بالكامل — بلا AI، مجرّد field mapping، بنفس روح
 * lib/scenario-derivation/from-story.ts. Idempotent عبر عمود
 * source_brain_item_key (migration 0112) — العنصر اللي اتستورد قبل كده
 * بيتخطّى تلقائيًا.
 */
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getLatestApprovedBrain } from "@/lib/brain-v2/service";
import { extractFlatItems, type FlatKnowledgeItem } from "@/lib/knowledge-graph/extract-items";
import type { BrainSectionKey } from "@/lib/brain-v2/types";
import { listPersonas, listRequirements, createPersona, createRequirement } from "./service";
import type { RequirementType } from "./types";

/** الحالات المُعتبَرة "معتمدة فعليًا" — مفيش state اسمها "accepted" في المخطط
 * الحالي (brain_review_objects.state)، فأقرب مطابقة هي approved +
 * approved_with_modification. deferred/rejected مُستبعدين عمدًا. */
const ACCEPTED_STATES = new Set(["approved", "approved_with_modification"]);

const SOURCE_SECTIONS: readonly BrainSectionKey[] = [
  "stakeholders",
  "functional_requirements",
  "non_functional_requirements",
];

const INFLUENCE_LABELS: Record<string, string> = {
  high: "مرتفع",
  medium: "متوسط",
  low: "منخفض",
};

const TITLE_MAX_LEN = 140;

export interface PlannedPersonaFromBrain {
  sourceKey: string; // "stakeholders::<item_key>"
  name: string;
  role: string;
  notes: string;
}

export interface PlannedRequirementFromBrain {
  sourceKey: string; // "functional_requirements::<key>" | "non_functional_requirements::<key>"
  title: string;
  description: string;
  requirementType: RequirementType;
}

export interface BrainImportPlan {
  personasToCreate: PlannedPersonaFromBrain[];
  requirementsToCreate: PlannedRequirementFromBrain[];
  alreadyImportedCount: number;
  /** رسالة توضيحية لو الخطة فاضية (مفيش Brain معتمد / مفيش عناصر معتمدة) — null لو الخطة عادية. */
  reason: string | null;
}

function truncateTitle(text: string): string {
  const t = text.trim();
  return t.length > TITLE_MAX_LEN ? `${t.slice(0, TITLE_MAX_LEN - 3)}...` : t;
}

/**
 * Preview — بدون كتابة. يقرأ آخر Brain document معتمد + عناصر المراجعة
 * المعتمدة منه في الأقسام الثلاثة، ويبني خطة الاستيراد بعد استبعاد أي عنصر
 * مستورد بالفعل.
 */
export async function planImportFromBrain(projectId: string): Promise<BrainImportPlan> {
  const empty = (reason: string): BrainImportPlan => ({
    personasToCreate: [], requirementsToCreate: [], alreadyImportedCount: 0, reason,
  });

  const supabase = await createClient();
  const doc = await getLatestApprovedBrain(supabase, projectId);
  if (!doc) {
    return empty("لا يوجد Brain معتمد بعد.");
  }

  const { data: objectsRaw } = await supabase
    .from("brain_review_objects")
    .select("section_key, item_key, state")
    .eq("document_id", doc.id)
    .in("section_key", SOURCE_SECTIONS as string[]);
  const objects = (objectsRaw ?? []) as Array<{ section_key: string; item_key: string; state: string }>;
  const accepted = objects.filter((o) => ACCEPTED_STATES.has(o.state));

  if (accepted.length === 0) {
    return empty("لا توجد عناصر معتمدة (stakeholders/متطلبات) قابلة للاستيراد بعد.");
  }

  const [personas, requirements] = await Promise.all([
    listPersonas(projectId),
    listRequirements(projectId),
  ]);
  const importedKeys = new Set<string>([
    ...personas.map((p) => p.sourceBrainItemKey).filter((k): k is string => !!k),
    ...requirements.map((r) => r.sourceBrainItemKey).filter((k): k is string => !!k),
  ]);

  const flatBySection = new Map<BrainSectionKey, FlatKnowledgeItem[]>();
  for (const section of SOURCE_SECTIONS) {
    flatBySection.set(section, extractFlatItems(section, doc.content[section].content));
  }

  const personasToCreate: PlannedPersonaFromBrain[] = [];
  const requirementsToCreate: PlannedRequirementFromBrain[] = [];
  let alreadyImportedCount = 0;

  for (const obj of accepted) {
    const sourceKey = `${obj.section_key}::${obj.item_key}`;
    if (importedKeys.has(sourceKey)) {
      alreadyImportedCount++;
      continue;
    }
    const flatItems = flatBySection.get(obj.section_key as BrainSectionKey) ?? [];
    const flat = flatItems.find((f) => f.key === obj.item_key);
    // العنصر اتحذف/اتغيّر مفتاحه في المحتوى بعد آخر مراجعة — تخطّاه بأمان بدل ما يكسر الخطة.
    if (!flat) continue;

    if (obj.section_key === "stakeholders") {
      const raw = flat.raw as { name?: string; role?: string; influence?: string };
      const influenceRaw = raw.influence ?? "";
      const influenceLabel = INFLUENCE_LABELS[influenceRaw] ?? influenceRaw;
      personasToCreate.push({
        sourceKey,
        name: (raw.name ?? "").trim() || flat.key,
        role: (raw.role ?? "").trim(),
        notes: influenceLabel ? `مستوى التأثير (من الـ Brain): ${influenceLabel}` : "",
      });
    } else {
      const raw = flat.raw as { statement?: string };
      const statement = (raw.statement ?? "").trim() || flat.key;
      requirementsToCreate.push({
        sourceKey,
        title: truncateTitle(statement),
        description: statement,
        requirementType: obj.section_key === "functional_requirements" ? "functional" : "non_functional",
      });
    }
  }

  return { personasToCreate, requirementsToCreate, alreadyImportedCount, reason: null };
}

/**
 * Apply — يبني الخطة ثم يُنشئ الفعليات كـ draft، كل واحد مربوط بمفتاح
 * Brain المصدر. Idempotent: العناصر المستوردة مسبقًا تُتجاهل تلقائيًا
 * (planImportFromBrain بيستبعدها).
 */
export async function applyImportFromBrain(
  projectId: string,
  userId: string | null,
): Promise<{ personasCreated: number; requirementsCreated: number }> {
  const plan = await planImportFromBrain(projectId);

  for (const p of plan.personasToCreate) {
    await createPersona(
      projectId,
      { name: p.name, role: p.role, notes: p.notes, isPrimary: false, sourceBrainItemKey: p.sourceKey },
      userId,
    );
  }
  for (const r of plan.requirementsToCreate) {
    await createRequirement(
      projectId,
      {
        title: r.title,
        description: r.description,
        requirementType: r.requirementType,
        priority: "should",
        status: "draft",
        sourceBrainItemKey: r.sourceKey,
      },
      userId,
    );
  }

  return {
    personasCreated: plan.personasToCreate.length,
    requirementsCreated: plan.requirementsToCreate.length,
  };
}
