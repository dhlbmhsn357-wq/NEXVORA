import { AITaskType } from "@/lib/ai/types";

/**
 * منطق حتمي خالص (بدون AI) لتحديد: هل فيه دليل حقيقي على نتيجة سيئة
 * تستحق اقتراح تحسين برومبت؟ الـ AI بيتنادى بس لو فيه إشارة، مش بشكل
 * تلقائي على كل مشروع (mechanical gate — نفس فلسفة كل محرك سابق).
 */

export const EQA_SCORE_THRESHOLD = 70;
export const NEGATIVE_SATISFACTION_MIN = 1;
export const CHANGE_REQUEST_THRESHOLD = 3;

export interface OutcomeSignalInput {
  eqaOverallScore: number | null;
  negativeSatisfactionCount: number;
  changeRequestCount: number;
}

export interface OutcomeSignal {
  taskType: AITaskType;
  reason: string;
}

export function detectOutcomeSignals(input: OutcomeSignalInput): OutcomeSignal[] {
  const signals: OutcomeSignal[] = [];

  if (input.eqaOverallScore !== null && input.eqaOverallScore < EQA_SCORE_THRESHOLD) {
    signals.push({
      taskType: AITaskType.DEVELOPER_HANDOFF_GENERATION,
      reason: `درجة Engineering QA النهائية منخفضة (${input.eqaOverallScore} < ${EQA_SCORE_THRESHOLD}).`,
    });
  }

  if (input.negativeSatisfactionCount >= NEGATIVE_SATISFACTION_MIN) {
    signals.push({
      taskType: AITaskType.PRD_GENERATION,
      reason: `${input.negativeSatisfactionCount} تقييم عميل سلبي على طلبات دعم محلولة.`,
    });
  }

  if (input.changeRequestCount >= CHANGE_REQUEST_THRESHOLD) {
    signals.push({
      taskType: AITaskType.PRD_GENERATION,
      reason: `${input.changeRequestCount} طلب تعديل (change_request) — إشارة محتملة لمتطلبات ناقصة في الـ PRD الأصلي.`,
    });
  }

  return signals;
}
