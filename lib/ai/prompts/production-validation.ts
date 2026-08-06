import type { PRD } from "@/lib/types/database";
import type { BrainContent } from "@/lib/brain-v2/types";
import { formatBrainV2ForPrompt } from "@/lib/brain-v2/downstream-context";
import type { SiteMap } from "@/lib/production-validation/crawler";

const STEP_TYPES = [
  "navigate",
  "click",
  "fill",
  "expect_text",
  "wait",
  "go_back",
  "go_forward",
  "reload",
  "set_offline",
  "set_online",
  "throttle_network",
  "double_click",
  "rapid_click",
] as const;

const STEP_SCHEMA = `{
  "type": ${STEP_TYPES.map((t) => `"${t}"`).join(" | ")},
  "target": "اسم الزر/الرابط/الحقل زي ما يظهر بالظبط في الصفحة (نص مرئي)، أو مسار للـ navigate — اختياري حسب النوع",
  "value": "القيمة المُدخلة (لخطوات fill بس، لو inputKind=valid)",
  "inputKind": "valid" | "empty" | "huge" | "special_chars" | "emoji" | "unicode" | "sql_injection_like" | undefined,
  "description": "وصف مختصر للخطوة بالعربي"
}`;

function formatPRDContext(prd: PRD): string {
  return `## Overview\n${prd.overview}\n\n## Goals\n${prd.goals.map((g) => `- ${g}`).join("\n")}\n\n## User Stories\n${prd.user_stories
    .map((s, i) => `${i + 1}. As a ${s.role}, I want ${s.want}, so that ${s.benefit}`)
    .join("\n")}`;
}

/**
 * Prompt توليد الرحلات (Smart Journey Generation) — بيقرا PRD + Brain +
 * Prototype Prompt + Developer Handoff عشان الرحلات تختلف حسب طبيعة
 * المشروع الفعلية (مش سيناريوهات ثابتة)، ومعاه Site Map حقيقي (روابط
 * وأزرار موجودة فعليًا في التطبيق) عشان الرحلات تشير لعناصر حقيقية.
 */
export function buildJourneyGenerationPrompt(options: {
  prd: PRD | null;
  brain: BrainContent | null;
  prototypePromptSummary: string | null;
  developerHandoffSummary: string | null;
  siteMap: SiteMap;
  stagingUrl: string;
}): string {
  const prdSection = options.prd ? `\n# PRD المعتمد\n${formatPRDContext(options.prd)}\n` : "";
  const brainSection = options.brain ? `\n# Project Brain\n${formatBrainV2ForPrompt(options.brain)}\n` : "";
  const promptSection = options.prototypePromptSummary ? `\n# Prototype Prompt (ملخص)\n${options.prototypePromptSummary}\n` : "";
  const handoffSection = options.developerHandoffSummary ? `\n# Developer Handoff (ملخص)\n${options.developerHandoffSummary}\n` : "";

  return `أنت QA Engineer بشري خبير بتصمّم رحلات اختبار شاملة (End-to-End User Journeys) لتطبيق ويب حقيقي شغّال على ${options.stagingUrl}.
${prdSection}${brainSection}${promptSection}${handoffSection}
# خريطة الموقع الحقيقية (Site Map مُكتشف فعليًا من الصفحة الرئيسية)
عنوان الصفحة الرئيسية: ${options.siteMap.homepageTitle}
روابط حقيقية موجودة:
${options.siteMap.pages.map((p) => `- "${p.text}" → ${p.url}`).join("\n") || "(لا توجد روابط مكتشفة)"}
أزرار/تبويبات حقيقية موجودة:
${options.siteMap.actionLabels.map((a) => `- "${a}"`).join("\n") || "(لا توجد أزرار مكتشفة)"}

## المطلوب منك
صمّم 5 إلى 10 رحلات مستخدم حقيقية تغطي أهم تدفقات المشروع (بناءً على PRD/Brain فوق) — استخدم أسماء الروابط/الأزرار الحقيقية المذكورة فوق قدر الإمكان بدل اختراع أسماء. لازم تشمل بين الرحلات:
- رحلة أساسية بمدخلات صحيحة كاملة (Happy Path).
- رحلة بمدخلات فاضية/ناقصة (inputKind=empty) للتحقق من رسائل الخطأ.
- رحلة بمدخلات ضخمة (inputKind=huge) ورموز خاصة (inputKind=special_chars) واختبار حقن محتمل (inputKind=sql_injection_like).
- رحلة بمدخلات Unicode وEmoji (inputKind=unicode / emoji).
- رحلة تختبر التنقل (Back/Forward/Reload).
- رحلة تختبر انقطاع الاتصال (set_offline ثم set_online) أو بطء الشبكة (throttle_network).
- رحلة نقر متكرر/مزدوج (double_click / rapid_click) على زر إرسال أو حفظ للتأكد من عدم إرسال أكثر من مرة.

كل رحلة لازم تبدأ بخطوة "navigate" أولى (غالبًا "/" أو صفحة الدخول).

أرجع **JSON فقط** بالشكل التالي بالضبط:

{
  "journeys": [
    {
      "journey_key": "kebab-case-فريد",
      "name": "اسم الرحلة بالعربي",
      "goal": "هدف الرحلة",
      "steps": [${STEP_SCHEMA}]
    }
  ]
}

قواعد صارمة:
- أرجع الكائن JSON فقط، من غير أي شرح أو Markdown code fences.
- كل journey_key لازم يكون فريد (kebab-case).
- استخدم أسماء الأزرار/الروابط المذكورة في خريطة الموقع فوق حرفيًا قدر الإمكان في حقل target.
- كل النصوص بالعربية الفصحى، إلا target/value (تفضل زي ما هي).`;
}

