import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { getProvider } from "./registry";
import { withTimeout } from "./retry";
import { AIError } from "./errors";
import { AIEmbeddingResponse, AIProviderName, AIRequestContext, AIResponse, AITaskType } from "./types";
import { routeExecution } from "@/lib/migration/ai-adapter";
import { truncateForLog } from "@/lib/observability/safe-log";

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 500;

/** موديل Gemini المستخدم في شبكة أمان الـ JSON (لما مزوّد آخر يرجّع ردًّا غير صالح). */
const JSON_FALLBACK_GEMINI_MODEL = "gemini-3.5-flash";

/** هل النص JSON صالح للـ Parse؟ (نقيّة — تُستخدم في شبكة أمان الـ JSON). */
export function isParseableJson(raw: string | null): boolean {
  if (!raw || raw.trim().length === 0) return false;
  try {
    JSON.parse(raw.trim());
    return true;
  } catch {
    return false;
  }
}

/**
 * مهام بمخرجات JSON ضخمة (سكيمات متعددة الأقسام مع evidence/confidence
 * لكل عنصر) بتاخد من Gemini وقت أطول بكتير من مهمة نصية عادية — الـ 30
 * ثانية الافتراضية بتفشل باستمرار وتضيّع 3 محاولات (~90+ ثانية) من غير
 * فايدة. لكل Task Type وقته الحقيقي بدل رقم واحد يناسب الكل.
 *
 * ملاحظة (migration 0028): بعد توحيد كل المهام على gemini-3.5-flash —
 * موديل بيدعم "Thinking" (تفكير أعمق قبل الرد) — زوّدنا هامش الأمان هنا
 * لأن التفكير الإضافي ممكن ياخد وقت أطول من 2.5 في المهام الكبيرة. لازم
 * maxDuration في أي route/action بيشغّل discovery_analysis يفضل ≥
 * (هذا الرقم × محاولتين + هامش) — شوف app/api/discovery/[token]/submit
 * وapp/dashboard/projects/[id]/page.tsx.
 */
