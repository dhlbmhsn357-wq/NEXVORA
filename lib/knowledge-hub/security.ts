/**
 * فحص أمان الملفات — **وحدة نقية بلا أي I/O**.
 *
 * ## ما هذا وما ليس هذا
 *
 * ده **مش مضاد فيروسات**. الفحص الحقيقي محتاج محرّك توقيعات (ClamAV
 * أو خدمة خارجية)، وادّعاء إنه موجود وهو مش موجود أخطر من غيابه —
 * لأنه بيدّي طمأنينة كاذبة.
 *
 * اللي هنا **حواجز بنيوية** بتمنع فئات هجوم حقيقية وقابلة للتنفيذ
 * بالكامل بلا أي اعتماد خارجي:
 *
 *   ١. **الامتداد الكاذب** — ملف `.pdf` أوله `MZ` (تنفيذي ويندوز)
 *   ٢. **الأنواع القابلة للتنفيذ** — مرفوضة بالاسم مهما كان محتواها
 *   ٣. **انفجار فكّ الضغط** — أرشيف ٢ ميجا يفكّ لعشرين جيجا
 *   ٤. **انزلاق المسار** — مُدخل ZIP اسمه `../../etc/passwd`
 *   ٥. **الحجم** — سقف صريح قبل أي معالجة
 *
 * الحواجز دي بتغطّي اللي بيحصل فعلًا في رفع الملفات. والفحص بالتوقيعات
 * لما يتضاف بيتحطّ جنبها لا بدلها.
 */

// ============================================================
// البصمات الثنائية
// ============================================================

/**
 * البصمات (magic bytes) لأشهر الأنواع.
 *
 * الامتداد بيقوله المستخدم، والبصمة بيقولها الملف. لما يختلفوا،
 * **البصمة هي الصادقة** — لأن تغيير الامتداد ضغطة زرار، وتغيير أول
 * بايتات في ملف صالح بيكسره.
 */
const SIGNATURES: Array<{ magic: number[]; type: string; label: string }> = [
  { magic: [0x25, 0x50, 0x44, 0x46], type: "pdf", label: "PDF" },
  // ZIP وكل مشتقّاته: docx · xlsx · pptx · jar · apk
  { magic: [0x50, 0x4b, 0x03, 0x04], type: "zip", label: "أرشيف مضغوط" },
  { magic: [0x50, 0x4b, 0x05, 0x06], type: "zip", label: "أرشيف مضغوط فارغ" },
  { magic: [0xff, 0xd8, 0xff], type: "jpeg", label: "صورة JPEG" },
  { magic: [0x89, 0x50, 0x4e, 0x47], type: "png", label: "صورة PNG" },
  { magic: [0x47, 0x49, 0x46, 0x38], type: "gif", label: "صورة GIF" },
  { magic: [0x52, 0x49, 0x46, 0x46], type: "riff", label: "وسائط RIFF" },
  { magic: [0x1f, 0x8b], type: "gzip", label: "أرشيف gzip" },
  { magic: [0x37, 0x7a, 0xbc, 0xaf], type: "7z", label: "أرشيف 7z" },
  { magic: [0x52, 0x61, 0x72, 0x21], type: "rar", label: "أرشيف RAR" },
  // مستندات Office القديمة (OLE)
  { magic: [0xd0, 0xcf, 0x11, 0xe0], type: "ole", label: "مستند Office قديم" },

  // ---- تنفيذيّات: وجودها وحده سبب رفض ----
  { magic: [0x4d, 0x5a], type: "exe", label: "تنفيذي ويندوز" },
  { magic: [0x7f, 0x45, 0x4c, 0x46], type: "elf", label: "تنفيذي لينكس" },
  { magic: [0xca, 0xfe, 0xba, 0xbe], type: "macho", label: "تنفيذي macOS" },
  { magic: [0xfe, 0xed, 0xfa, 0xce], type: "macho", label: "تنفيذي macOS" },
];

/** الأنواع التي يُرفض محتواها مهما كان امتدادها. */
const EXECUTABLE_TYPES = new Set(["exe", "elf", "macho"]);

/**
 * الامتدادات المرفوضة بالاسم.
 *
 * القائمة **حظر لا سماح**: قائمة السماح كانت هتمنع أنواعًا مشروعة
 * كتير مالهاش حصر. والحظر هنا بيغطّي اللي بيتنفّذ فعلًا على أنظمة
 * التشغيل الشائعة.
 */
