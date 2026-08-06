/**
 * Stage Registry — المكان الوحيد اللي فيه أي Stage جديدة تتسجّل. أي
 * مرحلة قادمة (Static Code Audit, Security Audit, ...) بتتضاف هنا بس —
 * صفر تعديل على الـ Engine أو الـ Orchestrator (lib/engineering-qa/engine.ts)
 * عند إضافتها. لو `run` مش معرّف، الـ Orchestrator بيستخدم منفّذ بديل
 * (placeholder) بيرجّع نتيجة صريحة "لسه معملهاش فحص فعلي" — مش بيانات
 * وهمية بتتظاهر إنها حقيقية، وده الفرق الجوهري بين "بنية تحتية بس"
 * (المرحلة دي) و"Mock Data" (ممنوع صراحةً).
 */

export interface StageRunResult {
  score: number | null;
  summary: string;
  findingsJson: unknown[];
  recommendationsJson: unknown[];
  /**
   * true لو المرحلة عبارة عن جسر لمحرك فرعي مستقل لسه بيشتغل (زي Static
   * Architecture Review Engine — Phase 12.2) — الـ Engine (runStageCore)
   * ميعتبرش المرحلة "completed" ولا يسجّل نتيجة نهائية لما ده يبقى true،
   * ويسيب حالتها "running" عشان الـ Client يعاود استدعاء run() تاني في
   * الـ Poll الجاي. Undefined/false = نفس السلوك المتزامن الأصلي
   * (نتيجة نهائية واحدة من أول استدعاء) — الافتراضي لأي مرحلة عادية.
   */
  inProgress?: boolean;
}

export interface StageRunContext {
  projectId: string;
  reviewId: string;
  /** id صف المرحلة نفسها (engineering_review_stages.id) — لازم لأي
   * مرحلة محتاجة تربط محرك فرعي مستقل بيها (زي StaticReviewEngine). */
  stageId: string;
  repositoryUrl: string;
  repositoryBranch: string;
  repositoryCommit: string | null;
}

export interface StageDefinition {
  key: string;
  label: string;
  order: number;
  /**
   * لو undefined، الـ Engine بيستخدم منفّذ بديل صريح — ده المتوقع لأي
   * مرحلة لسه من غير منطق فحص حقيقي. مرحلة قادمة تحدّد منطق فحص حقيقي
   * بس بتضيف `run` هنا، من غير أي تعديل تاني على الـ Engine.
   */
  run?: (context: StageRunContext) => Promise<StageRunResult>;
  /**
   * true لو المرحلة دي جسر لمحرك فرعي مستقل (Sub-pipeline) بيتقدّم عبر
   * عدة استدعاءات run() متتالية (Continuable) بدل نتيجة واحدة نهائية من
   * أول استدعاء — الـ Engine بيسمح باستدعاء run() تاني حتى لو المرحلة
   * لسه "running"، بدل ما ينتظر الـ Stale Lock العادي (6 دقايق).
   */
  continuable?: boolean;
}

export const STAGE_REGISTRY: StageDefinition[] = [
  {
    key: "static_code_audit",
    label: "تحليل الكود الثابت (Static Code Audit)",
    order: 1,
    run: (context) => import("@/lib/static-review/eqa-bridge").then((m) => m.runStaticCodeAuditStage(context)),
    continuable: true,
  },
  {
    key: "security_audit",
    label: "تدقيق الأمان (Security Audit)",
    order: 2,
    run: (context) => import("@/lib/security-review/eqa-bridge").then((m) => m.runSecurityAuditStage(context)),
    continuable: true,
  },
  {
    key: "database_audit",
    label: "تدقيق قاعدة البيانات (Database Audit)",
    order: 3,
    run: (context) => import("@/lib/database-review/eqa-bridge").then((m) => m.runDatabaseAuditStage(context)),
    continuable: true,
  },
  {
    key: "architecture_audit",
    label: "تدقيق معماري (Architecture Audit)",
    order: 4,
    run: (context) => import("@/lib/architecture-review/eqa-bridge").then((m) => m.runArchitectureAuditStage(context)),
    continuable: true,
  },
  {
    key: "code_quality_audit",
    label: "تدقيق جودة الكود (Code Quality Audit)",
    order: 5,
    run: (context) => import("@/lib/code-quality-review/eqa-bridge").then((m) => m.runCodeQualityAuditStage(context)),
    continuable: true,
  },
  {
    key: "performance_audit",
    label: "تدقيق الأداء (Performance Audit)",
    order: 6,
    run: (context) => import("@/lib/performance-review/eqa-bridge").then((m) => m.runPerformanceAuditStage(context)),
    continuable: true,
  },
  {
    key: "prd_compliance_audit",
    label: "تدقيق التزام PRD (PRD Compliance Audit)",
    order: 7,
    run: (context) => import("@/lib/prd-compliance-review/eqa-bridge").then((m) => m.runPrdComplianceAuditStage(context)),
    continuable: true,
  },
  { key: "ui_ux_audit", label: "تدقيق واجهة الاستخدام (UI/UX Audit)", order: 8 },
  {
    key: "functional_audit",
    label: "التدقيق الوظيفي (Functional Audit / Production Validation)",
    order: 9,
    // Production Validation Engine (Phase 4) — E2E حقيقي بمتصفح على
    // Staging URL. بيغطي داخليًا برضه ما كان مخطط له كـ ui_ux_audit
    // (Responsive/Accessibility) وregression_testing (Retry/Flaky) و
    // production_certification (Deployment Gate) — راجع التقرير
    // الختامي لتفاصيل قرار الدمج ده.
    run: (context) => import("@/lib/production-validation/eqa-bridge").then((m) => m.runFunctionalAuditStage(context)),
    continuable: true,
  },
  { key: "regression_testing", label: "اختبار الانحدار (Regression Testing)", order: 10 },
  { key: "ai_code_smell_detection", label: "كشف أنماط كود الذكاء الاصطناعي (AI Code Smell Detection)", order: 11 },
  { key: "production_certification", label: "شهادة جاهزية الإنتاج (Production Certification)", order: 12 },
];

export function getStageDefinition(key: string): StageDefinition | null {
  return STAGE_REGISTRY.find((s) => s.key === key) ?? null;
}

const PLACEHOLDER_SUMMARY =
  "هذه المرحلة جزء من البنية التحتية لنظام Engineering QA (Phase 12.1) — لسه معملهاش أي فحص فعلي. منطق الفحص الحقيقي هيتضاف في مرحلة قادمة بإضافة دالة run() لتعريف هذه المرحلة في الـ Stage Registry فقط، من غير أي تعديل على الـ Engine.";

/** المنفّذ البديل — بيتستخدم لأي Stage لسه من غير `run` حقيقي. */
export async function runPlaceholderStage(): Promise<StageRunResult> {
  return {
    score: null,
    summary: PLACEHOLDER_SUMMARY,
    findingsJson: [],
    recommendationsJson: [],
  };
}
