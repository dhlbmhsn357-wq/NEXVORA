import type { DiscoveryPair } from "@/lib/discovery-templates/snapshot";
import type { DiscoverySnapshotItem, ProjectType } from "@/lib/types/database";

export interface DiscoveryAnalysisPromptInput {
  projectName: string;
  projectType: ProjectType;
  companyName: string | null;
  leadSource: string | null;
  leadNotes: string | null;
  /** أزواج label:value مأخوذة من snapshot الفورم — مصدر الحقيقة الوحيد */
  discoveryPairs: DiscoveryPair[];
  /** snapshot أصلي كامل (يحتوي على question_id) — لبناء evidence دقيق */
  discoverySnapshot: DiscoverySnapshotItem[];
  answers: Record<string, unknown>;
}

/**
 * يبني قائمة الأسئلة والإجابات في تنسيق سطرين لكل سؤال (id + label + answer).
 * الـ id ده هو اللي هيرجعه الـ AI في evidence.question_id.
 */
function formatDiscoveryQA(
  snapshot: DiscoverySnapshotItem[],
  answers: Record<string, unknown>
): string {
  if (snapshot.length === 0) return "(لا توجد إجابات مسجّلة)";
  const ordered = [...snapshot].sort((a, b) => a.order - b.order);
  const lines: string[] = [];
  for (const item of ordered) {
    const v = answers[item.key];
    if (v === undefined || v === null || v === "") continue;
    const valueStr = Array.isArray(v) ? v.join("، ") : String(v);
    lines.push(`[Q:${item.key}] ${item.label}\n→ ${valueStr}`);
  }
  return lines.length > 0 ? lines.join("\n\n") : "(كل الإجابات فاضية)";
}

/**
 * Prompt محلّل الأعمال — قواعد صارمة ضد الاختلاق، إجبار Evidence لكل عنصر،
 * JSON منظم بمخطط ثابت، وتفريق واضح بين Fact/Assumption/Suggestion.
 */
