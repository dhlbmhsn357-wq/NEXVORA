import type { CodeQualityReviewCategoryKey } from "@/lib/types/database";
import type { RepoFile } from "@/lib/github/repo-reader";
import { buildPhaseCategoryPrompt } from "@/lib/ai/prompts/phase-audit-shared";

const PERSONA = "أنت Senior Code Reviewer بتعمل مراجعة عميقة لجودة الكود قبل الإطلاق للإنتاج، مبنية على أدلة حقيقية 100% لمحور واحد بس.";

const CATEGORY_GUIDANCE: Record<CodeQualityReviewCategoryKey, { title: string; focus: string }> = {
  readability: {
    title: "Readability Audit",
    focus: `راجع وضوح الكود: دوال طويلة جدًا (أكتر من شاشة واحدة) بتعمل حاجات كتير مختلفة، تعليقات ناقصة في أماكن فيها منطق معقد غير بديهي، تعشيش (Nesting) عميق جدًا بيصعّب القراءة، أسماء متغيرات غير واضحة (x, temp, data1).`,
  },
  duplication: {
    title: "Duplication Audit",
    focus: `دوّر على كود مكرر حرفيًا أو شبه حرفي في أكتر من مكان (نفس المنطق بنسخ ولصق بدل دالة/Component مشترك) — ده تحديدًا بيسبب تناقض لما حد يعدّل نسخة وينسى الباقي.`,
  },
  error_handling: {
    title: "Error Handling Audit",
    focus: `راجع معالجة الأخطاء: استدعاءات async/await من غير try/catch، أخطاء بتتبلع بصمت (catch فاضي)، رسائل خطأ غير واضحة للمستخدم، عمليات حساسة (كتابة على قاعدة البيانات، استدعاء خارجي) من غير أي معالجة لفشلها المحتمل.`,
  },
  testing_coverage: {
    title: "Testing Coverage Audit",
    focus: `راجع الملفات المتغيّرة: منطق مهم (حسابات، قرارات شرطية معقدة، تحويل بيانات) اتضاف أو اتعدّل من غير أي اختبار مصاحب له، اختبارات موجودة بس بتغطي الحالة السعيدة بس (Happy Path) من غير حواف (Edge Cases).`,
  },
  naming_consistency: {
    title: "Naming Consistency Audit",
    focus: `راجع اتساق التسمية عبر الملفات: خلط بين camelCase/snake_case/PascalCase لنفس نوع العنصر، أسماء دوال بتوصف حاجة والدالة بتعمل حاجة تانية فعليًا (Misleading Names)، عدم اتساق في بادئات/لاحقات (get/fetch/load لنفس الغرض في أماكن مختلفة).`,
  },
  complexity: {
    title: "Complexity Audit",
    focus: `راجع التعقيد المنطقي: دوال فيها كذا شرط متداخل (if جوه if جوه if) بدل Early Return أو تفكيك، دالة واحدة بتاخد كذا مسؤولية مختلفة، تعقيد دوري (Cyclomatic Complexity) عالي واضح من عدد المسارات الممكنة.`,
  },
};

export function buildCodeQualityCategoryPrompt(
  categoryKey: CodeQualityReviewCategoryKey,
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
    fileTree: categoryKey === "duplication" ? fileTree : undefined,
    fileTreeLabel: "شجرة ملفات المشروع القابلة للمراجعة",
    isIncremental,
  });
}
