import type { KnowledgeStatus } from "@/lib/types/database";

/**
 * منطق حتمي خالص (بدون AI) لقواعد الـ Knowledge Validation المطلوبة:
 * "لا تصبح أي معلومة جزءاً من Knowledge Base إلا إذا تكررت، أو اعتمدها
 * مستخدم." الاعتماد اليدوي (approved) والرفض (rejected) حالتان نهائيتان
 * بيقررهم إنسان فقط — مفيش قاعدة هنا بترجّعهم لـ candidate/validated.
 */

export const DEDUP_SIMILARITY_THRESHOLD = 0.88;
export const VALIDATION_OCCURRENCE_THRESHOLD = 2;

export function isDuplicateMatch(similarity: number): boolean {
  return similarity >= DEDUP_SIMILARITY_THRESHOLD;
}

export function nextKnowledgeStatus(currentStatus: KnowledgeStatus, occurrenceCount: number): KnowledgeStatus {
  if (currentStatus === "approved" || currentStatus === "rejected") return currentStatus;
  return occurrenceCount >= VALIDATION_OCCURRENCE_THRESHOLD ? "validated" : "candidate";
}
