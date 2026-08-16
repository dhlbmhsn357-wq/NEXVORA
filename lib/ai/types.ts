/**
 * العقد الموحّد لطبقة AI Provider — أي مزوّد جديد (Claude, OpenAI, ...)
 * لازم يطبّق AIProvider ويرجّع AIResponse بنفس الشكل بالظبط.
 */

export enum AITaskType {
  PROJECT_ANALYSIS = "project_analysis",
  DISCOVERY_ANALYSIS = "discovery_analysis",
  DISCOVERY_FORM_GENERATION = "discovery_form_generation",
  PROMPT_REFINEMENT = "prompt_refinement",
  MEETING_SUMMARY = "meeting_summary",
  PRD_GENERATION = "prd_generation",
  /** قسم PRD مخصّص لزيادة واحدة — بيتولّد للجزء الجديد بس من غير المساس بالمستند القائم. */
  PRD_INCREMENT_SECTION = "prd_increment_section",
  USER_STORY = "user_story",
  PROMPT_GENERATION = "prompt_generation",
  COMPETITOR_ANALYSIS = "competitor_analysis",
  DOCUMENTATION = "documentation",
  TRANSCRIPTION = "transcription",
  MEETING_EXTRACTION = "meeting_extraction",
  MEETING_EXTRACTION_V2 = "meeting_extraction_v2",
  MEETING_FILE_ANALYSIS = "meeting_file_analysis",
  KNOWLEDGE_GRAPH_ANALYSIS = "knowledge_graph_analysis",
  BRAIN_REVIEW_VALIDATION = "brain_review_validation",
  PRODUCTION_FIX_PROMPT_GENERATION = "production_fix_prompt_generation",
  PRODUCTION_MONITORING_REVIEW_VERDICT = "production_monitoring_review_verdict",
  PROJECT_BRAIN_SYNC = "project_brain_sync",
  PROTOTYPE_PROMPT_GENERATION = "prototype_prompt_generation",
  PROTOTYPE_PROMPT_PIPELINE_PLANNING = "prototype_prompt_pipeline_planning",
  PROTOTYPE_PROMPT_PIPELINE_STAGE = "prototype_prompt_pipeline_stage",
  PROTOTYPE_REVIEW = "prototype_review",
  CLIENT_PRESENTATION_GENERATION = "client_presentation_generation",
  DEVELOPER_HANDOFF_GENERATION = "developer_handoff_generation",
  SUPPORT_TRIAGE = "support_triage",
  MEETING_PREPARATION = "meeting_preparation",
  STATIC_REVIEW_CATEGORY = "static_review_category",
  SECURITY_REVIEW_CATEGORY = "security_review_category",
  DATABASE_REVIEW_CATEGORY = "database_review_category",
  ARCHITECTURE_REVIEW_CATEGORY = "architecture_review_category",
  CODE_QUALITY_REVIEW_CATEGORY = "code_quality_review_category",
  PRD_COMPLIANCE_REVIEW_CATEGORY = "prd_compliance_review_category",
  PERFORMANCE_REVIEW_CATEGORY = "performance_review_category",
  PRODUCTION_VALIDATION_JOURNEY_GENERATION = "production_validation_journey_generation",
  PRODUCTION_VALIDATION_CATEGORY_ENRICHMENT = "production_validation_category_enrichment",
  PRODUCTION_MONITORING_INCIDENT_ANALYSIS = "production_monitoring_incident_analysis",
  KNOWLEDGE_EXTRACTION = "knowledge_extraction",
  /** تصنيف مقطع مستند في Knowledge Hub لعناصر معرفة + فجوات. */
  KNOWLEDGE_CLASSIFICATION = "knowledge_classification",
  /** إثراء المعرفة: العلاقات + التعارضات + المصطلحات داخل تصنيف واحد. */
  KNOWLEDGE_ENRICHMENT = "knowledge_enrichment",
  /** استخراج ذكاء الأعمال المهيكل: كيانات + قواعد + سير عمل + متطلبات + قرارات + مخاطر. */
  KNOWLEDGE_PROCESSING = "knowledge_processing",
  /** الطبقة الاستشارية: رؤى معمارية وعمليات وتحسين وتنبّؤ بالمخاطر فوق المعرفة المهيكلة. */
  KNOWLEDGE_INTELLIGENCE = "knowledge_intelligence",
  /** توليف المعرفة لعناصر جاهزة للـ Brain + بنى تشغيلية. */
  KNOWLEDGE_SYNTHESIS = "knowledge_synthesis",
  /** التحقق المتقاطع: هل المستند يؤكّد كلام العميل أم يعارضه؟ */
  KNOWLEDGE_CROSS_VALIDATION = "knowledge_cross_validation",
  PROJECT_RECOMMENDATIONS = "project_recommendations",
  AI_PRODUCT_ADVISOR = "ai_product_advisor",
  PROMPT_IMPROVEMENT_SUGGESTION = "prompt_improvement_suggestion",
  MEETING_PRESENTATION_GENERATION = "meeting_presentation_generation",
  MEETING_REVIEW_SYNTHESIS = "meeting_review_synthesis",
  EMBEDDING = "embedding",
  EXECUTION_PLAN_GENERATION = "execution_plan_generation",
  FIX_PROMPT_GENERATION = "fix_prompt_generation",
  COLLABORATION_SUMMARY = "collaboration_summary",
  TASK_ORCHESTRATION = "task_orchestration",
  DELIVERY_INTELLIGENCE = "delivery_intelligence",
  AUTOMATION_INTELLIGENCE = "automation_intelligence",
  ARCHITECTURE_VALIDATION = "architecture_validation",
  EXECUTIVE_INTELLIGENCE = "executive_intelligence",
  EXECUTIVE_REPORT = "executive_report",
  MIGRATION_SOURCE_ANALYSIS = "migration_source_analysis",
  SCHEMA_MAPPING_ANALYSIS = "schema_mapping_analysis",
  DATA_QUALITY_ANALYSIS = "data_quality_analysis",
  TRANSFORMATION_RULE_GENERATION = "transformation_rule_generation",
  MIGRATION_SIMULATION_VALIDATION = "migration_simulation_validation",
  MIGRATION_RECOVERY = "migration_recovery",
  MIGRATION_GOLIVE_VERIFICATION = "migration_golive_verification",
  MIGRATION_HYPERCARE_ANALYSIS = "migration_hypercare_analysis",
  /** مساعد المشروع (Phase C) — إجابة سؤال مبنية على أدلة مسترجَعة، مع حالة إجابة واستشهادات. */
  PROJECT_ASSISTANT_QA = "project_assistant_qa",
}

