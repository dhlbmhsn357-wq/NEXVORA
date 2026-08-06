import { Settings as SettingsIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireAdmin } from "@/lib/auth/rbac";
import { healOwnerStatuses } from "@/lib/auth/owner-protection";
import { AIProviderName, AITaskType } from "@/lib/ai/types";
import PageHeader from "@/components/ui/PageHeader";
import TaskModelRow from "./task-model-row";
import TestConnectionButton from "./test-connection-button";
import ExternalTokensHealth from "./external-tokens-health";
import UsersManager, { type ManagedUser } from "./users-manager";
import SettingsTabs from "./settings-tabs";
import WhatsAppPanel from "./whatsapp-panel";
import BrainSettingsPanel from "./brain-settings-panel";
import AiKeysPanel from "./ai-keys-panel";
import { listAiKeys } from "@/lib/ai/key-management";
import { isSecretCryptoConfigured } from "@/lib/security/secret-crypto";
import { WhatsAppService } from "@/lib/whatsapp/service";
import { getBrainSettings } from "@/lib/brain-v2/review-service";
import { listAllTemplates } from "@/lib/whatsapp/templates";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import type {
  AIProviderStatus,
  AITaskModelConfig,
  UserRole,
  WhatsAppProviderStatus,
} from "@/lib/types/database";