const TASK_TIMEOUT_MS: Partial<Record<AITaskType, number>> = {
  // تحليل مصدر ترحيل — يهذّب ملخّصًا فوق تحليل حتمي جاهز؛ Prompt متوسط.
  [AITaskType.MIGRATION_SOURCE_ANALYSIS]: 90_000,
  // تحليل Mapping — يهذّب مخطّطًا حتميًا جاهزًا (كيانات/حقول منخفضة الثقة).
  [AITaskType.SCHEMA_MAPPING_ANALYSIS]: 100_000,
  // تحليل جودة البيانات — يهذّب تصحيحات فوق تحليل جودة حتمي جاهز.
  [AITaskType.DATA_QUALITY_ANALYSIS]: 100_000,
  // توليد قواعد تحويل — يملأ فجوات فوق قواعد حتمية جاهزة.
  [AITaskType.TRANSFORMATION_RULE_GENERATION]: 100_000,
  // تحقّق محاكاة الترحيل — يهذّب رؤى فوق تقرير محاكاة حتمي جاهز.
  [AITaskType.MIGRATION_SIMULATION_VALIDATION]: 100_000,
  // استعادة أخطاء الترحيل الحقيقي — اقتراح حلّ لخطأ معروف؛ Prompt قصير.
  [AITaskType.MIGRATION_RECOVERY]: 60_000,
  // تحقّق ما بعد الترحيل (Go-Live) — يهذّب رؤى فوق تقرير تحقّق حتمي جاهز.
  [AITaskType.MIGRATION_GOLIVE_VERIFICATION]: 100_000,
  // تحليل Hypercare — جذور أسباب + توصيات فوق تقرير مراقبة حتمي جاهز.
  [AITaskType.MIGRATION_HYPERCARE_ANALYSIS]: 90_000,
  [AITaskType.DISCOVERY_ANALYSIS]: 110_000,
  // توليد فورم اكتشاف كامل (أقسام + أسئلة + منطق شرطي) — Prompt طويل يطلب
  // JSON منظم كبير، خصوصًا في العمق Enterprise Audit.
  [AITaskType.DISCOVERY_FORM_GENERATION]: 110_000,
  // تحسين البرومبت (Improve) — إعادة صياغة نص طويل مع قفل الـ Scope.
  [AITaskType.PROMPT_REFINEMENT]: 110_000,
  // نفس السبب بالظبط: كل Stage بيطلب Prompt طويل بلا حد أقصى (18 قسم)،
  // ومرحلة التخطيط بترجع JSON فيه لحد 20 موديول — الـ 30 ثانية
  // الافتراضية كانت بتفشل باستمرار (شوف الشاشة: "انتهى الوقت المسموح").
  [AITaskType.PROTOTYPE_PROMPT_PIPELINE_PLANNING]: 110_000,
  [AITaskType.PROTOTYPE_PROMPT_PIPELINE_STAGE]: 110_000,
  // العرض التقديمي اتوسّع من 8 لـ 17 شريحة غنية بالتفاصيل (Timeline,
  // Architecture, Risks, Roadmap, KPIs...) في رد JSON واحد — نفس سبب
  // الـ Pipeline بالظبط، الـ 30 ثانية بقت مش كفاية.
  [AITaskType.CLIENT_PRESENTATION_GENERATION]: 110_000,
  // نفس السبب: بترجع JSON فيه 4 أقسام (User Stories/Acceptance
  // Criteria/Missing Features/Risks) مع Evidence لكل عنصر، وسياق الدخل
  // نفسه كبير (كود مشروع كامل من GitHub) — بياخد وقت تفكير أطول.
  [AITaskType.PROTOTYPE_REVIEW]: 110_000,
  // PRD generation: 18 قسم بمحتوى مفصّل + Evidence من Brain + Requirements؛
  // JSON output كبير، الـ 30 ثانية الافتراضية بتفشل. يعمل عبر after()
  // (background job)، فمش محدود بـ 60s Vercel Hobby limit على الـ action نفسه.
  [AITaskType.PRD_GENERATION]: 110_000,
  // نفس فئة Prototype Review بالظبط — سياق كود Repository (ولو تدريجي
  // بيبقى أصغر مع الوقت) + مطلوب Findings مفصّلة بدليل حرفي لكل واحد.
  [AITaskType.STATIC_REVIEW_CATEGORY]: 110_000,
  [AITaskType.SECURITY_REVIEW_CATEGORY]: 110_000,
  [AITaskType.DATABASE_REVIEW_CATEGORY]: 110_000,
  [AITaskType.ARCHITECTURE_REVIEW_CATEGORY]: 110_000,
  [AITaskType.CODE_QUALITY_REVIEW_CATEGORY]: 110_000,
  [AITaskType.PRD_COMPLIANCE_REVIEW_CATEGORY]: 110_000,
  [AITaskType.PERFORMANCE_REVIEW_CATEGORY]: 110_000,
  [AITaskType.PRODUCTION_VALIDATION_JOURNEY_GENERATION]: 110_000,
  [AITaskType.PRODUCTION_VALIDATION_CATEGORY_ENRICHMENT]: 110_000,
  [AITaskType.PRODUCTION_MONITORING_INCIDENT_ANALYSIS]: 110_000,
  [AITaskType.KNOWLEDGE_EXTRACTION]: 110_000,
  [AITaskType.PROJECT_RECOMMENDATIONS]: 110_000,
  [AITaskType.AI_PRODUCT_ADVISOR]: 110_000,
  // عرض اجتماع كامل بـ 15 شريحة غنية بالتفاصيل في رد JSON واحد — نفس
  // فئة Client Presentation بالظبط.
  [AITaskType.MEETING_PRESENTATION_GENERATION]: 110_000,
  [AITaskType.MEETING_REVIEW_SYNTHESIS]: 110_000,
  [AITaskType.EXECUTION_PLAN_GENERATION]: 110_000,
  [AITaskType.FIX_PROMPT_GENERATION]: 110_000,
  // نداء واحد غني بـ 13 فئة بدل 5 فئات بسيطة — نفس منطق باقي المهام
  // اللي بترجع JSON كبير في رد واحد.
  [AITaskType.MEETING_EXTRACTION_V2]: 110_000,
  [AITaskType.MEETING_FILE_ANALYSIS]: 110_000,
  // بيرسل كل عُقد المعرفة النشطة في المشروع مرة واحدة — ممكن يكبر مع
  // مشاريع كبيرة، نفس فئة الـ 110 ثانية المستخدمة لكل حاجة مشابهة.
  [AITaskType.KNOWLEDGE_GRAPH_ANALYSIS]: 110_000,
  // بيغطّي قائمة فحص طويلة (اكتمال عمل/وظيفي/تقني/تشغيلي + تعارضات +
  // روابط اعتماد) عبر كل عناصر Brain الفردية — نفس فئة الـ 110 ثانية.
  [AITaskType.BRAIN_REVIEW_VALIDATION]: 110_000,
  [AITaskType.PRODUCTION_FIX_PROMPT_GENERATION]: 110_000,
  [AITaskType.PRODUCTION_MONITORING_REVIEW_VERDICT]: 110_000,
  // مركز المعرفة: كل المهام دي بترجع JSON كبير (عناصر معرفة بأدلة،
  // علاقات وتعارضات، مقترحات مربوطة بأقسام الـ Brain). وتصنيف المصدر
  // بيبعت الملف نفسه للنموذج أحيانًا (PDF/صورة/صوت)، وده أبطأ حاجة في
  // المنظومة — الـ 30 ثانية الافتراضية كانت هتفشل باستمرار.
  [AITaskType.KNOWLEDGE_CLASSIFICATION]: 110_000,
  [AITaskType.KNOWLEDGE_ENRICHMENT]: 110_000,
  [AITaskType.KNOWLEDGE_SYNTHESIS]: 110_000,
  // استخراج ذكاء الأعمال المهيكل: كيانات + قواعد + سير عمل + متطلبات +
  // قرارات + مخاطر في رد JSON واحد غني — نفس فئة باقي مهام المعرفة.
  [AITaskType.KNOWLEDGE_PROCESSING]: 110_000,
  // الطبقة الاستشارية: نداء واحد بيقرأ كل المعرفة المهيكلة ويرجّع رؤى
  // غنية — نفس فئة باقي مهام المعرفة الثقيلة.
  [AITaskType.KNOWLEDGE_INTELLIGENCE]: 110_000,
  [AITaskType.KNOWLEDGE_CROSS_VALIDATION]: 110_000,
  [AITaskType.PRD_INCREMENT_SECTION]: 110_000,
  // مساعد المشروع: سياق مسترجَع محدود (~8 مقاطع × 1200 حرف) + رد JSON صغير
  // (نص إجابة + حالة + قائمة معرّفات) — أثقل من مهمة نصية بسيطة بسبب حجم
  // السياق لكن أخف بكتير من مهام الـ JSON الضخم متعدد الأقسام فوق، فمش
  // محتاج الـ 110 ثانية ولا LARGE_JSON_OUTPUT_TOKENS.
  [AITaskType.PROJECT_ASSISTANT_QA]: 60_000,
  // تحليل أثر طلب تغيير (المرحلة ب): بيقرا سياق المنتج الحالي كامل عبر كل
  // النطاقات (Requirements/Stories/AC/Business Rules/System Messages/
  // State Machines/PRD/Decisions) ويرجّع JSON بعدد غير محدود من عناصر
  // الأثر، كل عنصر بحقول proposed_change مهيكلة — نفس فئة DISCOVERY_ANALYSIS
  // (مسح متعدد الأقسام + JSON غني)، مش مهمة نصية بسيطة زي QA.
  [AITaskType.STANDARD_CHANGE_IMPACT_ANALYSIS]: 110_000,
  // توليد Prompt تغيير الـ Prototype (المرحلة ج): مدخل محدود (طلب تغيير
  // واحد + قائمة أثر مُطبَّق واحدة فقط، مش سياق منتج كامل) ومخرج نص واحد
  // (Prompt عملي، مش JSON غني متعدد الأقسام) — نفس فئة PROJECT_ASSISTANT_QA
  // بالضبط، أخف بكتير من STANDARD_CHANGE_IMPACT_ANALYSIS.
  [AITaskType.PROTOTYPE_CHANGE_PROMPT_GENERATION]: 60_000,
};

