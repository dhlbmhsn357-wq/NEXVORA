import type { RetrievedEntry } from "@/lib/project-assistant/current-truth-ranking";
import type { UserRole } from "@/lib/types/database";

/**
 * Prompt مساعد المشروع (Phase C) — تركيب إجابة مبنية على أدلة فقط، بلا
 * اختراع، مع استشهادات واضحة وحالة إجابة صريحة (مش رقم ثقة).
 *
 * السياق المُمرَّر هنا **جاهز بالكامل** من Phase B: مُصفّى حسب الصلاحيات
 * ومُرتَّب حسب "الحقيقة الحالية" (currentTruthRank) قبل ما يوصل هنا —
 * الـ prompt ده مسؤوليته الوحيدة إنه يخلي النموذج **يحترم** الترتيب ده،
 * مش يعيد حسابه من الصفر من محتوى خام.
 */

export type RequesterViewpoint = "business" | "developer" | "general";

const SCHEMA_TEMPLATE = `{
  "answer_text": "نص الإجابة الكاملة، بلغة السؤال (عربي أو إنجليزي)",
  "answer_status": "approved | documented | unresolved | not_found",
  "cited_source_ids": ["<id مصدر من القائمة المرقّمة فوق فقط>"],
  "conflict_explained": true
}`;

const CLASSIFICATION_LABELS: Record<string, string> = {
  fact: "حقيقة مؤكَّدة (fact)",
  verified: "مُتحقَّق منه (verified)",
  decision: "قرار (decision)",
  assumption: "افتراض (assumption)",
  hypothesis: "فرضية غير مؤكَّدة (hypothesis)",
  inference: "استنتاج (inference)",
  needs_review: "يحتاج مراجعة (needs_review)",
  legacy: "معلومة قديمة (legacy)",
  unclassified: "غير مصنَّف",
};

function classificationLabel(classification: string | null): string {
  if (!classification) return "غير مصنَّف";
  return CLASSIFICATION_LABELS[classification] ?? classification;
}

/** كشف لغة السؤال — Heuristic بسيط: وجود حروف عربية Unicode، بلا ML. */
export function detectQuestionLanguage(question: string): "ar" | "en" {
  const arabicPattern = /[؀-ۿݐ-ݿ]/;
  return arabicPattern.test(question) ? "ar" : "en";
}

function formatEntry(entry: RetrievedEntry, index: number): string {
  const statusLabel = entry.status ? ` — حالة المصدر: ${entry.status}` : "";
  const domainLabel = entry.domain ? ` — نطاق: ${entry.domain}` : "";
  return [
    `[${index + 1}] id="${entry.id}" — نوع: ${entry.objectType} — العنوان: ${entry.sourceTitle || entry.title}`,
    `    التصنيف: ${classificationLabel(entry.classification)}${statusLabel}${domainLabel}`,
    `    المحتوى: ${entry.content}`,
  ].join("\n");
}

function formatCurrentEntriesBlock(entries: RetrievedEntry[]): string {
  if (entries.length === 0) return "(لا توجد نتائج مسترجَعة من معرفة المشروع لهذا السؤال.)";
  const lines = entries.map((e, i) => formatEntry(e, i));
  return [
    "## المصادر الحالية (current) — مرتَّبة أعلى-لأقل حسب أولوية «الحقيقة الحالية»",
    "الترتيب ده جاهز ومحسوب مسبقًا (current-truth ranking): المصدر رقم [1] أعلى سلطة من [2] وهكذا،",
    "بغض النظر عن أي تشابه نصّي ظاهري — **لا تعيد ترتيب الأولوية بنفسك من محتوى الصفوف**، فقط استخدم الترتيب المُعطى.",
    "",
    lines.join("\n\n"),
  ].join("\n");
}

