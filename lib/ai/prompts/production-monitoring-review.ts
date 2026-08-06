export interface ReviewIncidentInput {
  id: string;
  title: string;
  root_cause: string;
  fix_prompts_summary: string;
}

export interface ReviewContextInput {
  incidents: ReviewIncidentInput[];
  latestCheckSummary: string;
  engineeringQaSummary: string | null;
  prdSummary: string | null;
  brainSummary: string | null;
  acceptedRecommendationsSummary: string | null;
}

const VERDICT_TYPES = [
  "solved_completely", "solved_partially", "still_exists", "new_issues_introduced",
  "performance_improved", "security_improved", "regression_found",
] as const;

/**
 * حكم مراجعة ما بعد الإصلاح — النموذج بيقترح الحكم لكل حادثة بالدليل،
 * والدرجة الإجمالية (Overall Fix Score) بتتحسب بالكود بعدها (مش من
 * الـ AI مباشرة) — نفس تقسيم "AI يقترح، الكود يحسم الرقم النهائي"
 * المستخدم في Brain Review Validation.
 */
export function buildReviewVerdictPrompt(ctx: ReviewContextInput): string {
  const incidentsBlock = ctx.incidents
    .map((i) => `### [${i.id}] ${i.title}\nالسبب الجذري المسجّل قبل الإصلاح: ${i.root_cause}\nPrompts الإصلاح اللي اتبعتت للمطوّر:\n${i.fix_prompts_summary || "(لا يوجد)"}`)
    .join("\n\n");

  return `أنت مهندس ضمان جودة بتراجع مشروع بعد ما المطوّر رفع كود جديد ادّعى إنه بيصلح حوادث معروفة. مهمتك: تحكم هل فعلًا اتصلحت ولا لأ، بالدليل بس.

## الحوادث المطلوب الحكم عليها (المفتاح بين قوسين مربّعين — استخدمه في الرد)
${incidentsBlock}

## آخر فحص مراقبة بعد الإصلاح
${ctx.latestCheckSummary}

## سياق إضافي للمقارنة (لو متاح)
- Engineering QA: ${ctx.engineeringQaSummary ?? "(غير متاح)"}
- PRD: ${ctx.prdSummary ?? "(غير متاح)"}
- Project Brain: ${ctx.brainSummary ?? "(غير متاح)"}
- توصيات ذكية مقبولة: ${ctx.acceptedRecommendationsSummary ?? "(غير متاح)"}

## المطلوب منك بالضبط
لكل حادثة، احكم بالدليل من الفحص الجديد بس — ممنوع افتراض إن الإصلاح نجح لمجرد إن المطوّر قال كده.

أرجع **JSON فقط** بالشكل ده بالظبط، من غير أي شرح أو Markdown code fences:

{
  "verdicts": [
    {
      "incident_id": "المفتاح بين القوسين المربّعين فوق بالظبط",
      "verdict": "${VERDICT_TYPES.join("\" | \"")}",
      "evidence": "الدليل المحدد من الفحص الجديد اللي بني عليه الحكم",
      "explanation": "شرح مختصر"
    }
  ]
}

قواعد صارمة:
- استخدم فقط incident_id المذكورة فوق — ممنوع اختراع IDs.
- لازم حكم واحد لكل حادثة مذكورة، بلا استثناء.
- لو الدليل غير كافٍ للحكم بثقة، استخدم "still_exists" مع توضيح عدم الكفاية في evidence — ممنوع التفاؤل بدون دليل.
- كل النصوص بالعربية.`;
}
