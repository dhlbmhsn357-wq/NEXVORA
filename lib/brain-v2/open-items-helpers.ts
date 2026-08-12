import type { BrainContent } from "./types";
import type {
  AssumptionDisposition,
  AssumptionDispositionsMap,
  MissingInfoDisposition,
  MissingInfoDispositionsMap,
} from "./review-types";

/**
 * منطق «معلّق؟» موحّد لبنود المعلومات الناقصة/الافتراضات — مصدر واحد
 * يُستخدم في brain-open-items-panel.tsx (العرض) وbrain-wizard.tsx/page.tsx
 * (حساب البوابة قبل الانتقال للخطوة التالية)، عشان الرقمين ما يختلفوش.
 */
export function isOpenItemPending(d: MissingInfoDisposition | AssumptionDisposition | undefined): boolean {
  return !d || d.state === "pending";
}

export interface OpenItemsPendingCount {
  missingPending: number;
  assumptionPending: number;
  totalPending: number;
  totalItems: number;
}

export function computeOpenItemsPendingCount(
  content: BrainContent,
  missingDispositions: MissingInfoDispositionsMap,
  assumptionDispositions: AssumptionDispositionsMap
): OpenItemsPendingCount {
  const missingItems = content.missing_information.content;
  const assumptionItems = content.assumptions.content;
  const missingPending = missingItems.filter((_, i) => isOpenItemPending(missingDispositions[String(i)])).length;
  const assumptionPending = assumptionItems.filter((_, i) => isOpenItemPending(assumptionDispositions[String(i)])).length;
  return {
    missingPending,
    assumptionPending,
    totalPending: missingPending + assumptionPending,
    totalItems: missingItems.length + assumptionItems.length,
  };
}