function formatSupersededBlock(supersededContext: RetrievedEntry[], currentEntries: RetrievedEntry[]): string {
  if (supersededContext.length === 0) return "";
  const currentById = new Map(currentEntries.map((e) => [e.id, e]));
  const pairs = supersededContext
    .filter((old) => old.supersededBy && currentById.has(old.supersededBy))
    .map((old) => {
      const current = currentById.get(old.supersededBy!)!;
      return [
        `### تحديث/استبدال متعلّق بـ "${current.sourceTitle || current.title}" (id="${current.id}")`,
        `- **قديم/متجاوَز** (id="${old.id}"، ${classificationLabel(old.classification)}): ${old.content}`,
        `- **حالي** (id="${current.id}"، ${classificationLabel(current.classification)}): ${current.content}`,
      ].join("\n");
    });

  if (pairs.length === 0) return "";

  return [
    "",
    "## سياق تاريخي (معلومات مُتجاوَزة — للشرح فقط، مش للاستشهاد كإجابة نهائية)",
    "المصادر دي اتحطّت هنا **فقط** عشان تقدر تشرح للمستخدم إن المعلومة اتغيّرت — لو سألك سؤال بيلمس أي واحدة منها،",
    'لازم تستخدم الصيغة دي بالظبط في answer_text: "كانت المعلومة السابقة X، لكن تم تعديلها لاحقًا إلى Y وفق القرار Z."',
    "وحطّ conflict_explained=true. ممنوع تستشهد (cited_source_ids) بمصدر قديم/متجاوَز كأنه هو الإجابة الحالية —",
    "لو استشهدت بيه، خليه بس لتوضيح السياق التاريخي جنب المصدر الحالي.",
    "",
    pairs.join("\n\n"),
  ].join("\n");
}

function viewpointInstruction(viewpoint: RequesterViewpoint): string {
  switch (viewpoint) {
    case "developer":
      return "المستخدم اللي بيسأل مطوّر — رجّح صياغة إجابتك ناحية القواعد التقنية/الحالات (states)/قصص المستخدم/معايير القبول/الحالات الحدّية (edge cases)/الاعتماديات (dependencies) لما تكون متاحة في المصادر. **لكن هذا تغيير في التركيز والصياغة فقط — الحقائق والاستشهادات نفسها لازم تفضل مطابقة تمامًا بغض النظر عن نوع المستخدم، ممنوع تغيير الجوهر.**";
    case "business":
      return "المستخدم اللي بيسأل من جانب الأعمال — رجّح شرحًا بسيطًا وواضحًا بمنطق العمل (الفايدة، الأثر، القرار) بدون تفاصيل تقنية زايدة. **لكن هذا تغيير في التركيز والصياغة فقط — الحقائق والاستشهادات نفسها لازم تفضل مطابقة تمامًا بغض النظر عن نوع المستخدم، ممنوع تغيير الجوهر.**";
    case "general":
    default:
      return "لا يوجد تفضيل واضح لنوع المستخدم — أجب بصياغة متوازنة تناسب أي قارئ.";
  }
}

/**
 * يبني الـ prompt الكامل لمهمة PROJECT_ASSISTANT_QA.
 *
 * `hasPartialInfo`: هل فيه على الأقل مصدر واحد وصل (currentEntries.length > 0)؟
 * بيتحدد بره الدالة دي (في الـ pipeline) عشان الدالة تفضل نقية بالكامل —
 * لكنه بيتحسب هنا برضه من entries.length عشان الاتساق، مفيش حاجة تتمرر زيادة.
 */