const BLOCKED_EXTENSIONS = new Set([
  "exe", "dll", "so", "dylib", "bin", "msi", "app", "deb", "rpm",
  "bat", "cmd", "com", "scr", "pif", "vbs", "vbe", "js", "jse",
  "ws", "wsf", "wsh", "ps1", "psm1", "sh", "bash", "zsh",
  "jar", "apk", "ipa", "reg", "hta", "cpl", "lnk",
]);

/** الحد الأقصى لحجم ملف واحد. */
export const MAX_FILE_BYTES = 100 * 1024 * 1024; // ١٠٠ ميجا
/** الحد الأقصى للمحتوى المفكوك من أرشيف واحد. */
export const MAX_EXPANDED_BYTES = 500 * 1024 * 1024; // ٥٠٠ ميجا
/** أقصى نسبة تمدّد مسموحة — أعلى منها = قنبلة ضغط. */
export const MAX_COMPRESSION_RATIO = 200;
/** أقصى عدد ملفات داخل أرشيف. */
export const MAX_ARCHIVE_ENTRIES = 500;

// ============================================================
// النتيجة
// ============================================================

export type ScanSeverity = "blocked" | "warning" | "clean";

export interface ScanFinding {
  code: string;
  severity: "blocked" | "warning";
  message: string;
}

export interface ScanResult {
  severity: ScanSeverity;
  /** هل يُسمح بالمتابعة؟ `blocked` فقط هي التي تمنع. */
  allowed: boolean;
  detectedType: string | null;
  detectedLabel: string | null;
  findings: ScanFinding[];
}

// ============================================================
// الفحص
// ============================================================

/**
 * يفحص ملفًا قبل معالجته.
 *
 * @param head أول بايتات الملف (٣٢ بايت تكفي لكل البصمات المعروفة).
 *             تمرير الملف كله مش لازم — والقراءة الجزئية أرخص بكتير
 *             على ملف مئة ميجا.
 */
export function scanFile(input: {
  fileName: string;
  sizeBytes: number;
  head: Uint8Array;
  declaredMime?: string | null;
}): ScanResult {
  const findings: ScanFinding[] = [];
  const ext = extensionOf(input.fileName);
  const detected = detectType(input.head);

  // ---------- الحجم ----------
  if (input.sizeBytes > MAX_FILE_BYTES) {
    findings.push({
      code: "size_exceeded",
      severity: "blocked",
      message: `الحجم ${mb(input.sizeBytes)} ميجا يتجاوز الحد (${mb(MAX_FILE_BYTES)} ميجا).`,
    });
  }

  if (input.sizeBytes === 0) {
    findings.push({
      code: "empty_file",
      severity: "blocked",
      message: "الملف فاضي — مافيش محتوى للتحليل.",
    });
  }

  // ---------- الامتداد المحظور ----------
  if (BLOCKED_EXTENSIONS.has(ext)) {
    findings.push({
      code: "blocked_extension",
      severity: "blocked",
      message: `الامتداد «${ext}» قابل للتنفيذ — مرفوض بالاسم مهما كان محتواه.`,
    });
  }

  // ---------- محتوى تنفيذي ----------
  if (detected && EXECUTABLE_TYPES.has(detected.type)) {
    findings.push({
      code: "executable_content",
      severity: "blocked",
      message: `المحتوى ${detected.label} — الملف تنفيذي مهما كان امتداده.`,
    });
  }

  // ---------- تعارض الامتداد مع البصمة ----------
  //
  // ده أهم فحص هنا: الامتداد بيقوله المستخدم والبصمة بيقولها الملف.
  // ملف اسمه `report.pdf` وأوله بصمة تنفيذي = محاولة تمويه صريحة.
  if (detected && ext) {
    const expected = EXPECTED_TYPES[ext];
    if (expected && !expected.includes(detected.type)) {
      findings.push({
        code: "extension_mismatch",
        severity: EXECUTABLE_TYPES.has(detected.type) ? "blocked" : "warning",
        message: `الامتداد «${ext}» لكن المحتوى ${detected.label} — تعارض يستحق الانتباه.`,
      });
    }
  }

  // ---------- امتداد مزدوج ----------
  //
  // `invoice.pdf.exe` بيبان في ويندوز باسم `invoice.pdf` لو الامتدادات
  // مخفية. الحيلة قديمة ولسه شغّالة.
  const parts = input.fileName.toLowerCase().split(".");
  if (parts.length > 2) {
    const inner = parts[parts.length - 2];
    if (["pdf", "doc", "docx", "xls", "xlsx", "jpg", "png", "txt"].includes(inner)) {
      findings.push({
        code: "double_extension",
        severity: BLOCKED_EXTENSIONS.has(ext) ? "blocked" : "warning",
        message: `امتداد مزدوج «${inner}.${ext}» — أسلوب تمويه شائع.`,
      });
    }
  }

  const blocked = findings.some((f) => f.severity === "blocked");

  return {
    severity: blocked ? "blocked" : findings.length > 0 ? "warning" : "clean",
    allowed: !blocked,
    detectedType: detected?.type ?? null,
    detectedLabel: detected?.label ?? null,
    findings,
  };
}