/**
 * أقصى عدد Tokens للمخرجات لكل مهمة. الافتراضي في الـ Provider (16384) بيكفي
 * المهام النصية العادية، لكن مهام الـ JSON الضخم متعدد الأقسام (تحليل
 * اكتشاف بـ 20+ قسم لكل عنصر فيه evidence، عروض 15–17 شريحة، مراجعات
 * كود مفصّلة) بتتخطّاه بسهولة مع فورم كبير — فيتقطع الرد في نص الـ JSON
 * (finishReason=MAX_TOKENS) ويفشل الـ Parse بـ "الرد ليس JSON صالحًا".
 * القيمة هنا سقف عالٍ آمن (الـ API بيقصّه لحد الموديل لو أعلى).
 */
const LARGE_JSON_OUTPUT_TOKENS = 65_536;
const TASK_MAX_OUTPUT_TOKENS: Partial<Record<AITaskType, number>> = {
  [AITaskType.MIGRATION_SOURCE_ANALYSIS]: LARGE_JSON_OUTPUT_TOKENS,
  [AITaskType.SCHEMA_MAPPING_ANALYSIS]: LARGE_JSON_OUTPUT_TOKENS,
  [AITaskType.DATA_QUALITY_ANALYSIS]: LARGE_JSON_OUTPUT_TOKENS,
  [AITaskType.TRANSFORMATION_RULE_GENERATION]: LARGE_JSON_OUTPUT_TOKENS,
  [AITaskType.MIGRATION_SIMULATION_VALIDATION]: LARGE_JSON_OUTPUT_TOKENS,
  [AITaskType.MIGRATION_GOLIVE_VERIFICATION]: LARGE_JSON_OUTPUT_TOKENS,
  [AITaskType.MIGRATION_HYPERCARE_ANALYSIS]: LARGE_JSON_OUTPUT_TOKENS,
  [AITaskType.DISCOVERY_ANALYSIS]: LARGE_JSON_OUTPUT_TOKENS,
  // PRD أصبح 16 قسمًا (كان 11 قبل 0116/0122) — أقسام زي flow_specifications
  // وpersona_modules (بتكرر نفس المحتوى مُجمَّعًا حسب الشخصية فوق الأقسام
  // المسطّحة الأصلية) بتزوّد حجم JSON المطلوب بشكل حقيقي. الحد الافتراضي
  // (16384) كان كافي لـ 11 قسم بس، وممكن يقطع مستند مفصّل بمستوى احترافي.
  [AITaskType.PRD_GENERATION]: LARGE_JSON_OUTPUT_TOKENS,
  // migration_recovery: مخرَج صغير (اقتراح واحد) — لا يحتاج سقفًا كبيرًا.
  [AITaskType.PRD_INCREMENT_SECTION]: LARGE_JSON_OUTPUT_TOKENS,
  [AITaskType.DISCOVERY_FORM_GENERATION]: LARGE_JSON_OUTPUT_TOKENS,
  [AITaskType.PROTOTYPE_PROMPT_PIPELINE_PLANNING]: LARGE_JSON_OUTPUT_TOKENS,
  [AITaskType.PROTOTYPE_PROMPT_PIPELINE_STAGE]: LARGE_JSON_OUTPUT_TOKENS,
  [AITaskType.CLIENT_PRESENTATION_GENERATION]: LARGE_JSON_OUTPUT_TOKENS,
  [AITaskType.PROTOTYPE_REVIEW]: LARGE_JSON_OUTPUT_TOKENS,
  [AITaskType.STATIC_REVIEW_CATEGORY]: LARGE_JSON_OUTPUT_TOKENS,
  [AITaskType.SECURITY_REVIEW_CATEGORY]: LARGE_JSON_OUTPUT_TOKENS,
  [AITaskType.DATABASE_REVIEW_CATEGORY]: LARGE_JSON_OUTPUT_TOKENS,
  [AITaskType.ARCHITECTURE_REVIEW_CATEGORY]: LARGE_JSON_OUTPUT_TOKENS,
  [AITaskType.CODE_QUALITY_REVIEW_CATEGORY]: LARGE_JSON_OUTPUT_TOKENS,
  [AITaskType.PRD_COMPLIANCE_REVIEW_CATEGORY]: LARGE_JSON_OUTPUT_TOKENS,
  [AITaskType.PERFORMANCE_REVIEW_CATEGORY]: LARGE_JSON_OUTPUT_TOKENS,
  [AITaskType.PRODUCTION_VALIDATION_JOURNEY_GENERATION]: LARGE_JSON_OUTPUT_TOKENS,
  [AITaskType.PRODUCTION_VALIDATION_CATEGORY_ENRICHMENT]: LARGE_JSON_OUTPUT_TOKENS,
  [AITaskType.PRODUCTION_MONITORING_INCIDENT_ANALYSIS]: LARGE_JSON_OUTPUT_TOKENS,
  [AITaskType.KNOWLEDGE_EXTRACTION]: LARGE_JSON_OUTPUT_TOKENS,
  [AITaskType.KNOWLEDGE_CLASSIFICATION]: LARGE_JSON_OUTPUT_TOKENS,
  [AITaskType.KNOWLEDGE_ENRICHMENT]: LARGE_JSON_OUTPUT_TOKENS,
  [AITaskType.KNOWLEDGE_SYNTHESIS]: LARGE_JSON_OUTPUT_TOKENS,
  [AITaskType.KNOWLEDGE_PROCESSING]: LARGE_JSON_OUTPUT_TOKENS,
  [AITaskType.KNOWLEDGE_INTELLIGENCE]: LARGE_JSON_OUTPUT_TOKENS,
  [AITaskType.KNOWLEDGE_CROSS_VALIDATION]: LARGE_JSON_OUTPUT_TOKENS,
  [AITaskType.PROJECT_RECOMMENDATIONS]: LARGE_JSON_OUTPUT_TOKENS,
  [AITaskType.AI_PRODUCT_ADVISOR]: LARGE_JSON_OUTPUT_TOKENS,
  [AITaskType.MEETING_PRESENTATION_GENERATION]: LARGE_JSON_OUTPUT_TOKENS,
  [AITaskType.MEETING_REVIEW_SYNTHESIS]: LARGE_JSON_OUTPUT_TOKENS,
  [AITaskType.EXECUTION_PLAN_GENERATION]: LARGE_JSON_OUTPUT_TOKENS,
  [AITaskType.FIX_PROMPT_GENERATION]: LARGE_JSON_OUTPUT_TOKENS,
  [AITaskType.MEETING_EXTRACTION_V2]: LARGE_JSON_OUTPUT_TOKENS,
  [AITaskType.MEETING_FILE_ANALYSIS]: LARGE_JSON_OUTPUT_TOKENS,
  [AITaskType.KNOWLEDGE_GRAPH_ANALYSIS]: LARGE_JSON_OUTPUT_TOKENS,
  [AITaskType.BRAIN_REVIEW_VALIDATION]: LARGE_JSON_OUTPUT_TOKENS,
  [AITaskType.PRODUCTION_FIX_PROMPT_GENERATION]: LARGE_JSON_OUTPUT_TOKENS,
  [AITaskType.PRODUCTION_MONITORING_REVIEW_VERDICT]: LARGE_JSON_OUTPUT_TOKENS,
  [AITaskType.PROMPT_REFINEMENT]: LARGE_JSON_OUTPUT_TOKENS,
  // نفس فئة DISCOVERY_ANALYSIS — تحليل أثر متعدد العناصر عبر كل نطاقات المنتج.
  [AITaskType.STANDARD_CHANGE_IMPACT_ANALYSIS]: LARGE_JSON_OUTPUT_TOKENS,
};