export function buildProjectAssistantAnswerPrompt(
  question: string,
  retrievedEntries: RetrievedEntry[],
  supersededContext: RetrievedEntry[],
  requesterRole: UserRole,
  requesterViewpoint: RequesterViewpoint = "general"
): string {
  const language = detectQuestionLanguage(question);
  const languageInstruction =
    language === "ar"
      ? 'استخدم لغة المستخدم: السؤال بالعربية، فأجب بالعربية.'
      : "Use the user's language: the question is in English, so answer in English (keep JSON keys and answer_status values as specified — those are protocol values, not translated text).";

  const currentBlock = formatCurrentEntriesBlock(retrievedEntries);
  const supersededBlock = formatSupersededBlock(supersededContext, retrievedEntries);

  const noInfoInstruction =
    retrievedEntries.length === 0
      ? '**لا توجد أي مصادر مسترجَعة إطلاقًا** — الإجابة الوحيدة الصحيحة هنا: answer_text = "لا توجد معلومات كافية في المشروع لحسم هذا السؤال."، answer_status = "not_found"، cited_source_ids = [].'
      : 'لو المصادر المتاحة **جزئية أو غير كافية** لحسم السؤال بثقة (حتى لو فيه مصادر)، استخدم الصيغة: "هذه النقطة غير محسومة حتى الآن." داخل answer_text، واذكر بوضوح ما هو متاح (fact/decision مؤكَّد) مقابل ما هو غير محسوم (assumption/hypothesis/inference) — **ممنوع تحويل استنتاج (inference) أو افتراض (assumption) إلى حقيقة مؤكَّدة في صياغة الإجابة**.';

  return `أنت مساعد خاص بهذا المشروع.

## القواعد الصارمة (Zero-Invention)
- أجب فقط باستخدام البيانات المقدَّمة من المشروع في المصادر تحت — لا تستخدم أي معرفة عامة خارجية عن المجال.
- لا تخترع قرارات. أي قرار أو قاعدة عمل تذكرها في الإجابة لازم يكون موجودًا حرفيًا في أحد المصادر تحت، وتستشهد بمعرّفه في cited_source_ids.
- ${noInfoInstruction}
- ميّز بوضوح بين تصنيفات المصادر (حقيقة/افتراض/قرار/استنتاج) في صياغة إجابتك — لو مصدرك افتراض أو استنتاج، وضّح ده في النص بدل ما تعرضه وكأنه حقيقة ثابتة.
- المصادر تحت **مرتَّبة مسبقًا** حسب أولوية "الحقيقة الحالية" (أحدث قرار معتمد يتفوق على المعلومات التاريخية) — احترم هذا الترتيب، لا تعيد تقييم الأولوية بنفسك.
- ${languageInstruction}

## توجيه حسب نوع المستخدم (تركيز وصياغة فقط — الحقائق ثابتة)
${viewpointInstruction(requesterViewpoint)}

${currentBlock}
${supersededBlock}

## السؤال
${question}

## المطلوب منك بالضبط
أرجع **JSON فقط** بالشكل التالي بالضبط (لا شرح، لا مقدمة، لا Markdown code fences):

${SCHEMA_TEMPLATE}

قواعد صارمة على الرد:
- answer_status لازم تكون بالظبط واحدة من: "approved" (معتمد — الإجابة مبنية على قرار/مصدر معتمد رسميًا)، "documented" (موثَّق — المعلومة موجودة وموثَّقة لكن مش على مستوى قرار معتمد)، "unresolved" (غير محسوم — المعلومات المتاحة جزئية/متضاربة/غير كافية للحسم)، "not_found" (غير موجود — مفيش أي مصدر ذو صلة إطلاقًا).
- cited_source_ids يجب أن تحتوي فقط على معرّفات id ظهرت **حرفيًا** في قوائم المصادر فوق (الحالية أو التاريخية) — ممنوع اختراع أي id غير موجود هناك.
- لو answer_status="not_found"، لازم cited_source_ids تكون مصفوفة فارغة [].
- conflict_explained=true فقط لو فعلًا استخدمت سياق تاريخي (قديم/متجاوَز) في صياغة الإجابة لشرح تغيّر معلومة؛ غير كده false.
- ممنوع أي مفتاح إضافي أو مفقود عن الأربعة المذكورة بالضبط.`;
}