/** الأنواع المتوقَّعة لكل امتداد — أساس كشف التعارض. */
const EXPECTED_TYPES: Record<string, string[]> = {
  pdf: ["pdf"],
  zip: ["zip"],
  docx: ["zip"],
  xlsx: ["zip"],
  pptx: ["zip"],
  doc: ["ole"],
  xls: ["ole"],
  ppt: ["ole"],
  jpg: ["jpeg"],
  jpeg: ["jpeg"],
  png: ["png"],
  gif: ["gif"],
  wav: ["riff"],
  webp: ["riff"],
  avi: ["riff"],
  gz: ["gzip"],
  "7z": ["7z"],
  rar: ["rar"],
};

export function detectType(
  head: Uint8Array
): { type: string; label: string } | null {
  for (const sig of SIGNATURES) {
    if (head.length < sig.magic.length) continue;
    let match = true;
    for (let i = 0; i < sig.magic.length; i++) {
      if (head[i] !== sig.magic[i]) {
        match = false;
        break;
      }
    }
    if (match) return { type: sig.type, label: sig.label };
  }
  return null;
}

// ============================================================
// أمان الأرشيفات
// ============================================================

export interface ArchiveEntryCheck {
  path: string;
  compressedBytes: number;
  uncompressedBytes: number;
}

export interface ArchiveScanResult {
  allowed: boolean;
  findings: ScanFinding[];
  /** المُدخلات التي اجتازت الفحص — الباقي يُستبعَد لا يوقف الأرشيف. */
  safeEntries: string[];
  rejectedEntries: Array<{ path: string; reason: string }>;
  totalUncompressed: number;
}

/**
 * يفحص محتويات أرشيف قبل فكّه.
 *
 * ## ثلاثة أخطار حقيقية
 *
 * **انزلاق المسار (Zip Slip):** مُدخل اسمه `../../etc/passwd` بيكتب
 * خارج المجلد المستهدف. إحنا مابنكتبش على القرص أصلًا، لكن الفحص
 * موجود لأن الاسم بيتخزّن ويُعرَض — والمسار الخبيث بيسافر معاه.
 *
 * **قنبلة الضغط:** ملف ٤٢ كيلو بيفكّ لـ٤.٥ بيتابايت (zip bomb
 * الشهير). النسبة هي الكاشف: محتوى حقيقي نادرًا ما يتعدّى ١٠٠:١.
 *
 * **الإغراق بالعدد:** أرشيف فيه مليون ملف فاضي بيستهلك الذاكرة في
 * الفهرسة وحدها.
 *
 * **الملف الواحد الخبيث لا يُسقط الأرشيف كله**: يُستبعَد ويكمّل الباقي
 * — نفس مبدأ «فشل ملف واحد لا يوقف البقية» في المواصفة.
 */
