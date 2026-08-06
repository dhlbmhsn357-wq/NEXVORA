import type { SecurityReviewCategoryKey } from "@/lib/types/database";

/**
 * أي محور من محاور الأمان بيهتم بأنواع ملفات مختلفة — لو فيه ملفات
 * اتغيّرت في المراجعة الحالية بس ولا واحد فيها له علاقة بمحور معيّن،
 * منعيدش تشغيل الـ AI للمحور ده خالص (نفس درس الـ Spec: "لو ملفات
 * Authentication ملتغيرتش لا تعاد مراجعتها"). محور "secrets" مستثنى —
 * سر ممكن يتحط في أي ملف، فبيفضل دايمًا "مرتبط" بأي تغيير.
 */
const RELEVANCE_PATTERNS: Record<SecurityReviewCategoryKey, RegExp | null> = {
  authentication: /auth|session|login|middleware|jwt|magic-?link/i,
  authorization: /rbac|permission|authoriz|guard|role|ownership/i,
  rls: /migrations?\/|\.sql$|rls|policy/i,
  api_security: /\/api\/|route\.ts$|-actions?\.ts$|actions\.ts$/i,
  input_validation: /valid|schema|zod|-actions?\.ts$|actions\.ts$|\/api\//i,
  secrets: null,
  environment: /\.env|config|next\.config|middleware/i,
};

export function isFileRelevantToSecurityCategory(categoryKey: SecurityReviewCategoryKey, filePath: string): boolean {
  const pattern = RELEVANCE_PATTERNS[categoryKey];
  if (pattern === null) return true;
  return pattern.test(filePath);
}

/** true لو أي ملف من الملفات المتغيّرة له علاقة بالمحور ده. */
export function isCategoryRelevantToChangedFiles(categoryKey: SecurityReviewCategoryKey, changedPaths: string[]): boolean {
  return changedPaths.some((p) => isFileRelevantToSecurityCategory(categoryKey, p));
}