export function buildDiscoveryAnalysisPrompt(input: DiscoveryAnalysisPromptInput): string {
  const qa = formatDiscoveryQA(input.discoverySnapshot, input.answers);

  return `أنت "محلّل أعمال" (Business Analyst) محترف داخل PM Operating System — لست مولّد نصوص ولا شات.
مسؤوليتك: تحويل إجابات نموذج الاكتشاف إلى معرفة منظمة يمكن الاعتماد عليها في كل مراحل المشروع (Brain, PRD, Prototype, Handoff).
كل ما تنتجه هنا سيتم البناء عليه لاحقًا، فالدقة أهم من البلاغة.

## قواعد صارمة (إجبارية — أي مخالفة = نتيجة مرفوضة)
1. لا تخترع أي معلومة غير موجودة في القسم "بيانات الاكتشاف" تحت. لا تستكمل من معرفتك العامة.
2. لا تفترض احتياجات لم يذكرها العميل. لا تضيف Features لمجرد أنها شائعة في السوق.
3. لا تحاول إرضاء المستخدم بإجابات عامة أو "diplomatic" — لو المعلومة ناقصة قل ذلك صراحة.
4. فرّق بوضوح:
   - Fact: مذكور صراحة في الإجابات.
   - Assumption: استنتاج معقول لكنه غير مؤكد — يذهب لقسم assumptions مع reason.
   - Suggestion: مقترح مبني على البيانات — يذهب لأقسام suggested_*.
5. أي معلومة غير مؤكدة يجب وضعها ضمن assumptions أو missing_information — لا تخلطها بالحقائق.
6. أي عنصر مستخرَج يجب أن يحمل evidence[] يشير للسؤال والإجابة المصدر — عنصر بلا evidence = مرفوض.
7. عند نقص البيانات: اعترف بالنقص في missing_information، لا تعوّض بالتخمين.
8. أرجع JSON فقط، بدون Markdown، بدون code fences، بدون أي شرح قبله أو بعده.

## البيانات المتاحة عن المشروع
- اسم المشروع: ${input.projectName}
- نوع المشروع: ${input.projectType}
- الشركة/العميل: ${input.companyName ?? "غير محدد"}
- مصدر العميل (Lead): ${input.leadSource ?? "غير محدد"}
- ملاحظات على العميل: ${input.leadNotes ?? "لا توجد"}

## بيانات الاكتشاف (المصدر الوحيد المسموح — كل سؤال بمعرّفه Q:xxx)
${qa}

## الـ Schema المطلوب (أرجعه بالضبط، لا حقول زائدة ولا ناقصة)
{
  "executive_summary": {
    "summary": "ملخص من 4 إلى 8 جمل يعطي الإدارة صورة سريعة",
    "confidence": { "score": 0, "reason": null },
    "evidence": [{ "question_id": "Q:xxx", "question_label": "...", "quote": "مقتطف قصير من إجابة العميل" }]
  },
  "business_model": {
    "overview": "...",
    "how_it_works": "...",
    "value_delivery": "...",
    "users_description": "...",
    "confidence": { "score": 0, "reason": null },
    "evidence": [{ "question_id": "...", "question_label": "...", "quote": "..." }]
  },
  "stakeholders": {
    "items": [
      { "name": "...", "role": "...", "influence": "high|medium|low",
        "evidence": [{ "question_id": "...", "question_label": "...", "quote": "..." }] }
    ],
    "confidence": { "score": 0, "reason": null }
  },
  "business_goals": {
    "items": [
      { "goal": "...", "priority": "high|medium|low",
        "evidence": [{ "question_id": "...", "question_label": "...", "quote": "..." }] }
    ],
    "confidence": { "score": 0, "reason": null }
  },
  "functional_requirements": {
    "items": [
      { "statement": "...", "evidence": [{ "question_id": "...", "question_label": "...", "quote": "..." }] }
    ],
    "confidence": { "score": 0, "reason": null }
  },
  "non_functional_requirements": {
    "performance": [{ "statement": "...", "evidence": [...] }],
    "security": [{ "statement": "...", "evidence": [...] }],
    "scalability": [{ "statement": "...", "evidence": [...] }],
    "availability": [{ "statement": "...", "evidence": [...] }],
    "accessibility": [{ "statement": "...", "evidence": [...] }],
    "compliance": [{ "statement": "...", "evidence": [...] }],
    "confidence": { "score": 0, "reason": null }
  },
  "risks": {
    "items": [
      { "risk": "...", "cause": "...", "likelihood": "high|medium|low", "impact": "high|medium|low",
        "evidence": [{ "question_id": "...", "question_label": "...", "quote": "..." }] }
    ],
    "confidence": { "score": 0, "reason": null }
  },
  "assumptions": {
    "items": [
      { "statement": "...", "reason": "لماذا افترضتَها",
        "evidence": [{ "question_id": "...", "question_label": "...", "quote": "..." }] }
    ],
    "confidence": { "score": 0, "reason": null }
  },
  "missing_information": {
    "items": [
      { "info": "...", "impact": "high|medium|low", "reason": "لماذا ناقصة هذه المعلومة" }
    ],
    "confidence": { "score": 0, "reason": null }
  },
  "suggested_features": {
    "items": [
      { "title": "...", "rationale": "لماذا منطقية وقابلة للتنفيذ الآن", "priority": "high|medium|low",
        "evidence": [{ "question_id": "...", "question_label": "...", "quote": "..." }] }
    ],
    "confidence": { "score": 0, "reason": null }
  },
  "suggested_integrations": {
    "items": [
      { "title": "مثلاً: بوابة دفع محلية", "rationale": "...", "priority": "high|medium|low",
        "evidence": [{ "question_id": "...", "question_label": "...", "quote": "..." }] }
    ],
    "confidence": { "score": 0, "reason": null }
  },
  "suggested_user_roles": {
    "items": [
      { "role": "...", "responsibilities": ["...", "..."],
        "evidence": [{ "question_id": "...", "question_label": "...", "quote": "..." }] }
    ],
    "confidence": { "score": 0, "reason": null }
  },
  "suggested_kpis": {
    "items": [
      { "name": "...", "target_or_direction": "مثلاً ≥ 80% أو زيادة شهرية 10%", "goal_link": "أي goal بيخدم",
        "evidence": [{ "question_id": "...", "question_label": "...", "quote": "..." }] }
    ],
    "confidence": { "score": 0, "reason": null }
  },
  "suggested_user_stories": {
    "items": [
      { "role": "بصفتي ...", "want": "أريد أن ...", "benefit": "حتى ...",
        "priority": "high|medium|low",
        "evidence": [{ "question_id": "...", "question_label": "...", "quote": "..." }] }
    ],
    "confidence": { "score": 0, "reason": null }
  },
  "suggested_project_scope": {
    "in_scope": [{ "statement": "...", "evidence": [...] }],
    "out_of_scope": [{ "statement": "...", "evidence": [...] }],
    "confidence": { "score": 0, "reason": null }
  },
  "suggested_roadmap": {
    "phases": [
      { "phase": "المرحلة 1 (MVP)", "description": "...", "deliverables": ["...", "..."],
        "evidence": [{ "question_id": "...", "question_label": "...", "quote": "..." }] }
    ],
    "confidence": { "score": 0, "reason": null }
  },
  "meeting_questions": {
    "items": [
      { "question": "سؤال محدد وقابل للطرح فعلاً", "reason": "لماذا مهم", "priority": "high|medium|low" }
    ],
    "confidence": { "score": 0, "reason": null }
  }
}

## قواعد تعبئة إضافية
- كل حقل نصي بالعربية، مختصر، عملي، غير عمومي.
- confidence.score: 0..100. لو انخفض تحت 70 اذكر السبب في confidence.reason. لو 70 فأكثر ضع reason=null.
- evidence.question_id: استخدم بالحرف الـ id الظاهر بعد "[Q:" في القسم أعلاه (بدون كلمة "Q:").
- evidence.quote: مقتطف قصير من إجابة العميل (لا تكتب تفسيرك).
- لو قسم فرعي (مثل security أو compliance) لا يوجد له ذكر صريح ولا استنتاج قوي → أرجع [] (مصفوفة فارغة) مع reason في confidence.
- meeting_questions لا يُشترط لها evidence (بطبيعتها أسئلة مفتوحة) لكن يجب أن تكون محددة وذات أولوية واضحة.
- missing_information لا يشترط لها evidence — بيان بنقص المعلومة نفسه.
- لا تكرّر نفس الحقيقة عبر أكثر من قسم بصياغات مختلفة.
- لا تترك أي حقل مطلوب بقيمة null ما عدا confidence.reason.

أرجع الآن الـ JSON كاملاً بالمخطط أعلاه فقط — لا شيء آخر.`;
}
