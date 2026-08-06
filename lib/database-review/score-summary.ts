import type { DatabaseReviewCategoryKey, DatabaseScoreSummary } from "@/lib/types/database";

function average(values: number[]): number {
  if (values.length === 0) return 100;
  return Math.round(values.reduce((sum, v) => sum + v, 0) / values.length);
}

/**
 * يبني لوحة درجات Database Integrity من درجات المحاور الستة — حسابيًا
 * بالكامل. "Database Integrity" بُعد مُشتق (متوسط database_structure +
 * migration + data_integrity) لأن الثلاثة بيغطوا نفس مساحة سلامة
 * البنية. query/storage/logging بيرجعوا درجة محورهم مباشرة.
 */
export function computeDatabaseScoreSummary(categoryScores: Record<DatabaseReviewCategoryKey, number>): DatabaseScoreSummary {
  const { database_structure, query, migration, data_integrity, storage, logging } = categoryScores;

  return {
    database_integrity: average([database_structure, migration, data_integrity]),
    query_quality: query,
    storage_security: storage,
    logging,
    overall_database_score: average([database_structure, query, migration, data_integrity, storage, logging]),
  };
}
