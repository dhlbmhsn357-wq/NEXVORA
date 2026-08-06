import type { StaticReviewCategory } from "@/lib/types/database";

/**
 * أي Lock معلّق أقدم من كده يُعتبر Job مات ويُعاد المحاولة فوقه — نفس
 * القيمة المستخدمة في generation-service.ts (مصدر واحد للحقيقة،
 * ومُصدَّرة من هنا لأن الملف ده Client-safe).
 */
export const STALE_LOCK_MS = 6 * 60_000;

/**
 * قرار "إيه المحور اللي يتولّد بعده" — منطق خالص بدون state أو side
 * effect. المحاور السبعة مستقلة عن بعض، لكن بنشغّلهم بالتسلسل واحد
 * واحد عمدًا (مش بالتوازي) — نفس الدرس من Meeting Prep/Engineering Audit.
 */
export function findNextCategoryToTrigger(categories: StaticReviewCategory[]): StaticReviewCategory | null {
  if (categories.some((c) => c.status === "generating")) return null;
  return categories.find((c) => c.status === "pending") ?? null;
}

export function allCategoriesReady(categories: StaticReviewCategory[]): boolean {
  return categories.length > 0 && categories.every((c) => c.status === "ready");
}

/**
 * محور شغّال ("generating") من غير أي تحديث لمدة أطول من STALE_LOCK_MS
 * يبقى غالبًا Job مات فجأة قبل ما يسجّل نفسه Failed — بدون اكتشافه، كان
 * هيفضل عالق للأبد (نفس الدرس المستفاد من مشكلة حقيقية في Engineering
 * Audit تم حلها بنفس الطريقة).
 */
export function findStuckGeneratingCategory(
  categories: StaticReviewCategory[],
  nowMs: number,
  staleMs: number
): StaticReviewCategory | null {
  return (
    categories.find((c) => c.status === "generating" && nowMs - new Date(c.updated_at).getTime() > staleMs) ?? null
  );
}
