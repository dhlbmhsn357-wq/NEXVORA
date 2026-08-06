/**
 * كتالوج مصادر البيانات المدعومة — **وحدة نقية بلا I/O**.
 *
 * المنصّة لا تعتمد على نوع نظام معيّن؛ الكتالوج pluggable: أي مصدر جديد
 * يُضاف هنا كصفّ بيانات، بلا تعديل schema أو منطق. كل مصدر يعرّف:
 * - `category`: عائلته (sql/nosql/file/api/system).
 * - `modes`: أوضاع الاتصال المدعومة له.
 * - `liveToday`: هل الاتصال الحيّ مفعَّل فعليًا في هذا الإصدار؟ (الأمانة
 *   المعمارية: الملفات ورفع الـSchema مفعَّلة؛ الاتصال الحيّ للقواعد
 *   معرَّف كواجهة ومؤجَّل لطبقة اتصال معزولة — لا نحتفظ بكلمات مرور إنتاج
 *   ونفتح اتصالات من الخادم بلا عزل).
 * - `fields`: حقول الـWizard المطلوبة لهذا المصدر.
 */

export type SourceCategory = "sql" | "nosql" | "file" | "api" | "spreadsheet" | "system";
export type ConnectionMode = "file_upload" | "schema_upload" | "live_connection";

export interface SourceField {
  key: string;
  label: string;
  /** حقل سرّي — يُشفَّر ولا يُعرَض/يُسجَّل. */
  secret?: boolean;
  required?: boolean;
  placeholder?: string;
}

export interface SourceTypeDef {
  key: string;
  label: string;
  category: SourceCategory;
  /** أوضاع الاتصال المدعومة، الأول = الافتراضي الموصى به. */
  modes: ConnectionMode[];
  /** هل الاتصال الحيّ المباشر مفعَّل اليوم؟ */
  liveToday: boolean;
  fields: SourceField[];
}

/** حقول اتصال قاعدة بيانات كلاسيكية (تُعاد استخدامها). */
const DB_FIELDS: SourceField[] = [
  { key: "host", label: "Host", required: true, placeholder: "db.example.com" },
  { key: "port", label: "Port" },
  { key: "database", label: "Database", required: true },
  { key: "username", label: "Username" },
  { key: "password", label: "Password", secret: true },
  { key: "ssl", label: "SSL" },
];

const API_FIELDS: SourceField[] = [
  { key: "base_url", label: "Base URL", required: true, placeholder: "https://api.example.com" },
  { key: "auth_type", label: "Authentication" },
  { key: "api_token", label: "API Token", secret: true },
];

/** ملف مرفوع — لا اتصال ولا اعتماد. */
const FILE_MODES: ConnectionMode[] = ["file_upload"];
/** قاعدة بيانات — الأأمن رفع الـSchema؛ الاتصال الحيّ مؤجَّل. */
const DB_MODES: ConnectionMode[] = ["schema_upload", "live_connection"];

