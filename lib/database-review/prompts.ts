import type { DatabaseReviewCategoryKey } from "@/lib/types/database";
import type { RepoFile } from "@/lib/github/repo-reader";
import { buildPhaseCategoryPrompt } from "@/lib/ai/prompts/phase-audit-shared";

const PERSONA = "أنت Database Architect بتعمل مراجعة عميقة لسلامة وبنية قاعدة البيانات قبل الإطلاق للإنتاج، مبنية على أدلة حقيقية 100% لمحور واحد بس.";

const CATEGORY_GUIDANCE: Record<DatabaseReviewCategoryKey, { title: string; focus: string }> = {
  database_structure: {
    title: "Database Structure Audit",
    focus: `راجع ملفات الـ Migrations وتعريفات الجداول: Tables, Relations, Foreign Keys, Indexes, Constraints, Unique Keys, Check Constraints, Cascade Rules, Nullable Fields, Normalization. أي جدول بعلاقة واضحة (اسم عمود بينتهي بـ _id مثلًا) من غير Foreign Key حقيقي، أو عمود لازم يكون Unique من غير Constraint، Finding حقيقي.`,
  },
  query: {
    title: "Query Audit",
    focus: `راجع كل الاستعلامات في الكود (استدعاءات .from()/.select()/.rpc() وغيرها): Query Efficiency, N+1 Queries (استعلام جوّه Loop), Missing Indexes (استعلام بيفلتر بعمود مالوش Index في الـ Migration), Large Joins, Duplicate Queries (نفس الاستعلام بيتكرر في أماكن قريبة), Over/Under Fetching (select("*") لما محتاج أعمدة معينة بس), Missing Pagination (جلب جدول كامل من غير limit), Full Table Scans.`,
  },
  migration: {
    title: "Migration Audit",
    focus: `راجع ملفات الـ Migrations نفسها: ترتيب التنفيذ (أرقام/تسلسل الملفات منطقي)، Rollback Safety، Idempotency (استخدام if not exists/or replace)، Naming Consistency، Data Safety (أي Migration بيحذف عمود أو جدول فيه بيانات من غير نسخ احتياطي أو خطوة ترحيل)، Constraint Integrity.`,
  },
  data_integrity: {
    title: "Data Integrity Audit",
    focus: `من خلال تحليل الـ Schema والـ Migrations وكود الكتابة على قاعدة البيانات: دوّر على مخاطر Orphan Records (سجلات بترجع لصف أب اتمسح)، Duplicate Records المحتملة (غياب Unique Constraint في مكان لازم يكون فيه)، Broken Relations، Invalid References، Nullable Misuse (عمود Nullable وهو المفروض إجباري منطقيًا)، Referential Integrity العامة.`,
  },
  storage: {
    title: "Storage Audit",
    focus: `لو المشروع بيستخدم Supabase Storage: راجع Bucket Policies، هل فيه Buckets عامة (Public) لازم تكون خاصة؟ Signed URLs مقابل Public URLs، File Permissions، Upload Validation (نوع/حجم الملف قبل الرفع)، Download Authorization (هل أي حد يقدر يحمّل ملف بس لو عنده الرابط، من غير التحقق من الصلاحية؟)، File Size Limits، Allowed MIME Types.`,
  },
  logging: {
    title: "Logging Audit",
    focus: `دوّر في كل استدعاءات console.log/logger عبر الكود على: تسجيل كلمات مرور، تسجيل Tokens أو Session Data، تسجيل Secrets، تسجيل بيانات مستخدمين حساسة (إيميلات، أرقام هواتف، بيانات دفع) في اللوج بشكل خام بدل Masking.`,
  },
};

export function buildDatabaseCategoryPrompt(
  categoryKey: DatabaseReviewCategoryKey,
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
    fileTree: categoryKey === "database_structure" ? fileTree : undefined,
    fileTreeLabel: "شجرة ملفات المشروع القابلة للمراجعة",
    isIncremental,
  });
}