export enum AIProviderName {
  GEMINI = "gemini",
  CLAUDE = "claude",
  OPENAI = "openai",
  DEEPSEEK = "deepseek",
}

export interface AITokenUsage {
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
}

export interface AIRequestMedia {
  mimeType: string;
  /** Base64-encoded — بدون data: prefix */
  data: string;
}

export interface AIRequestContext {
  actorId?: string;
  projectId?: string;
  /** ملف وسائط اختياري (صوت مثلاً) يُرسل جنب النص لمهام زي التفريغ */
  media?: AIRequestMedia;
}

export interface AIRequest {
  taskType: AITaskType;
  input: string;
  model: string;
  /** ملف وسائط اختياري (صوت مثلاً) يُرسل جنب النص لمهام زي التفريغ */
  media?: AIRequestMedia;
  context?: AIRequestContext;
  /** أقصى وقت مسموح للطلب بالمللي ثانية قبل ما يعتبر Timeout */
  timeoutMs?: number;
  /**
   * أقصى عدد Tokens للمخرجات. المهام اللي بترجع JSON ضخم (تحليل الاكتشاف
   * بكل أقسامه، العروض...) بتحتاج سقفًا أعلى من الافتراضي وإلا الرد بيتقطع
   * في نص الطريق (finishReason=MAX_TOKENS) فيفشل الـ Parse. اختياري —
   * لو مش متمرّر، الـ Provider بيستخدم قيمته الافتراضية.
   */
  maxOutputTokens?: number;
}

export interface AIResponse {
  success: boolean;
  output: string | null;
  model_used: string;
  provider: AIProviderName;
  latency_ms: number;
  token_usage: AITokenUsage | null;
  /** تقدير التكلفة بالدولار، اختياري حاليًا */
  cost: number | null;
  error: { code: string; message: string } | null;
  warnings: string[];
  request_id: string;
}

export interface AIEmbeddingResponse {
  success: boolean;
  embedding: number[] | null;
  model_used: string;
  provider: AIProviderName;
  latency_ms: number;
  error: { code: string; message: string } | null;
}

/**
 * كل Provider (Gemini, Claude, ...) لازم يعيش في ملفه المستقل ويطبّق
 * الـ Interface ده بس. AIService هو الوحيد اللي بيتكلم مع الـ Providers —
 * ممنوع أي جزء تاني في المشروع يستدعي Provider مباشرة.
 *
 * embed() اختياري — مش كل Provider لازم يدعم Embeddings (Gemini بيدعمه
 * عبر text-embedding-004، مستقبلًا لو Claude/OpenAI اتضافوا ممكن ميطبّقوهوش).
 */
export interface AIProvider {
  readonly name: AIProviderName;
  execute(request: AIRequest): Promise<AIResponse>;
  embed?(text: string, model: string): Promise<AIEmbeddingResponse>;
  healthCheck(): Promise<{ ok: boolean; message: string }>;
}
