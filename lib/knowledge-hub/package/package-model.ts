/**
 * نموذج حزمة المعرفة — **وحدة نقية بلا I/O**.
 *
 * ## ما هي حزمة المعرفة
 *
 * لقطة قابلة للنقل (JSON) للمعرفة مع **إصداراتها وعلاقاتها وبياناتها
 * الوصفية**. هي وحدة **التصدير والنسخ الاحتياطي والاستيراد** معًا — نفس
 * البنية للثلاثة.
 *
 * الوحدة دي بتعرّف الشكل، بتبنيه، وبتتحقّق منه عند الاستيراد. القراءة
 * والكتابة الفعلية من القاعدة شغل الخدمات.
 */

/** إصدار صيغة الحزمة — يتغيّر لو البنية اتغيّرت، عشان الاستيراد يرفض الأحدث. */
export const PACKAGE_FORMAT_VERSION = 1;

export interface PackageObject {
  /** نوع الكائن: item · entity · rule · requirement · decision · risk · ... */
  type: string;
  /** معرّف أصلي — يُحفظ للتتبّع، لا يُفرض عند الاستيراد. */
  sourceId: string;
  data: Record<string, unknown>;
  /** إصدارات الكائن (إن وُجدت) — للحفاظ على التاريخ. */
  versions?: Array<Record<string, unknown>>;
}

export interface PackageRelation {
  fromType: string;
  fromSourceId: string;
  toType: string;
  toSourceId: string;
  relationType: string;
}

export interface KnowledgePackage {
  formatVersion: number;
  projectId: string;
  projectName: string;
  generatedAt: string;
  piiMasked: boolean;
  counts: Record<string, number>;
  objects: PackageObject[];
  relations: PackageRelation[];
}

export interface BuildPackageInput {
  projectId: string;
  projectName: string;
  generatedAt: string;
  piiMasked: boolean;
  objects: PackageObject[];
  relations: PackageRelation[];
}

/**
 * يبني الحزمة من الكائنات والعلاقات، ويحسب العدّادات.
 */
export function buildPackage(input: BuildPackageInput): KnowledgePackage {
  const counts: Record<string, number> = {};
  for (const obj of input.objects) {
    counts[obj.type] = (counts[obj.type] ?? 0) + 1;
  }
  counts.relations = input.relations.length;

  return {
    formatVersion: PACKAGE_FORMAT_VERSION,
    projectId: input.projectId,
    projectName: input.projectName,
    generatedAt: input.generatedAt,
    piiMasked: input.piiMasked,
    counts,
    objects: input.objects,
    relations: input.relations,
  };
}

export type PackageValidation =
  | { ok: true; package: KnowledgePackage }
  | { ok: false; reason: string };

/**
 * يتحقّق من صحة حزمة قبل الاستيراد.
 *
 * الرفض الصريح أأمن من الاستيراد الجزئي: صيغة أحدث من المدعومة، أو بنية
 * ناقصة، أو علاقة تشير لكائن غير موجود في الحزمة — كلها تُرفَض بسبب
 * واضح بدل ما تدخل بيانات مكسورة.
 */
export function validatePackage(raw: unknown): PackageValidation {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, reason: "الحزمة ليست كائنًا صالحًا." };
  }
  const p = raw as Record<string, unknown>;

  const formatVersion = Number(p.formatVersion);
  if (!Number.isInteger(formatVersion) || formatVersion < 1) {
    return { ok: false, reason: "إصدار صيغة الحزمة غير صالح." };
  }
  if (formatVersion > PACKAGE_FORMAT_VERSION) {
    return {
      ok: false,
      reason: `الحزمة بصيغة أحدث (${formatVersion}) من المدعومة (${PACKAGE_FORMAT_VERSION}) — حدّث النظام أولًا.`,
    };
  }

  if (!Array.isArray(p.objects)) {
    return { ok: false, reason: "الحزمة بلا مصفوفة objects." };
  }

  const objects: PackageObject[] = [];
  const objectKeys = new Set<string>();
  for (const entry of p.objects) {
    if (!entry || typeof entry !== "object") continue;
    const o = entry as Record<string, unknown>;
    const type = typeof o.type === "string" ? o.type : "";
    const sourceId = typeof o.sourceId === "string" ? o.sourceId : "";
    if (!type || !sourceId || typeof o.data !== "object" || o.data === null) continue;
    objects.push({
      type,
      sourceId,
      data: o.data as Record<string, unknown>,
      versions: Array.isArray(o.versions) ? (o.versions as Array<Record<string, unknown>>) : undefined,
    });
    objectKeys.add(`${type}::${sourceId}`);
  }

  if (objects.length === 0) {
    return { ok: false, reason: "الحزمة لا تحتوي كائنات صالحة." };
  }

  const relations: PackageRelation[] = [];
  if (Array.isArray(p.relations)) {
    for (const entry of p.relations) {
      if (!entry || typeof entry !== "object") continue;
      const r = entry as Record<string, unknown>;
      const rel: PackageRelation = {
        fromType: String(r.fromType ?? ""),
        fromSourceId: String(r.fromSourceId ?? ""),
        toType: String(r.toType ?? ""),
        toSourceId: String(r.toSourceId ?? ""),
        relationType: String(r.relationType ?? ""),
      };
      if (!rel.fromSourceId || !rel.toSourceId || !rel.relationType) continue;
      // العلاقة اللي طرفها مش في الحزمة تُسقَط — لا تُبنى علاقة معلّقة.
      if (!objectKeys.has(`${rel.fromType}::${rel.fromSourceId}`)) continue;
      if (!objectKeys.has(`${rel.toType}::${rel.toSourceId}`)) continue;
      relations.push(rel);
    }
  }

  const counts: Record<string, number> = {};
  for (const obj of objects) counts[obj.type] = (counts[obj.type] ?? 0) + 1;
  counts.relations = relations.length;

  return {
    ok: true,
    package: {
      formatVersion,
      projectId: String(p.projectId ?? ""),
      projectName: String(p.projectName ?? ""),
      generatedAt: String(p.generatedAt ?? ""),
      piiMasked: Boolean(p.piiMasked),
      counts,
      objects,
      relations,
    },
  };
}
