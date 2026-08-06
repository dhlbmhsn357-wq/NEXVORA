import type { PerformanceReviewCategoryKey } from "@/lib/types/database";
import type { RepoFile } from "@/lib/github/repo-reader";
import { buildPhaseCategoryPrompt } from "@/lib/ai/prompts/phase-audit-shared";

const PERSONA = "أنت Performance Engineer بتعمل مراجعة عميقة لأداء التطبيق قبل الإطلاق للإنتاج، مبنية على أدلة حقيقية 100% لمحور واحد بس.";

const CATEGORY_GUIDANCE: Record<PerformanceReviewCategoryKey, { title: string; focus: string }> = {
  query_performance: {
    title: "Query Performance Audit",
    focus: `راجع كل استعلامات قاعدة البيانات (.from()/.select()/.rpc() وغيرها): استعلامات جوّه Loop (N+1)، جلب أعمدة زيادة (select("*") لما محتاج أعمدة معينة بس)، غياب Pagination على جداول كبيرة، استعلامات متكررة نفسها في أماكن قريبة بدل تجميعها في استدعاء واحد.`,
  },
  bundle_size: {
    title: "Bundle Size Audit",
    focus: `راجع Client Components ("use client"): استيراد مكتبة كبيرة كاملة (import * from) لاستخدام دالة واحدة بسيطة منها، استيراد كود Server-only (زي Playwright أو مكتبات خادم تانية) بشكل غير مباشر في مسار بيوصل للـ Client Bundle، غياب Dynamic Import لمكونات كبيرة مش محتاجة تظهر فورًا.`,
  },
  caching: {
    title: "Caching Audit",
    focus: `راجع استراتيجية التخزين المؤقت: بيانات ثابتة نسبيًا بتتقرا من قاعدة البيانات في كل طلب من غير أي Cache، غياب revalidatePath/revalidateTag بعد تعديل بيانات معروضة في صفحة تانية (بيانات قديمة معروضة للمستخدم)، أو العكس: Cache قديم مش بيتحدّث لما المفروض.`,
  },
  render_performance: {
    title: "Render Performance Audit",
    focus: `راجع أداء العرض (React Components): قايمة طويلة بتتعرض من غير Virtualization، إعادة حساب/تصيير مكلفة في كل Render من غير useMemo/useCallback لما فعليًا لازمة، State بيتحدّث بشكل بيسبب Re-render لشجرة Components كبيرة من غير داعي.`,
  },
  n_plus_one: {
    title: "N+1 Patterns Audit",
    focus: `دوّر تحديدًا على نمط N+1 (استعلام واحد لجلب قايمة، وبعدين استعلام إضافي منفصل لكل عنصر فيها بدل جلبهم مرة واحدة بـ Join أو IN) — سواء في استعلامات قاعدة البيانات أو في استدعاءات API خارجية جوّه Loop.`,
  },
  async_patterns: {
    title: "Async Patterns Audit",
    focus: `راجع استخدام async/await وPromise: عمليات مستقلة بتتنفذ بالتتابع (await واحدة ورا التانية) بدل Promise.all لما ممكن تتوازى، عدم انتظار Promise أصلًا (Fire and forget غير مقصود)، Await جوّه Loop لعمليات مستقلة عن بعض.`,
  },
};

export function buildPerformanceCategoryPrompt(
  categoryKey: PerformanceReviewCategoryKey,
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
    fileTree: categoryKey === "caching" ? fileTree : undefined,
    fileTreeLabel: "شجرة ملفات المشروع القابلة للمراجعة",
    isIncremental,
  });
}