/** بعض المهام الثقيلة بتقلل المحاولات عشان الوقت الكلي يفضل معقول. */
const TASK_MAX_ATTEMPTS: Partial<Record<AITaskType, number>> = {
  [AITaskType.MIGRATION_SOURCE_ANALYSIS]: 2,
  [AITaskType.SCHEMA_MAPPING_ANALYSIS]: 2,
  [AITaskType.DATA_QUALITY_ANALYSIS]: 2,
  [AITaskType.TRANSFORMATION_RULE_GENERATION]: 2,
  [AITaskType.MIGRATION_SIMULATION_VALIDATION]: 2,
  [AITaskType.MIGRATION_RECOVERY]: 2,
  [AITaskType.MIGRATION_GOLIVE_VERIFICATION]: 2,
  [AITaskType.MIGRATION_HYPERCARE_ANALYSIS]: 2,
  [AITaskType.DISCOVERY_ANALYSIS]: 2,
  [AITaskType.DISCOVERY_FORM_GENERATION]: 2,
  [AITaskType.PROMPT_REFINEMENT]: 2,
  [AITaskType.PROTOTYPE_PROMPT_PIPELINE_PLANNING]: 2,
  [AITaskType.PROTOTYPE_PROMPT_PIPELINE_STAGE]: 2,
  [AITaskType.CLIENT_PRESENTATION_GENERATION]: 2,
  [AITaskType.PROTOTYPE_REVIEW]: 2,
  [AITaskType.STATIC_REVIEW_CATEGORY]: 2,
  [AITaskType.SECURITY_REVIEW_CATEGORY]: 2,
  [AITaskType.DATABASE_REVIEW_CATEGORY]: 2,
  [AITaskType.ARCHITECTURE_REVIEW_CATEGORY]: 2,
  [AITaskType.CODE_QUALITY_REVIEW_CATEGORY]: 2,
  [AITaskType.PRD_COMPLIANCE_REVIEW_CATEGORY]: 2,
  [AITaskType.PERFORMANCE_REVIEW_CATEGORY]: 2,
  [AITaskType.PRODUCTION_VALIDATION_JOURNEY_GENERATION]: 2,
  [AITaskType.PRODUCTION_VALIDATION_CATEGORY_ENRICHMENT]: 2,
  [AITaskType.PRODUCTION_MONITORING_INCIDENT_ANALYSIS]: 2,
  [AITaskType.KNOWLEDGE_EXTRACTION]: 2,
  [AITaskType.KNOWLEDGE_PROCESSING]: 2,
  [AITaskType.KNOWLEDGE_INTELLIGENCE]: 2,
  [AITaskType.PROJECT_RECOMMENDATIONS]: 2,
  [AITaskType.AI_PRODUCT_ADVISOR]: 2,
  [AITaskType.MEETING_PRESENTATION_GENERATION]: 2,
  [AITaskType.MEETING_REVIEW_SYNTHESIS]: 2,
  [AITaskType.EXECUTION_PLAN_GENERATION]: 2,
  [AITaskType.FIX_PROMPT_GENERATION]: 2,
  [AITaskType.MEETING_EXTRACTION_V2]: 2,
  [AITaskType.MEETING_FILE_ANALYSIS]: 2,
  [AITaskType.KNOWLEDGE_GRAPH_ANALYSIS]: 2,
  [AITaskType.BRAIN_REVIEW_VALIDATION]: 2,
  [AITaskType.PRODUCTION_FIX_PROMPT_GENERATION]: 2,
  [AITaskType.PRODUCTION_MONITORING_REVIEW_VERDICT]: 2,
  [AITaskType.STANDARD_CHANGE_IMPACT_ANALYSIS]: 2,
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildErrorResponse(
  taskType: AITaskType,
  provider: AIProviderName,
  model: string,
  latency_ms: number,
  err: unknown
): AIResponse {
  const aiError =
    err instanceof AIError
      ? err
      : new AIError("PROVIDER_ERROR", err instanceof Error ? err.message : "خطأ غير معروف");

  return {
    success: false,
    output: null,
    model_used: model,
    provider,
    latency_ms,
    token_usage: null,
    cost: null,
    error: { code: aiError.code, message: aiError.message },
    warnings: [],
    request_id: crypto.randomUUID(),
  };
}

/**
 * الإعداد الأخير قبل الاستسلام — لو الجدول نفسه فاضي تمامًا.
 * gemini-3.5-flash هو الموديل المستخدم في أغلب المهام في المشروع.
 */
const LAST_RESORT_CONFIG = { provider: "gemini", model: "gemini-3.5-flash" } as const;

/**
 * إعداد بديل لنوع مهمة مالوش صف في `ai_task_model_config`.
 *
 * بنقرا أشيع إعداد مستخدم فعليًا في المشروع بدل ما نكتب موديل ثابت في
 * الكود: لو الفريق غيّر الموديل من الإعدادات، المهمة الجديدة تمشي مع
 * الاختيار ده تلقائيًا بدل ما ترجع لموديل قديم.
 */
/*
 * ملاحظة: مسار الـ embedding (تحت) عن قصد **مالوش** رجوع افتراضي.
 * الـ embedding محتاج موديل تضمين بعينه، والرجوع لموديل محادثة كان
 * هينتج متجهات بلا معنى تفسد البحث الدلالي بصمت — الفشل الصريح هنا
 * أأمن من نجاح كاذب.
 */
async function resolveFallbackConfig(
  supabase: SupabaseClient,
  taskType: AITaskType
): Promise<{ provider: string; model: string }> {
  const { data } = await supabase
    .from("ai_task_model_config")
    .select("provider, model")
    .limit(200);

  const rows = (data ?? []) as { provider: string; model: string }[];

  let chosen: { provider: string; model: string } = LAST_RESORT_CONFIG;
  if (rows.length > 0) {
    const counts = new Map<string, { config: { provider: string; model: string }; n: number }>();
    for (const row of rows) {
      const key = `${row.provider}|${row.model}`;
      const entry = counts.get(key) ?? { config: row, n: 0 };
      entry.n += 1;
      counts.set(key, entry);
    }
    chosen = [...counts.values()].sort((a, b) => b.n - a.n)[0].config;
  }

  console.warn(
    `[AIService] مفيش صف في ai_task_model_config للمهمة "${taskType}" — استُخدم الإعداد الشائع (${chosen.provider}/${chosen.model}). طبّق الهجرة اللي بتضيف الصف عشان تقدر تظبطه من الإعدادات.`
  );
  return chosen;
}

/**
 * AIService هو المدخل الوحيد المسموح بيه لأي عملية AI في المشروع.
 * ممنوع أي كود تاني يستدعي Provider مباشرة — يمر من هنا فقط.
 *
 * الترتيب: AIService → Provider → API
 */
export class AIService {
  /**
   * المدخل العام — **الواجهة لم تتغيّر**.
   *
   * الواحد والثلاثون موضع استدعاء في المشروع كلهم بيمرّوا من هنا، فده
   * المكان الوحيد اللي محتاج يعرف حاجة عن ترحيل البنية. المحوّل يقرّر:
   * طابور وعامل خارجي، ولا التنفيذ المباشر القديم — والمستدعي ما
   * بيفرقش، وما اتعدّلش فيه سطر.
   *
   * الافتراضي **المسار القديم**، والمحوّل بيرجعله تلقائيًا لو مفيش عامل
   * حيّ أو اتأخّرت المهمة. أسوأ حالة: بطء، مش توقّف.
   */
  static async execute(
    taskType: AITaskType,
    input: string,
    context?: AIRequestContext
  ): Promise<AIResponse> {
    return routeExecution({ taskType, input, context }, () =>
      AIService.executeDirect(taskType, input, context)
    );
  }

  /**
   * التنفيذ المباشر — المسار القديم كما هو، بلا أي تغيير في سلوكه.
   *
   * عام لا خاص عن قصد: عامل الطابور نفسه بينفّذ من هنا، ولو كان خاصًّا
   * كان لازم يدخل من `execute` فيدخل المحوّل تاني — ومهمة تُدرج مهمةً
   * في الطابور بلا نهاية.
   */
  static async executeDirect(
    taskType: AITaskType,
    input: string,
    context?: AIRequestContext
  ): Promise<AIResponse> {
    const supabase = createServiceClient();

    const { data: storedConfig } = await supabase
      .from("ai_task_model_config")
      .select("provider, model")
      .eq("task_type", taskType)
      .maybeSingle();

    // أي نوع مهمة جديد بيتضاف في الكود محتاج صف في ai_task_model_config،
    // والصف ده بييجي في هجرة بتتطبّق يدويًا. النتيجة كانت إن الميزة
    // الجديدة تفشل بالكامل بين نشر الكود وتطبيق الهجرة — وده فشل
    // تشغيلي مش نقص إعدادات.
    //
    // الحل: الرجوع لإعداد افتراضي مع تسجيل تحذير. المهمة بتشتغل فورًا،
    // والصف لما يتضاف بيتحكّم فيها ويقدر يتظبط من الإعدادات.
    const config = storedConfig ?? (await resolveFallbackConfig(supabase, taskType));

    const providerName = config.provider as AIProviderName;
    const model = config.model;

    // getProvider بيرمي لو الاسم المسجّل في ai_task_model_config مش
    // مسجّل فعليًا في registry.ts (مثلاً provider اتغيّر في الإعدادات
    // لاسم لسه مش متضاف). قبل كده كان الـ throw ده بيهرب من أي
    // try/catch في الطبقة دي، فبيوصل عاري للمستدعي (Telegram pipeline
    // مثلاً) كـ "خطأ غير متوقع" عام بدل رسالة واضحة.
    let provider;
    try {
      provider = getProvider(providerName);
    } catch (err) {
      return buildErrorResponse(taskType, providerName, model, 0, err);
    }

    const timeoutMs = TASK_TIMEOUT_MS[taskType] ?? DEFAULT_TIMEOUT_MS;
    const maxAttempts = TASK_MAX_ATTEMPTS[taskType] ?? DEFAULT_MAX_ATTEMPTS;
    const maxOutputTokens = TASK_MAX_OUTPUT_TOKENS[taskType];

    const start = Date.now();
    let retryCount = 0;
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const response = await withTimeout(
          provider.execute({
            taskType,
            input,
            model,
            media: context?.media,
            context,
            timeoutMs,
            maxOutputTokens,
          }),
          timeoutMs,
          providerName
        );

        await AIService.logRequest({
          actorId: context?.actorId,
          projectId: context?.projectId,
          provider: providerName,
          model,
          taskType,
          success: true,
          latencyMs: Date.now() - start,
          retryCount,
        });

        // ── شبكة أمان الـ JSON (الحل النهائي لـ INVALID_RESPONSE) ──
        // لو المهمة بتطلب JSON (البرومبت فيه "json") والمزوّد غير Gemini رجّع
        // ردًّا "ناجحًا" لكنه مش JSON صالح (رد فاضي/مقصوص/كلام حواليه — بيحصل
        // مع موديلات الاستدلال زي gpt-5-mini)، بنعيد التنفيذ فورًا على Gemini
        // بدل ما الفشل يوصل للمستخدم. المزوّد الأساسي يفضل زي ما هو مضبوط —
        // ده Fallback للطلب الواحد بس، مش تغيير إعدادات.
        const expectsJson = /json/i.test(input) && !context?.media;
        if (expectsJson && providerName !== AIProviderName.GEMINI && !isParseableJson(response.output)) {
          console.warn(
            `[AIService] ${providerName}/${model} رجّع ردًّا غير JSON لمهمة ${taskType} — تحويل تلقائي لـ Gemini. عيّنة: ${truncateForLog((response.output ?? "(فارغ)").slice(0, 200))}`
          );
          try {
            const geminiProvider = getProvider(AIProviderName.GEMINI);
            const fbStart = Date.now();
            const fallback = await withTimeout(
              geminiProvider.execute({
                taskType,
                input,
                model: JSON_FALLBACK_GEMINI_MODEL,
                context,
                timeoutMs,
                maxOutputTokens,
              }),
              timeoutMs,
              AIProviderName.GEMINI
            );
            await AIService.logRequest({
              actorId: context?.actorId,
              projectId: context?.projectId,
              provider: AIProviderName.GEMINI,
              model: JSON_FALLBACK_GEMINI_MODEL,
              taskType,
              success: fallback.success,
              latencyMs: Date.now() - fbStart,
              retryCount: 0,
            });
            if (fallback.success && isParseableJson(fallback.output)) {
              fallback.warnings.push(
                `تحويل تلقائي: ${providerName}/${model} رجّع ردًّا غير JSON فاتنفّذ الطلب على Gemini/${JSON_FALLBACK_GEMINI_MODEL}.`
              );
              return fallback;
            }
          } catch {
            // فشل الـ Fallback نفسه (مفتاح/حصة) — نرجّع رد المزوّد الأصلي
            // زي ما هو، والـ Validator هيبلّغ بالخطأ المعتاد.
          }
        }

        return response;
      } catch (err) {
        lastError = err;
        const retryable = err instanceof AIError ? err.retryable : false;

        // RATE_LIMIT (429) عادةً حصة دقيقية/يومية من المزوّد. لو المزوّد
        // نفسه قال مدة تبريد قصيرة ومعقولة في رسالة الخطأ ("retry in
        // 20.8s") ننتظرها بالظبط ونحاول مرة واحدة كمان — غالبًا نافذة
        // دقيقة بترجع تفتح. لو مفيش مدة واضحة أو طويلة أوي، إعادة المحاولة
        // الفورية مضمونة الفشل وبتستهلك طلب زيادة بلا فايدة، فنتوقّف فورًا.
        const isRateLimit = err instanceof AIError && err.code === "RATE_LIMIT";

        if (!retryable || isRateLimit || attempt === maxAttempts) {
          break;
        }

        retryCount++;
        await sleep(BASE_DELAY_MS * 2 ** (attempt - 1));
      }
    }

    const latency_ms = Date.now() - start;
    const errorResponse = buildErrorResponse(taskType, providerName, model, latency_ms, lastError);

    await AIService.logRequest({
      actorId: context?.actorId,
      projectId: context?.projectId,
      provider: providerName,
      model,
      taskType,
      success: false,
      latencyMs: latency_ms,
      errorCode: errorResponse.error?.code,
      retryCount,
    });

    return errorResponse;
  }

  /**
   * توليد Embedding حقيقي لنص — يُستخدم في Phase 6 (Organizational
   * Intelligence) لحساب التشابه الدلالي بين المشاريع والبحث الدلالي في
   * الـ Knowledge Base. نفس نمط execute() بالظبط (Config من الـ DB،
   * Timeout، Retry) لكن بدون Rate-Limit التريّث الطويل — الاستخراج شغل
   * خلفية غير حرج للوقت.
   */
  static async embed(text: string, context?: AIRequestContext): Promise<AIEmbeddingResponse> {
    const supabase = createServiceClient();
    const { data: config } = await supabase
      .from("ai_task_model_config")
      .select("provider, model")
      .eq("task_type", AITaskType.EMBEDDING)
      .maybeSingle();

    if (!config) {
      return {
        success: false,
        embedding: null,
        model_used: "unknown",
        provider: AIProviderName.GEMINI,
        latency_ms: 0,
        error: { code: "CONFIGURATION_ERROR", message: "لا يوجد إعداد Model لمهمة embedding." },
      };
    }

    let providerName = config.provider as AIProviderName;
    let model = config.model;
    let provider;
    try {
      provider = getProvider(providerName);
    } catch (err) {
      return {
        success: false,
        embedding: null,
        model_used: model,
        provider: providerName,
        latency_ms: 0,
        error: { code: "UNKNOWN_PROVIDER", message: err instanceof Error ? err.message : "خطأ غير معروف" },
      };
    }

    // حارس أمان: الـ Embeddings محتاجة موديل تضمين بأبعاد بعينها. لو الإعداد
    // اتظبط بالغلط على مزوّد لا يدعم embeddings (زي OpenAI في نظامنا، أو
    // موديل محادثة زي gpt-5-mini)، نرجع تلقائيًّا لـ Gemini/gemini-embedding-001
    // بدل ما يفشل البحث الدلالي والذكاء المؤسسي بصمت. تبديل المزوّد لبقية
    // المهام (توليد النصوص) يفضل شغّال عادي — ده خاص بمهمة embedding بس.
    // (text-embedding-004 اتسحب من جوجل — v1beta بترجع 404 عليه.)
    if (!provider.embed) {
      providerName = AIProviderName.GEMINI;
      model = "gemini-embedding-001";
      provider = getProvider(providerName);
    }
    if (!provider.embed) {
      return {
        success: false,
        embedding: null,
        model_used: model,
        provider: providerName,
        latency_ms: 0,
        error: { code: "NOT_SUPPORTED", message: `Provider ${providerName} لا يدعم Embeddings.` },
      };
    }

    const start = Date.now();
    try {
      const response = await withTimeout(provider.embed(text, model), DEFAULT_TIMEOUT_MS, providerName);
      await AIService.logRequest({
        actorId: context?.actorId,
        projectId: context?.projectId,
        provider: providerName,
        model,
        taskType: AITaskType.EMBEDDING,
        success: response.success,
        latencyMs: Date.now() - start,
        errorCode: response.error?.code,
        retryCount: 0,
      });
      return response;
    } catch (err) {
      const aiError = err instanceof AIError ? err : new AIError("PROVIDER_ERROR", err instanceof Error ? err.message : "خطأ غير معروف");
      await AIService.logRequest({
        actorId: context?.actorId,
        projectId: context?.projectId,
        provider: providerName,
        model,
        taskType: AITaskType.EMBEDDING,
        success: false,
        latencyMs: Date.now() - start,
        errorCode: aiError.code,
        retryCount: 0,
      });
      return {
        success: false,
        embedding: null,
        model_used: model,
        provider: providerName,
        latency_ms: Date.now() - start,
        error: { code: aiError.code, message: aiError.message },
      };
    }
  }

  static async healthCheck(
    providerName: AIProviderName = AIProviderName.GEMINI
  ): Promise<{ ok: boolean; message: string }> {
    try {
      const provider = getProvider(providerName);
      return await provider.healthCheck();
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : "فشل غير معروف",
      };
    }
  }

  private static async logRequest(entry: {
    actorId?: string;
    projectId?: string;
    provider: AIProviderName;
    model: string;
    taskType: AITaskType;
    success: boolean;
    latencyMs: number;
    errorCode?: string;
    retryCount: number;
  }) {
    const supabase = createServiceClient();
    await supabase.from("ai_requests_log").insert({
      actor_id: entry.actorId ?? null,
      project_id: entry.projectId ?? null,
      provider: entry.provider,
      model_used: entry.model,
      task_type: entry.taskType,
      success: entry.success,
      latency_ms: entry.latencyMs,
      error_code: entry.errorCode ?? null,
      retry_count: entry.retryCount,
    });
  }
}
