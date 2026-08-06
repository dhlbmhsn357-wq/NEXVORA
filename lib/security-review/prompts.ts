import type { SecurityReviewCategoryKey } from "@/lib/types/database";
import type { RepoFile } from "@/lib/github/repo-reader";
import { buildPhaseCategoryPrompt } from "@/lib/ai/prompts/phase-audit-shared";

const PERSONA = "أنت Application Security Engineer بتعمل مراجعة أمنية عميقة قبل الإطلاق للإنتاج، مبنية على أدلة حقيقية 100% لمحور واحد بس.";

const CATEGORY_GUIDANCE: Record<SecurityReviewCategoryKey, { title: string; focus: string }> = {
  authentication: {
    title: "Authentication Audit",
    focus: `راجع كل آليات تسجيل الدخول: Session Management, Token Lifecycle, Refresh Tokens, Logout Flow, Password Policies (إن وجدت), Magic Links, MFA Readiness, Session Expiration, Session Fixation, Session Hijacking Prevention. أي جلسة أو Token بلا انتهاء صلاحية واضح، أو تسجيل خروج مايمسحش الجلسة فعليًا، Finding حقيقي.`,
  },
  authorization: {
    title: "Authorization Audit",
    focus: `راجع: RBAC, Permission Enforcement, Route Protection, API Protection, Resource Ownership, Access Control Consistency, Privilege Escalation, Broken Access Control. أي Endpoint أو Server Action يمكن الوصول إليه أو تنفيذه بدون التحقق من الصلاحية المناسبة (owner/admin/member) أو بدون التحقق من ملكية المورد (Resource Ownership) — مثلاً تعديل بيانات مشروع بمعرفه (id) بس من غير التأكد إن المستخدم عضو في المشروع ده — يجب اعتباره Critical.`,
  },
  rls: {
    title: "Row Level Security Audit",
    focus: `راجع سياسات RLS في ملفات الـ Migrations المرفقة (create policy ...). تحقق من: وجود Policy لكل جدول حساس (مفيش جدول من غير enable row level security أو من غير أي policy)، عدم وجود Policies واسعة أكثر من اللازم (زي using (true) على جدول بيانات حساسة)، توافق السياسات مع RBAC الحالي (owner/admin/member)، منع Cross-Project Access (أي مستخدم يقدر يشوف بيانات مشروع مش بتاعه)، منع Data Leakage.`,
  },
  api_security: {
    title: "API Security Audit",
    focus: `راجع كل API Routes وServer Actions: Authentication check قبل أي عملية، Authorization المناسبة، Error Handling (مايكشفش تفاصيل داخلية في رسائل الخطأ)، Rate Limiting (وجوده أو غيابه)، Request Size Limits، Sensitive Data Exposure في الردود (إرجاع حقول حساسة مش لازمة للـ Client)، Secure Headers، استخدام HTTP Methods الصحيحة.`,
  },
  input_validation: {
    title: "Input Validation Audit",
    focus: `راجع كل نقطة إدخال بيانات من المستخدم (Forms, API bodies, Query params, File uploads): Required Fields, Length Validation, Type Validation, File Validation (نوع/حجم الملف), HTML Injection (XSS), Script Injection, SQL Injection (خصوصًا أي استعلام مبني بـ String concatenation بدل Parameterized queries), Command Injection, Path Traversal, Unsafe Parsing (JSON.parse بدون try/catch على مدخل خارجي مثلاً).`,
  },
  secrets: {
    title: "Secrets Audit",
    focus: `دوّر على أي API Key أو Token أو Secret أو Connection String أو Service Key أو رابط خاص مكتوب حرفيًا (Hardcoded) داخل الكود المصدري بدل ما يتقرا من Environment Variable. أي قيمة زي كده لازم تتسجّل Finding بخطورة Critical فورًا — حتى لو القيمة نفسها placeholder أو مثال، وضّح في الوصف إن ده نمط خطر بغض النظر عن القيمة الفعلية. تأكد كمان إن مفيش Secret بيتبعت للـ Frontend (Client Component أو رد API) بالغلط.`,
  },
  environment: {
    title: "Environment Audit",
    focus: `راجع ملفات الإعدادات (next.config, tsconfig, ملفات .env.example إن وجدت، إعدادات Middleware): Environment Separation (Development/Preview/Production) — هل فيه قيم افتراضية خطرة بتتفعّل تلقائيًا في الإنتاج؟ Secret Management (إزاي البيئة بتدير الأسرار)، Feature Flags، Configuration Consistency بين البيئات المختلفة.`,
  },
};

export function buildSecurityCategoryPrompt(
  categoryKey: SecurityReviewCategoryKey,
  files: RepoFile[],
  fileTree: string[],
  isIncremental: boolean
): string {
  const guidance = CATEGORY_GUIDANCE[categoryKey];
  return buildPhaseCategoryPrompt({
    persona: PERSONA,
    categoryTitle: guidance.title,
    categoryFocus: guidance.focus,
    files,
    fileTree: categoryKey === "authorization" || categoryKey === "rls" ? fileTree : undefined,
    fileTreeLabel: "شجرة ملفات المشروع القابلة للمراجعة",
    isIncremental,
  });
}