const ENRICHMENT_FINDING_SCHEMA = `{
  "finding_key": "مفتاح فريد قصير يمثل نفس المشكلة الأساسية (kebab-case, بدون مسافات)",
  "title": "عنوان مختصر",
  "severity": "critical" | "high" | "medium" | "low" | "info",
  "description": "شرح المشكلة",
  "impact": "الأثر على المستخدم الحقيقي",
  "root_cause": "السبب الجذري المحتمل بناءً على الدليل",
  "recommended_fix": "حل مقترح قابل للتنفيذ",
  "occurrence_count": <عدد مرات ظهور نفس المشكلة الأساسية بين المرشحين المرفقين — دمج التكرارات، مش تكرار نفس الـ Finding>,
  "confidence_score": <0-100>
}`;

/**
 * Prompt إثراء محور واحد — بياخد "مرشحين" (Candidates) اتولّدوا آليًا
 * من دليل حقيقي (خطوة رحلة فشلت فعليًا، Overflow حقيقي، مخالفة
 * axe-core حقيقية) ودور الـ AI هنا إثراء/تفسير/دمج التكرارات بس — مش
 * اختراع وجود مشكلة من الصفر (صفر مجال للـ Hallucination حول "هل
 * المشكلة موجودة" لأن المرشحين أنفسهم دليل مُلتقَط آليًا).
 */
export function buildCategoryEnrichmentPrompt(categoryLabel: string, candidatesJson: string): string {
  return `أنت QA Engineer بتحلل نتائج اختبار End-to-End حقيقي تم تنفيذه فعليًا بمتصفح آلي على محور: **${categoryLabel}**.

# مرشحو المشاكل (Candidates) — كل واحد دليل حقيقي مُلتقَط آليًا (مش تخمين)
${candidatesJson}

## المطلوب منك بالضبط
1. لكل مرشح (أو مجموعة مرشحين بيمثلوا نفس المشكلة الأساسية)، اكتب Finding واحد مُثرى (Enriched) — severity واقعية، وصف واضح، سبب جذري، حل مقترح.
2. **Auto Grouping إلزامي**: لو أكتر من مرشح بيمثلوا نفس المشكلة (نفس رسالة الخطأ أو نفس نوع المخالفة على صفحات مختلفة)، ادمجهم في Finding واحد بس وسجّل occurrence_count الصحيح — ممنوع تكرار نفس المشكلة في أكتر من Finding.
3. لا تخترع مشاكل غير موجودة في المرشحين المرفقين — كل Finding لازم يعتمد على مرشح حقيقي واحد أو أكتر من اللي فوق.
4. لو مرشح مش واضح أو مش مؤكد إنه مشكلة حقيقية، اذكر ده بـ confidence_score منخفض بدل ما تتجاهله أو تبالغ في خطورته.

أرجع **JSON فقط** بالشكل التالي بالضبط:

{
  "summary": "ملخص عام لحالة هذا المحور",
  "findings": [${ENRICHMENT_FINDING_SCHEMA}]
}

كل النصوص بالعربية الفصحى الاحترافية.`;
}
