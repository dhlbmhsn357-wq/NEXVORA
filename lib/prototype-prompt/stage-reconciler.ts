/**
 * مطابقة مراحل الـ Prototype Prompt Pipeline بين خطة قائمة وخطة جديدة.
 *
 * المشكلة اللي بيحلّها: إعادة التخطيط كانت بتعمل
 * `delete().eq("plan_id", plan.id)` لكل المراحل قبل ما تنشئ الجديدة —
 * يعني كل البرومتات المتولّدة (content) كانت بتتمسح نهائيًا، ومفيش
 * جدول نسخ للمراحل زي ما فيه للـ PRD. فأي معلومة جديدة (اجتماع، قرار،
 * جلسة اكتشاف) كانت بتكلّف إعادة توليد كل البرومتات من الصفر.
 *
 * القاعدة الجديدة (`additive`): المرحلة القائمة تفضل بمعرّفها ومحتواها
 * و`stage_index` بتاعها زي ما هي. الموديول الجديد بس هو اللي بيتضاف،
 * وبياخد index بعد أعلى index موجود. ده معناه:
 * - البرومتات القديمة مابتتغيّرش ومابتتولدش تاني.
 * - أرقام المراحل ثابتة، فالروابط والمراجع القديمة تفضل صحيحة.
 * - المستخدم بيولّد برومت المرحلة الجديدة بس.
 *
 * `replace` لسه موجود للطلب الصريح ("أعد بناء الخطة بالكامل").
 */

export interface ExistingStage {
  id: string;
  stage_index: number;
  title: string;
  status: string;
  has_content: boolean;
}

export interface PlanModule {
  index: number;
  title: string;
  summary: string;
  depends_on: number[];
}

export interface StageInsert {
  stage_index: number;
  title: string;
  summary: string;
  depends_on: number[];
}

export interface ReconcileResult {
  /** معرّفات المراحل اللي هتفضل زي ما هي — مش بتتحدّث ولا بتتمسح. */
  preservedStageIds: string[];
  /** المراحل الجديدة اللي هتتضاف. */
  inserts: StageInsert[];
  /** المراحل اللي هتتمسح — فاضية دايمًا في وضع additive. */
  deleteStageIds: string[];
  /** مصفوفة modules النهائية اللي تتكتب في صف الخطة. */
  mergedModules: PlanModule[];
  addedCount: number;
  preservedCount: number;
}

/** يوحّد العنوان للمطابقة: مسافات، تطويل، تشكيل، حالة الأحرف. */
export function normalizeTitle(title: string): string {
  return title
    .replace(/[ـ]/g, "")
    .replace(/[ً-ْٰ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function reconcileStages(
  existing: ExistingStage[],
  incomingModules: PlanModule[],
  existingModules: PlanModule[],
  mode: "additive" | "replace"
): ReconcileResult {
  if (mode === "replace") {
    return {
      preservedStageIds: [],
      inserts: incomingModules.map((m) => ({
        stage_index: m.index,
        title: m.title,
        summary: m.summary,
        depends_on: m.depends_on,
      })),
      deleteStageIds: existing.map((s) => s.id),
      mergedModules: incomingModules,
      addedCount: incomingModules.length,
      preservedCount: 0,
    };
  }

  const existingByTitle = new Map<string, ExistingStage>();
  for (const stage of existing) existingByTitle.set(normalizeTitle(stage.title), stage);

  // الـ modules المحفوظة في صف الخطة هي مصدر الحقيقة لوصف المراحل القديمة،
  // لكن لو صف الخطة اتفضى لأي سبب بنعيد بناء الوصف من صفوف المراحل نفسها.
  const preservedModules: PlanModule[] =
    existingModules.length > 0
      ? existingModules
      : existing
          .slice()
          .sort((a, b) => a.stage_index - b.stage_index)
          .map((s) => ({ index: s.stage_index, title: s.title, summary: "", depends_on: [] }));

  let nextIndex = existing.reduce((max, s) => Math.max(max, s.stage_index), -1) + 1;

  // نحدّد الـ index النهائي لكل موديول في الخطة الجديدة قبل ما نبني
  // الـ inserts، عشان نقدر نترجم `depends_on` من ترقيم الخطة الجديدة
  // لترقيم المراحل الفعلي (اللي بيحافظ على أرقام المراحل القديمة).
  const finalIndexByIncoming = new Map<number, number>();
  const newModules: PlanModule[] = [];

  for (const mod of incomingModules) {
    const match = existingByTitle.get(normalizeTitle(mod.title));
    if (match) {
      finalIndexByIncoming.set(mod.index, match.stage_index);
      continue;
    }
    const assigned = nextIndex;
    nextIndex += 1;
    finalIndexByIncoming.set(mod.index, assigned);
    newModules.push({ ...mod, index: assigned });
  }

  // ترجمة الاعتماديات: أي اعتمادية على موديول مش موجود في الخطة الجديدة
  // بتتشال بدل ما تشاور على index غلط.
  const inserts: StageInsert[] = newModules.map((mod) => ({
    stage_index: mod.index,
    title: mod.title,
    summary: mod.summary,
    depends_on: mod.depends_on
      .map((dep) => finalIndexByIncoming.get(dep))
      .filter((v): v is number => typeof v === "number"),
  }));

  const mergedModules = [
    ...preservedModules,
    ...inserts.map((s) => ({
      index: s.stage_index,
      title: s.title,
      summary: s.summary,
      depends_on: s.depends_on,
    })),
  ].sort((a, b) => a.index - b.index);

  return {
    preservedStageIds: existing.map((s) => s.id),
    inserts,
    deleteStageIds: [],
    mergedModules,
    addedCount: inserts.length,
    preservedCount: existing.length,
  };
}

/** ملخّص عربي للتغيير — يتعرض للمستخدم بعد إعادة التخطيط. */
export function describeReconcile(result: ReconcileResult, mode: "additive" | "replace"): string {
  if (mode === "replace") {
    return `أُعيد بناء الخطة بالكامل — ${result.addedCount} مرحلة جديدة، وحُذف ما قبلها.`;
  }
  if (result.addedCount === 0) {
    return `لا توجد مراحل جديدة — الخطة الحالية (${result.preservedCount} مرحلة) تغطّي المستجدّات.`;
  }
  const titles = result.inserts.map((s) => `${s.stage_index + 1}. ${s.title}`).join("، ");
  return `أُضيفت ${result.addedCount} مرحلة جديدة بدون المساس بـ ${result.preservedCount} مرحلة قائمة — ${titles}.`;
}