export function scanArchive(entries: ArchiveEntryCheck[]): ArchiveScanResult {
  const findings: ScanFinding[] = [];
  const safeEntries: string[] = [];
  const rejectedEntries: Array<{ path: string; reason: string }> = [];

  if (entries.length > MAX_ARCHIVE_ENTRIES) {
    findings.push({
      code: "too_many_entries",
      severity: "blocked",
      message: `الأرشيف فيه ${entries.length} ملف — الحد ${MAX_ARCHIVE_ENTRIES}.`,
    });
  }

  let totalUncompressed = 0;
  let totalCompressed = 0;

  for (const entry of entries) {
    totalUncompressed += entry.uncompressedBytes;
    totalCompressed += entry.compressedBytes;

    const pathIssue = unsafePathReason(entry.path);
    if (pathIssue) {
      rejectedEntries.push({ path: entry.path, reason: pathIssue });
      continue;
    }

    const ext = extensionOf(entry.path);
    if (BLOCKED_EXTENSIONS.has(ext)) {
      rejectedEntries.push({ path: entry.path, reason: `امتداد قابل للتنفيذ «${ext}».` });
      continue;
    }

    if (entry.uncompressedBytes > MAX_FILE_BYTES) {
      rejectedEntries.push({
        path: entry.path,
        reason: `الحجم ${mb(entry.uncompressedBytes)} ميجا يتجاوز حد الملف الواحد.`,
      });
      continue;
    }

    safeEntries.push(entry.path);
  }

  if (totalUncompressed > MAX_EXPANDED_BYTES) {
    findings.push({
      code: "expanded_size_exceeded",
      severity: "blocked",
      message: `المحتوى المفكوك ${mb(totalUncompressed)} ميجا يتجاوز الحد (${mb(MAX_EXPANDED_BYTES)} ميجا).`,
    });
  }

  // النسبة تُحسب على الأرشيف كله لا على مُدخل واحد: ملف نصّي صغير
  // بيتضغط بنسبة عالية جدًا وهو بريء تمامًا.
  if (totalCompressed > 0) {
    const ratio = totalUncompressed / totalCompressed;
    if (ratio > MAX_COMPRESSION_RATIO) {
      findings.push({
        code: "compression_bomb",
        severity: "blocked",
        message: `نسبة التمدّد ${Math.round(ratio)}:١ تتجاوز الحد (${MAX_COMPRESSION_RATIO}:١) — قنبلة ضغط محتملة.`,
      });
    }
  }

  if (rejectedEntries.length > 0) {
    findings.push({
      code: "entries_rejected",
      severity: "warning",
      message: `${rejectedEntries.length} ملف داخل الأرشيف اتستبعد.`,
    });
  }

  const blocked = findings.some((f) => f.severity === "blocked");

  return {
    allowed: !blocked && safeEntries.length > 0,
    findings,
    safeEntries: blocked ? [] : safeEntries,
    rejectedEntries,
    totalUncompressed,
  };
}

/**
 * يرجّع سبب رفض المسار، أو `null` لو آمن.
 *
 * الفحص على النصّ الخام **قبل** أي تطبيع: التطبيع نفسه ممكن يخفي
 * الهجوم (`..%2f..` بيتفكّ لـ`../..`).
 */
export function unsafePathReason(path: string): string | null {
  if (!path || path.trim().length === 0) return "مسار فاضي.";
  if (path.includes("\0")) return "المسار فيه بايت صفري.";
  if (path.startsWith("/") || path.startsWith("\\")) return "مسار مطلق.";
  if (/^[a-zA-Z]:/.test(path)) return "مسار مطلق بحرف قرص.";

  const segments = path.split(/[/\\]/);
  if (segments.includes("..")) return "المسار بيخرج من المجلد المستهدف.";

  // الترميز المزدوج: محاولة تخطّي الفحص بترميز النقطتين.
  if (/%2e%2e|%2f|%5c/i.test(path)) return "المسار فيه ترميز مشبوه.";

  return null;
}

// ============================================================
// أدوات
// ============================================================

export function extensionOf(fileName: string): string {
  const clean = fileName.split(/[?#]/)[0].trim().toLowerCase();
  const dot = clean.lastIndexOf(".");
  if (dot === -1 || dot === clean.length - 1) return "";
  return clean.slice(dot + 1);
}

function mb(bytes: number): number {
  return Math.round(bytes / (1024 * 1024));
}

/** ملخّص عربي للعرض في الواجهة. */
export function describeScan(result: ScanResult): string {
  if (result.severity === "clean") return "الملف اجتاز الفحص.";
  const first = result.findings[0];
  return result.allowed
    ? `تحذير: ${first?.message ?? "ملاحظة على الملف."}`
    : `مرفوض: ${first?.message ?? "الملف مش آمن."}`;
}
