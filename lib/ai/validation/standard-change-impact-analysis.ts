/**
 * التحقق من رد مهمة STANDARD_CHANGE_IMPACT_ANALYSIS (المرحلة ب) — نفس نمط
 * lib/ai/validation/project-assistant-qa.ts: JSON صالح، مفاتيح مضبوطة،
 * أنواع صحيحة. **الضمانة الحقيقية** ضد الاختراع: أي artifact_id مُشار
 * إليه لازم يكون موجودًا فعليًا في مجموعة المعرّفات الحقيقية اللي كانت
 * متاحة وقت التحليل — إلا لو impact_type="add" (عنصر جديد مقترح، منطقيًا
 * مالوش id حقيقي بعد).
 */

export const IMPACT_TYPE_VALUES = ["add", "modify", "remove"] as const;
export type ImpactTypeValue = (typeof IMPACT_TYPE_VALUES)[number];

export interface ValidatedImpactItem {
  artifactType: string;
  artifactId: string | null;
  artifactLabel: string;
  impactType: ImpactTypeValue;
  reason: string;
  proposedChange: Record<string, unknown>;
  dependencies: string[];
  missingInformation: string;
}

export type ImpactAnalysisValidationResult =
  | { ok: true; data: { impacts: ValidatedImpactItem[] }; warnings: string[] }
  | { ok: false; reason: string };

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isImpactType(value: unknown): value is ImpactTypeValue {
  return typeof value === "string" && (IMPACT_TYPE_VALUES as readonly string[]).includes(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * يتحقق من رد النموذج ويقصّ (بصمت، مع تحذير) أي عنصر أثر بـ artifact_id
 * مش موجود فعليًا في مجموعة المعرّفات الحقيقية اللي اتبعتت للنموذج —
 * **إلا** عناصر impact_type="add" (عنصر جديد مقترح، artifact_id=null
 * منطقيًا). ده الدفاع الحقيقي ضد الهلوسة، مش تعليمة Prompt بنأمل إن
 * النموذج يلتزم بيها.
 *
 * `validArtifactIds`: اتحاد id لكل عناصر بيانات المنتج الحالية اللي فعلًا
 * كانت في الـ prompt (عبر كل النطاقات المُمرَّرة).
 */
export function validateImpactAnalysis(
  raw: string | null,
  validArtifactIds: ReadonlySet<string>
): ImpactAnalysisValidationResult {
  if (!raw || raw.trim().length === 0) {
    return { ok: false, reason: "الرد من نموذج الذكاء الاصطناعي فارغ." };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.trim());
  } catch {
    return { ok: false, reason: "الرد ليس JSON صالحًا." };
  }

  if (!isPlainObject(parsed)) {
    return { ok: false, reason: "الرد ليس كائن JSON." };
  }

  if (!Array.isArray(parsed.impacts)) {
    return { ok: false, reason: "impacts مفقود أو ليس مصفوفة." };
  }

  const warnings: string[] = [];
  const items: ValidatedImpactItem[] = [];

  for (let i = 0; i < parsed.impacts.length; i++) {
    const raw = parsed.impacts[i];
    if (!isPlainObject(raw)) {
      warnings.push(`تم تجاهل عنصر أثر رقم ${i + 1} — ليس كائن JSON صالح.`);
      continue;
    }

    if (!isNonEmptyString(raw.artifact_type)) {
      warnings.push(`تم تجاهل عنصر أثر رقم ${i + 1} — artifact_type مفقود أو فارغ.`);
      continue;
    }

    if (!isImpactType(raw.impact_type)) {
      warnings.push(`تم تجاهل عنصر أثر رقم ${i + 1} — impact_type غير صالحة: "${String(raw.impact_type)}".`);
      continue;
    }

    if (!isNonEmptyString(raw.reason)) {
      warnings.push(`تم تجاهل عنصر أثر رقم ${i + 1} — reason مفقود أو فارغ.`);
      continue;
    }

    const impactType = raw.impact_type as ImpactTypeValue;
    const rawArtifactId = typeof raw.artifact_id === "string" && raw.artifact_id.trim() ? raw.artifact_id.trim() : null;

    // الدفاع الحقيقي ضد الهلوسة: artifact_id لازم يكون حقيقي — إلا لعنصر
    // "add" (عنصر جديد مقترح، لسه معندوش id حقيقي في جدول المنتج).
    let artifactId = rawArtifactId;
    if (impactType !== "add") {
      if (!artifactId || !validArtifactIds.has(artifactId)) {
        warnings.push(
          `تم تجاهل عنصر أثر رقم ${i + 1} (نوع "${raw.artifact_type}") — artifact_id "${artifactId ?? "(مفقود)"}" غير موجود فعليًا في بيانات المشروع الممرَّرة للتحليل، ولا يقبل impact_type="${impactType}" مرجعًا فارغًا.`
        );
        continue;
      }
    } else if (artifactId && !validArtifactIds.has(artifactId)) {
      // impact_type="add" مع artifact_id مخترَع (بدل null الصحيح) — نصفّره بدل ما نرفض العنصر كله.
      warnings.push(
        `عنصر أثر رقم ${i + 1} (impact_type="add") رجّع artifact_id مخترَع "${artifactId}" — تم تفريغه تلقائيًا لعدم الاتساق (عنصر جديد لا يملك id حقيقي).`
      );
      artifactId = null;
    }

    items.push({
      artifactType: raw.artifact_type.trim(),
      artifactId,
      artifactLabel: isNonEmptyString(raw.artifact_label) ? raw.artifact_label.trim() : "",
      impactType,
      reason: raw.reason.trim(),
      proposedChange: isPlainObject(raw.proposed_change) ? raw.proposed_change : {},
      dependencies: isStringArray(raw.dependencies) ? raw.dependencies : [],
      missingInformation: isNonEmptyString(raw.missing_information) ? raw.missing_information.trim() : "",
    });
  }

  return { ok: true, data: { impacts: items }, warnings };
}
