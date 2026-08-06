import type { ArchitectureReviewCategoryKey } from "@/lib/types/database";
import type { RepoFile } from "@/lib/github/repo-reader";
import { buildPhaseCategoryPrompt } from "@/lib/ai/prompts/phase-audit-shared";

const PERSONA = "أنت Principal Software Architect بتعمل مراجعة معمارية عميقة قبل الإطلاق للإنتاج، مبنية على أدلة حقيقية 100% لمحور واحد بس.";

const CATEGORY_GUIDANCE: Record<ArchitectureReviewCategoryKey, { title: string; focus: string }> = {
  layering: {
    title: "Layering Audit",
    focus: `راجع فصل الطبقات (UI/Server Actions/Services/Data Access): هل كود الواجهة (Client Component) بيتكلم مباشرة مع قاعدة البيانات؟ هل منطق العمل (Business Logic) متسرّب داخل Route Handler بدل طبقة Service مستقلة؟ هل فيه اختلاط بين طبقة العرض ومنطق الوصول للبيانات في نفس الملف؟`,
  },
  coupling: {
    title: "Coupling Audit",
    focus: `دوّر على اقتران زايد (Tight Coupling) بين وحدات مفروض تكون مستقلة: ملف بيستورد تفاصيل داخلية لوحدة تانية بدل واجهة عامة، تعديل في ملف واحد بيكسر كذا مكان تاني، غياب فصل واضح بين المسؤوليات (Single Responsibility)، اعتماديات دائرية (Circular Dependencies) بين الوحدات.`,
  },
  scalability: {
    title: "Scalability Audit",
    focus: `راجع قابلية التوسع الفعلية: كود بيفترض حجم بيانات صغير ثابت (Loop على كل الصفوف بدل Pagination)، عمليات متزامنة (Synchronous) لعمليات المفروض تبقى Background Job، غياب أي حد أقصى (Rate Limiting/Throttling) على عمليات مكلفة، بنية مش هتستحمّل زيادة مستخدمين حقيقية.`,
  },
  module_boundaries: {
    title: "Module Boundaries Audit",
    focus: `راجع حدود الوحدات (lib/ وapp/): وحدة بتستورد من وحدة تانية بشكل مباشر بدل نقطة دخول واحدة معلنة، غياب فصل واضح بين المشروع (Feature) والبنية التحتية المشتركة (Shared Infra)، تسريب تفاصيل تنفيذ داخلية (Internal Implementation Details) لوحدة خارج حدودها المفروضة.`,
  },
  dependency_management: {
    title: "Dependency Management Audit",
    focus: `راجع package.json وطريقة استخدام المكتبات الخارجية: مكتبة اتضافت لاستخدام بسيط ممكن يتعمل بدونها، نسخ متضاربة لنفس الوظيفة، اعتماديات كبيرة (Heavy Dependencies) بتتحمّل في مسارات مش محتاجاها (خصوصًا Client Bundle)، غياب فصل واضح بين Dependencies وDevDependencies.`,
  },
  api_design: {
    title: "API Design Audit",
    focus: `راجع تصميم الـ Server Actions/Route Handlers: تسمية غير متسقة، عدم وضوح المدخلات/المخرجات (Types غير محددة أو any)، غياب تحقق واضح من صحة المدخلات قبل المعالجة، دالة واحدة بتعمل أكتر من مسؤولية، نقطة دخول واحدة بترجع أشكال ردود مختلفة حسب الحالة بدون توثيق.`,
  },
};

export function buildArchitectureCategoryPrompt(
  categoryKey: ArchitectureReviewCategoryKey,
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
    fileTree: categoryKey === "module_boundaries" || categoryKey === "layering" ? fileTree : undefined,
    fileTreeLabel: "شجرة ملفات المشروع القابلة للمراجعة",
    isIncremental,
  });
}
