/**
 * Prompt استخراج غني (Phase 2 — Meeting Intelligence) — بديل
 * meeting-extraction.ts القديم (5 فئات نصية بسيطة) بنسخة أعمق: 13 فئة،
 * وكل عنصر بيحمل درجة ثقة + اقتباس دليل حرفي من النص + تخمين متحدّث.
 * نداء AI واحد بس (مش Pipeline من نداءات منفصلة) — القرار اتاخد صراحة
 * مع صاحب المنتج بعد ما اتوضّح إن مفيش محرك ASR/Diarization حقيقي في
 * الـ Stack أصلًا، فالفصل بين المتحدثين والمواضيع هنا استنتاج نصّي من
 * الـ AI بناءً على السياق، مش تحليل صوتي فعلي.
 */

const ITEM_SCHEMA = `{ "text": "...", "confidence_score": 0-100, "evidence_quote": "اقتباس حرفي 100% من النص", "speaker_guess": "اسم/دور المتحدث لو واضح من السياق، أو null" }`;

export function buildMeetingExtractionPromptV2(transcript: string): string {
  return `أنت محلل أعمال خبير (Business Analyst) بتستخرج معرفة منظّمة من نص تفريغ اجتماع حقيقي بين فريق ووكالة تطوير برمجيات.

## النص المفرّغ
${transcript}

## المطلوب منك بالضبط
استخرج من النص أعلاه **JSON فقط** بالشكل التالي بالضبط، بدون أي نص إضافي قبله أو بعده، وبدون Markdown code fences:

{
  "decisions": [${ITEM_SCHEMA}],
  "functional_requirements": [${ITEM_SCHEMA}],
  "non_functional_requirements": [${ITEM_SCHEMA}],
  "business_rules": [${ITEM_SCHEMA}],
  "pain_points": [${ITEM_SCHEMA}],
  "risks": [${ITEM_SCHEMA}],
  "constraints": [${ITEM_SCHEMA}],
  "questions": [${ITEM_SCHEMA}],
  "ideas": [${ITEM_SCHEMA}],
  "tasks": [${ITEM_SCHEMA}],
  "dependencies": [${ITEM_SCHEMA}],
  "conflicts": [${ITEM_SCHEMA}],
  "missing_information": [${ITEM_SCHEMA}],
  "overall_confidence": 0-100
}

تعريف كل فئة:
- decisions: قرار تم اتخاذه فعليًا وبشكل قاطع في الاجتماع.
- functional_requirements: متطلب وظيفي محدد (النظام لازم يعمل كذا).
- non_functional_requirements: متطلب غير وظيفي (أداء/أمان/قابلية توسع/إلخ).
- business_rules: قاعدة عمل يجب على النظام الالتزام بها (شرط منطقي دائم).
- pain_points: مشكلة أو ألم حالي ذكره العميل عن وضعه الحالي.
- risks: مخاطرة أو مصدر قلق واضح.
- constraints: قيد ثابت (ميزانية/وقت/تقنية/تنظيمي) يحدّ من الحلول الممكنة.
- questions: سؤال مفتوح لم يُجب عليه في الاجتماع.
- ideas: اقتراح أو فكرة أُثيرت للنقاش بدون اعتماد نهائي.
- tasks: عمل محدد لازم ينفّذه حد بعد الاجتماع.
- dependencies: اعتماد بين جزء وجزء تاني (لازم X يخلص قبل Y).
- conflicts: تناقض بين حاجتين اتقالوا في نفس الاجتماع أو مع قرار سابق.
- missing_information: معلومة ضرورية اتضح غيابها أثناء النقاش.

قواعد صارمة (إلزامية 100%):
- أرجع الكائن JSON فقط، من غير أي شرح أو مقدمة أو خاتمة.
- كل evidence_quote لازم يكون اقتباس حرفي 100% من النص المفرّغ فوق — ممنوع الاختلاق. لو مش لاقي اقتباس دقيق، سيبها null.
- confidence_score لازم يعكس ثقتك الحقيقية — رقم منخفض لو الاستنتاج غير مباشر، مش كل حاجة 90+.
- speaker_guess سيبها null لو مفيش أي إشارة واضحة في النص لمين قال الجملة دي.
- لو مفيش عناصر لفئة معينة، أرجع مصفوفة فاضية [] — لا تخترع محتوى.
- لا تصنّف نفس العنصر في أكتر من فئة.
- كل النصوص بنفس لغة النص الأصلي.`;
}