export const SOURCE_TYPES: SourceTypeDef[] = [
  // --- قواعد SQL ---
  { key: "postgresql", label: "PostgreSQL", category: "sql", modes: DB_MODES, liveToday: false, fields: DB_FIELDS },
  { key: "mysql", label: "MySQL", category: "sql", modes: DB_MODES, liveToday: false, fields: DB_FIELDS },
  { key: "mariadb", label: "MariaDB", category: "sql", modes: DB_MODES, liveToday: false, fields: DB_FIELDS },
  { key: "sqlserver", label: "SQL Server", category: "sql", modes: DB_MODES, liveToday: false, fields: DB_FIELDS },
  { key: "oracle", label: "Oracle Database", category: "sql", modes: DB_MODES, liveToday: false, fields: DB_FIELDS },
  { key: "sqlite", label: "SQLite", category: "sql", modes: ["file_upload", "schema_upload"], liveToday: false, fields: [] },
  { key: "access", label: "Microsoft Access", category: "sql", modes: ["file_upload", "schema_upload"], liveToday: false, fields: [] },
  { key: "supabase", label: "Supabase", category: "sql", modes: DB_MODES, liveToday: false, fields: DB_FIELDS },

  // --- NoSQL ---
  { key: "mongodb", label: "MongoDB", category: "nosql", modes: DB_MODES, liveToday: false, fields: DB_FIELDS },
  { key: "firebase", label: "Firebase", category: "nosql", modes: ["schema_upload", "live_connection"], liveToday: false, fields: API_FIELDS },

  // --- ملفات ---
  { key: "csv", label: "CSV File", category: "file", modes: FILE_MODES, liveToday: true, fields: [] },
  { key: "excel", label: "Excel File", category: "spreadsheet", modes: FILE_MODES, liveToday: true, fields: [] },
  { key: "json", label: "JSON", category: "file", modes: FILE_MODES, liveToday: true, fields: [] },
  { key: "xml", label: "XML", category: "file", modes: FILE_MODES, liveToday: true, fields: [] },
  { key: "yaml", label: "YAML", category: "file", modes: FILE_MODES, liveToday: true, fields: [] },
  { key: "google_sheets", label: "Google Sheets", category: "spreadsheet", modes: ["live_connection", "file_upload"], liveToday: false, fields: API_FIELDS },

  // --- APIs ---
  { key: "rest_api", label: "REST API", category: "api", modes: ["live_connection"], liveToday: false, fields: API_FIELDS },
  { key: "graphql_api", label: "GraphQL API", category: "api", modes: ["live_connection"], liveToday: false, fields: API_FIELDS },

  // --- أنظمة ---
  { key: "erp", label: "ERP System", category: "system", modes: DB_MODES, liveToday: false, fields: DB_FIELDS },
  { key: "crm", label: "CRM System", category: "system", modes: DB_MODES, liveToday: false, fields: DB_FIELDS },
  { key: "accounting", label: "Accounting System", category: "system", modes: DB_MODES, liveToday: false, fields: DB_FIELDS },
  { key: "hr", label: "HR System", category: "system", modes: DB_MODES, liveToday: false, fields: DB_FIELDS },
  { key: "hospital", label: "Hospital System", category: "system", modes: DB_MODES, liveToday: false, fields: DB_FIELDS },
  { key: "school", label: "School System", category: "system", modes: DB_MODES, liveToday: false, fields: DB_FIELDS },
  { key: "legacy", label: "Legacy System", category: "system", modes: DB_MODES, liveToday: false, fields: DB_FIELDS },
  { key: "custom_db", label: "Custom Database", category: "system", modes: DB_MODES, liveToday: false, fields: DB_FIELDS },
  { key: "paper_template", label: "Paper Import Template", category: "file", modes: FILE_MODES, liveToday: true, fields: [] },

  // --- عام (fallback لأي مصدر مستقبلي) ---
  { key: "generic", label: "Generic / Other", category: "file", modes: ["schema_upload", "file_upload"], liveToday: true, fields: [] },
];

const BY_KEY = new Map(SOURCE_TYPES.map((s) => [s.key, s]));

export function getSourceType(key: string): SourceTypeDef | undefined {
  return BY_KEY.get(key);
}

export function sourceTypeLabel(key: string): string {
  return BY_KEY.get(key)?.label ?? key;
}

/** هل هذا الوضع مدعوم لهذا النوع؟ */
export function isModeSupported(sourceKey: string, mode: ConnectionMode): boolean {
  const def = BY_KEY.get(sourceKey);
  return def ? def.modes.includes(mode) : false;
}

/**
 * هل الاتصال قابل للتنفيذ فعليًا الآن؟ الملفات ورفع الـSchema دائمًا نعم؛
 * الاتصال الحيّ فقط لو النوع `liveToday` (لا شيء منها بعد — مؤجَّل بأمان).
 */
export function isExecutableNow(sourceKey: string, mode: ConnectionMode): boolean {
  if (mode === "file_upload" || mode === "schema_upload") return true;
  const def = BY_KEY.get(sourceKey);
  return def?.liveToday ?? false;
}

/** الحقول السرّية لنوع — لتحديد ما يُشفَّر. */
export function secretFieldKeys(sourceKey: string): string[] {
  const def = BY_KEY.get(sourceKey);
  return (def?.fields ?? []).filter((f) => f.secret).map((f) => f.key);
}
