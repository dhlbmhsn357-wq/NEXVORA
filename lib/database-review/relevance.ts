import type { DatabaseReviewCategoryKey } from "@/lib/types/database";

/** نفس فكرة lib/security-review/relevance.ts — محور "query" مستثنى لأن استعلامات قاعدة البيانات ممكن تكون في أي ملف كود. */
const RELEVANCE_PATTERNS: Record<DatabaseReviewCategoryKey, RegExp | null> = {
  database_structure: /migrations?\/|\.sql$|schema/i,
  query: null,
  migration: /migrations?\//i,
  data_integrity: /migrations?\/|\.sql$/i,
  storage: /storage|upload|bucket/i,
  logging: /console\.|logger|log(ging)?/i,
};

export function isFileRelevantToDatabaseCategory(categoryKey: DatabaseReviewCategoryKey, filePath: string): boolean {
  const pattern = RELEVANCE_PATTERNS[categoryKey];
  if (pattern === null) return true;
  return pattern.test(filePath);
}

export function isCategoryRelevantToChangedFiles(categoryKey: DatabaseReviewCategoryKey, changedPaths: string[]): boolean {
  return changedPaths.some((p) => isFileRelevantToDatabaseCategory(categoryKey, p));
}

/**
 * محور "query" مالوش نمط مسار (RELEVANCE_PATTERNS.query = null) لأن
 * الاستعلامات فعلاً ممكن تكون في أي ملف — ده صحيح لقرار "التخطي"
 * (منعرفش نتخطاه أبدًا). لكن لما بييجي وقت بناء الـ Prompt الفعلي،
 * لازم فلترة حقيقية بمحتوى الملف نفسه (مش مساره) بدل ما نبعت الـ
 * Repository كله — ده كان السبب في إن محور Query تحديدًا أبطأ محور
 * وبيلمس سقف الـ Timeout، لأنه الوحيد اللي بياخد كل الملفات المتغيّرة
 * من غير أي تضييق.
 */
const QUERY_CONTENT_PATTERN = /\.from\(|\.rpc\(|\.select\(|\.insert\(|\.update\(|\.upsert\(|\.delete\(|createServiceClient|createClient\(|supabase\s*\./;

export function isFileContentRelevantToQueryCategory(fileContent: string): boolean {
  return QUERY_CONTENT_PATTERN.test(fileContent);
}
