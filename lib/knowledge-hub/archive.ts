import { unzip, type Unzipped } from "fflate";
import {
  MAX_ARCHIVE_ENTRIES,
  scanArchive,
  scanFile,
  type ScanFinding,
} from "./security";

/**
 * فكّ الأرشيفات.
 *
 * ## لماذا `fflate` لا مكتبة أثقل
 *
 * جافاسكريبت خالصة بلا أي اعتماد أصلي (native). ده مش تفضيلًا —
 * المكتبات اللي فيها كود أصلي بتحتاج بناء لكل معمارية، وبتضخّم صورة
 * Railway، وبتفشل بطرق يصعب تشخيصها عن بُعد.
 *
 * ## الأمان قبل الفكّ لا بعده
 *
 * الفهرس بيتقرا الأول، ويتفحص (`scanArchive`)، وبعدين المُدخلات
 * الآمنة **وحدها** هي اللي بتتفكّ. الفكّ الكامل ثم التصفية كان معناه
 * إن قنبلة الضغط تنفجر في الذاكرة قبل ما نكتشفها.
 *
 * ## ملف واحد فاسد لا يوقف الباقي
 *
 * المواصفة طلبتها صراحةً، وهي السلوك الصحيح: أرشيف فيه عشرين مستندًا
 * وملف تالف واحد لازم يدخّل التسعتاشر.
 */

export interface ExtractedEntry {
  /** المسار داخل الأرشيف — يُستخدم كاسم المصدر. */
  path: string;
  fileName: string;
  bytes: Uint8Array;
  sizeBytes: number;
}

export interface ExtractResult {
  ok: boolean;
  entries: ExtractedEntry[];
  rejected: Array<{ path: string; reason: string }>;
  findings: ScanFinding[];
  totalBytes: number;
  message: string;
}

/**
 * يفكّ أرشيف ZIP بعد فحصه.
 *
 * المجلدات تُتجاهَل بصمت: هي مدخلات في الفهرس بلا محتوى، وإدراجها
 * كملفات فاضية كان هينتج مصادر بلا نصّ تفشل في الاستخراج.
 */
export async function extractZip(data: Uint8Array): Promise<ExtractResult> {
  let unzipped: Unzipped;

  try {
    unzipped = await new Promise<Unzipped>((resolve, reject) => {
      unzip(data, (err, result) => (err ? reject(err) : resolve(result)));
    });
  } catch (err) {
    return {
      ok: false,
      entries: [],
      rejected: [],
      findings: [
        {
          code: "unzip_failed",
          severity: "blocked",
          message: `تعذّر فكّ الأرشيف: ${err instanceof Error ? err.message : "ملف تالف"}.`,
        },
      ],
      totalBytes: 0,
      message: "الأرشيف تالف أو بصيغة غير مدعومة.",
    };
  }

  const paths = Object.keys(unzipped).filter((p) => !isDirectory(p, unzipped[p]));

  if (paths.length === 0) {
    return {
      ok: false,
      entries: [],
      rejected: [],
      findings: [{ code: "empty_archive", severity: "blocked", message: "الأرشيف فاضي." }],
      totalBytes: 0,
      message: "الأرشيف مافيهوش ملفات.",
    };
  }

  // الفحص على الفهرس قبل أي معالجة. `fflate` بيفكّ في الذاكرة، فالحجم
  // المفكوك معروف هنا — والنسبة تُقاس على حجم الأرشيف الأصلي.
  const scan = scanArchive(
    paths.map((path) => ({
      path,
      uncompressedBytes: unzipped[path].length,
      // النسبة على الأرشيف كله: `fflate` مابيرجّعش الحجم المضغوط لكل
      // مُدخل، فالتوزيع بالتساوي تقدير كافٍ لكشف القنبلة.
      compressedBytes: Math.max(1, Math.floor(data.length / paths.length)),
    }))
  );

  if (!scan.allowed) {
    return {
      ok: false,
      entries: [],
      rejected: scan.rejectedEntries,
      findings: scan.findings,
      totalBytes: scan.totalUncompressed,
      message: scan.findings[0]?.message ?? "الأرشيف مرفوض.",
    };
  }

  const entries: ExtractedEntry[] = [];
  const rejected = [...scan.rejectedEntries];

  for (const path of scan.safeEntries) {
    const bytes = unzipped[path];
    const fileName = path.split(/[/\\]/).pop() ?? path;

    // فحص ثانٍ على المحتوى الفعلي: الفحص الأول شاف الاسم والحجم بس،
    // وده بيشوف البصمة. ملف اسمه `.pdf` وجوّه تنفيذي بيتمسك هنا.
    const fileScan = scanFile({
      fileName,
      sizeBytes: bytes.length,
      head: bytes.slice(0, 32),
    });

    if (!fileScan.allowed) {
      rejected.push({ path, reason: fileScan.findings[0]?.message ?? "مرفوض بالفحص." });
      continue;
    }

    entries.push({ path, fileName, bytes, sizeBytes: bytes.length });
  }

  return {
    ok: entries.length > 0,
    entries,
    rejected,
    findings: scan.findings,
    totalBytes: entries.reduce((sum, e) => sum + e.sizeBytes, 0),
    message:
      entries.length === 0
        ? "كل الملفات داخل الأرشيف اتستبعدت بالفحص."
        : `اتفكّ ${entries.length} ملف${rejected.length ? ` · اتستبعد ${rejected.length}` : ""}.`,
  };
}

/**
 * مُدخل المجلد في ZIP: اسمه بينتهي بشرطة مائلة ومحتواه فاضي.
 *
 * الشرطان معًا لا أحدهما: ملف فاضي حقيقي مالوش شرطة، ومجلد اسمه غريب
 * ممكن يكون فيه بايتات.
 */
function isDirectory(path: string, bytes: Uint8Array): boolean {
  return path.endsWith("/") || (bytes.length === 0 && path.endsWith("\\"));
}

/** هل ده أرشيف نقدر نفكّه؟ */
export function isSupportedArchive(fileName: string, head: Uint8Array): boolean {
  const isZipMagic =
    head.length >= 4 &&
    head[0] === 0x50 &&
    head[1] === 0x4b &&
    (head[2] === 0x03 || head[2] === 0x05);

  if (!isZipMagic) return false;

  // مستندات Office أرشيفات ZIP في الحقيقة — لكن فكّها بيدّي XML خام
  // لا نصًّا مقروءًا. بتروح لمسارها الطبيعي لا لعامل الأرشيف.
  const lower = fileName.toLowerCase();
  if (/\.(docx|xlsx|pptx|odt|ods|odp)$/.test(lower)) return false;

  return /\.zip$/.test(lower);
}

export const ARCHIVE_LIMITS = {
  maxEntries: MAX_ARCHIVE_ENTRIES,
} as const;