const taskTypeLabels: Record<AITaskType, string> = {
  [AITaskType.MIGRATION_SOURCE_ANALYSIS]: "تحليل مصدر الترحيل",
  [AITaskType.SCHEMA_MAPPING_ANALYSIS]: "تحليل Mapping الترحيل",
  [AITaskType.DATA_QUALITY_ANALYSIS]: "تحليل جودة البيانات",
  [AITaskType.TRANSFORMATION_RULE_GENERATION]: "توليد قواعد التحويل",
  [AITaskType.MIGRATION_SIMULATION_VALIDATION]: "تحقّق محاكاة الترحيل (Digital Twin)",
  [AITaskType.MIGRATION_RECOVERY]: "استعادة أخطاء الترحيل الحقيقي (Production Migration)",
  [AITaskType.MIGRATION_GOLIVE_VERIFICATION]: "تحقّق ما بعد الترحيل وقبول الأعمال (Go-Live)",
  [AITaskType.MIGRATION_HYPERCARE_ANALYSIS]: "تحليل Hypercare (جذور الأسباب + التحسين)",
  [AITaskType.PROJECT_ANALYSIS]: "تحليل المشروع",
  [AITaskType.DISCOVERY_ANALYSIS]: "تحليل نموذج الاكتشاف",
  [AITaskType.DISCOVERY_FORM_GENERATION]: "توليد نموذج اكتشاف بالذكاء الاصطناعي",
  [AITaskType.COLLABORATION_SUMMARY]: "تلخيص/استخراج محادثات التعاون",
  [AITaskType.TASK_ORCHESTRATION]: "تنسيق المهام (تقدير/تقسيم)",
  [AITaskType.DELIVERY_INTELLIGENCE]: "ذكاء التسليم (تنبؤ/ملخص تنفيذي)",
  [AITaskType.AUTOMATION_INTELLIGENCE]: "ذكاء الأتمتة (اختناقات/إخفاقات/تقرير تنفيذي)",
  [AITaskType.ARCHITECTURE_VALIDATION]: "التحقّق المعماري قبل الـ PRD (نواقص الوحدات/الأدوار/التكاملات)",
  [AITaskType.EXECUTIVE_INTELLIGENCE]: "المساعد التنفيذي (COO) — أسئلة الإدارة",
  [AITaskType.EXECUTIVE_REPORT]: "التقارير التنفيذية (أسبوعي/شهري/مخاطر)",
  [AITaskType.PROMPT_REFINEMENT]: "تحسين البرومبت (Prompt Framework)",
  [AITaskType.MEETING_SUMMARY]: "ملخص الاجتماع",
  [AITaskType.PRD_GENERATION]: "توليد PRD",
  [AITaskType.PRD_INCREMENT_SECTION]: "قسم PRD للزيادة",
  [AITaskType.USER_STORY]: "قصص المستخدم",
  [AITaskType.PROMPT_GENERATION]: "توليد Prompts",
  [AITaskType.COMPETITOR_ANALYSIS]: "تحليل المنافسين",
  [AITaskType.DOCUMENTATION]: "التوثيق",
  [AITaskType.TRANSCRIPTION]: "تفريغ صوتي",
  [AITaskType.MEETING_EXTRACTION]: "استخراج بيانات الاجتماع",
  [AITaskType.PROJECT_BRAIN_SYNC]: "مزامنة Project Brain",
  [AITaskType.PROTOTYPE_PROMPT_GENERATION]: "توليد Prototype Prompt",
  [AITaskType.PROTOTYPE_PROMPT_PIPELINE_PLANNING]: "تخطيط Prototype Prompt Pipeline",
  [AITaskType.PROTOTYPE_PROMPT_PIPELINE_STAGE]: "توليد مرحلة Prototype Prompt Pipeline",
  [AITaskType.PROTOTYPE_REVIEW]: "مراجعة Prototype",
  [AITaskType.CLIENT_PRESENTATION_GENERATION]: "توليد عرض العميل",
  [AITaskType.DEVELOPER_HANDOFF_GENERATION]: "توليد حزمة Developer Handoff",
  [AITaskType.SUPPORT_TRIAGE]: "الدعم الفني الذكي (Support Triage)",
  [AITaskType.MEETING_PREPARATION]: "تجهيز اجتماع الاكتشاف (Meeting Preparation)",
  [AITaskType.STATIC_REVIEW_CATEGORY]: "مراجعة هيكلية ثابتة — محور واحد (Static Architecture Review)",
  [AITaskType.SECURITY_REVIEW_CATEGORY]: "تدقيق أمني — محور واحد (Security Audit)",
  [AITaskType.DATABASE_REVIEW_CATEGORY]: "تدقيق قاعدة بيانات — محور واحد (Database Integrity)",
  [AITaskType.ARCHITECTURE_REVIEW_CATEGORY]: "تدقيق معماري — محور واحد (Architecture Audit)",
  [AITaskType.CODE_QUALITY_REVIEW_CATEGORY]: "تدقيق جودة كود — محور واحد (Code Quality Audit)",
  [AITaskType.PRD_COMPLIANCE_REVIEW_CATEGORY]: "تدقيق التزام PRD — محور واحد (PRD Compliance Audit)",
  [AITaskType.PERFORMANCE_REVIEW_CATEGORY]: "تدقيق أداء — محور واحد (Performance Audit)",
  [AITaskType.PRODUCTION_VALIDATION_JOURNEY_GENERATION]: "توليد رحلات مستخدم (Production Validation)",
  [AITaskType.PRODUCTION_VALIDATION_CATEGORY_ENRICHMENT]: "إثراء نتائج محور (Production Validation)",
  [AITaskType.PRODUCTION_MONITORING_INCIDENT_ANALYSIS]: "تحليل حادثة (Production Monitoring)",
  [AITaskType.KNOWLEDGE_EXTRACTION]: "استخراج المعرفة (Organizational Intelligence)",
  [AITaskType.KNOWLEDGE_CLASSIFICATION]: "تصنيف المعرفة",
  [AITaskType.KNOWLEDGE_ENRICHMENT]: "إثراء المعرفة",
  [AITaskType.KNOWLEDGE_PROCESSING]: "معالجة المعرفة (ذكاء الأعمال المهيكل)",
  [AITaskType.KNOWLEDGE_INTELLIGENCE]: "الطبقة الاستشارية (رؤى ودرجات)",
  [AITaskType.KNOWLEDGE_SYNTHESIS]: "توليف المعرفة",
  [AITaskType.KNOWLEDGE_CROSS_VALIDATION]: "التحقق المتقاطع",
  [AITaskType.PROJECT_RECOMMENDATIONS]: "توصيات ذكية (Organizational Intelligence)",
  [AITaskType.AI_PRODUCT_ADVISOR]: "المستشار المنتجي (AI Product Advisor)",
  [AITaskType.PROMPT_IMPROVEMENT_SUGGESTION]: "اقتراح تحسين برومبت",
  [AITaskType.MEETING_PRESENTATION_GENERATION]: "توليد عرض اجتماع العميل (Meeting Presentation)",
  [AITaskType.MEETING_REVIEW_SYNTHESIS]: "مراجعة اجتماع بعد الانتهاء (Meeting Review)",
  [AITaskType.EMBEDDING]: "توليد Embeddings",
  [AITaskType.EXECUTION_PLAN_GENERATION]: "تخطيط تنفيذ Prototype Prompt (AI Code Execution)",
  [AITaskType.FIX_PROMPT_GENERATION]: "توليد Fix Prompt لـ Claude (AI Code Execution)",
  [AITaskType.MEETING_EXTRACTION_V2]: "استخراج معرفة الاجتماع الغني (13 فئة)",
  [AITaskType.MEETING_FILE_ANALYSIS]: "تحليل مرفقات الاجتماع بالذكاء الاصطناعي",
  [AITaskType.KNOWLEDGE_GRAPH_ANALYSIS]: "تحليل شبكة المعرفة (علاقات + تناسق)",
  [AITaskType.BRAIN_REVIEW_VALIDATION]: "تحقّق Brain Review التنفيذي (Phase 5)",
  [AITaskType.PRODUCTION_FIX_PROMPT_GENERATION]: "توليد Prompts إصلاح متعددة (Production Monitoring)",
  [AITaskType.PRODUCTION_MONITORING_REVIEW_VERDICT]: "حكم مراجعة ما بعد الإصلاح (Production Monitoring Review)",
};

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // إدارة المستخدمين (تبويب الفريق) لمسؤول النظام/المسؤول فقط — بنفحص الدور
  // هنا سيرفر-سايد، فحتى لو حد عرف الرابط مش هيتحمّل ولا يتبعت أي بيانات فريق.
  const admin = await requireAdmin();
  const isAdmin = admin.ok;
  const currentUserRole = (admin.role ?? "member") as UserRole;

  // تصحيح تلقائي لأي انحراف في حالة مسؤول النظام (owner لازم يكون active دائمًا).
  if (isAdmin) {
    await healOwnerStatuses(createServiceClient());
  }

  // مفاتيح الذكاء الاصطناعي (مصدر مشترك عبر البيئات) — للمسؤولين فقط.
  const aiKeys = isAdmin ? await listAiKeys() : [];
  const cryptoConfigured = isSecretCryptoConfigured();

  const [
    { data: taskConfigs },
    { data: providerStatus },
    membersResult,
    waSettings,
    brainSettings,
    waTemplates,
    { data: waStatusRow },
  ] = await Promise.all([
    supabase
      .from("ai_task_model_config")
      .select("task_type, provider, model, updated_at, updated_by"),
    supabase
      .from("ai_provider_status")
      .select("provider, last_check_at, last_check_ok, last_message")
      .eq("provider", AIProviderName.GEMINI)
      .maybeSingle(),
    isAdmin
      ? supabase
          .from("profiles")
          .select("id, full_name, email, role, status, last_login_at, created_at")
          .order("full_name")
      : Promise.resolve({ data: [] as ManagedUser[] }),
    WhatsAppService.getSettings(supabase),
    getBrainSettings(supabase),
    listAllTemplates(supabase),
    supabase
      .from("whatsapp_provider_status")
      .select("provider, last_check_at, last_check_ok, last_message")
      .order("last_check_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const configs = (taskConfigs ?? []) as AITaskModelConfig[];
  const status = providerStatus as AIProviderStatus | null;
  const teamMembers = (membersResult.data ?? []) as ManagedUser[];

  return (
    <div>
      <PageHeader
        title="الإعدادات"
        icon={SettingsIcon}
        description="إعدادات مزوّد الذكاء الاصطناعي والموديل المستخدم لكل نوع مهمة."
      />

      <div>
        <SettingsTabs
          ai={
            <div className="space-y-6">
              <Card padding="md">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-[var(--v-text)]">مزوّد الذكاء الاصطناعي</p>
                  {status && <Badge tone={status.last_check_ok ? "success" : "danger"}>{status.last_check_ok ? "متصل" : "غير متصل"}</Badge>}
                </div>
                <p className="mt-1 text-xs text-[var(--v-text-muted)]">
                  المزوّد الافتراضي حاليًا: <span className="font-medium text-[var(--v-text)]">Gemini</span>
                </p>

                <div className="mt-4 flex items-center gap-4">
                  <div className="flex-1">
                    <p className="text-xs text-[var(--v-text-muted)]">
                      آخر اختبار اتصال:{" "}
                      {status?.last_check_at
                        ? new Date(status.last_check_at).toLocaleString("ar-EG")
                        : "لم يُختبر بعد"}
                    </p>
                    {status && !status.last_check_ok && (
                      <p className="mt-1 text-xs text-[var(--v-red)]">{status.last_message}</p>
                    )}
                  </div>
                  <TestConnectionButton provider={AIProviderName.GEMINI} />
                </div>
              </Card>

              <AiKeysPanel initialKeys={aiKeys} cryptoConfigured={cryptoConfigured} />

              <Card padding="md">
                <p className="mb-2 text-sm font-semibold text-[var(--v-text)]">الموديل المستخدم لكل نوع مهمة</p>
                <div>
                  {configs.map((c) => (
                    <TaskModelRow
                      key={c.task_type}
                      taskType={c.task_type as AITaskType}
                      label={taskTypeLabels[c.task_type as AITaskType] ?? c.task_type}
                      initialModel={c.model}
                      initialProvider={c.provider}
                    />
                  ))}
                </div>
              </Card>
            </div>
          }
          brain={<BrainSettingsPanel settings={brainSettings} />}
          whatsapp={
            <WhatsAppPanel
              settings={waSettings}
              templates={waTemplates}
              status={(waStatusRow as WhatsAppProviderStatus) ?? null}
            />
          }
          integrations={<ExternalTokensHealth />}
          showTeam={isAdmin}
          team={
            isAdmin && user ? (
              <UsersManager users={teamMembers} currentUserId={user.id} currentUserRole={currentUserRole} />
            ) : null
          }
        />
      </div>
    </div>
  );
}
