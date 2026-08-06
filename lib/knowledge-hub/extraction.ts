import type { SupabaseClient } from "@supabase/supabase-js";
import { classifyFile, isExtractable, unsupportedReason, type FileTypeInfo } from "./file-types";

/**
 * استخراج النص من مصدر معرفة واحد.
 *
 * بيعيد استخدام نفس المسارات المثبتة في تحليل مرفقات الاجتماعات:
 * mammoth للـ DOCX، وإرسال الملف نفسه للنموذج للـ PDF والوسائط، وقراءة
 * مباشرة للنص. اللي جديد هنا إن الناتج بيرجع كنص خام عشان يتقطّع ويتصنّف
 * بعد كده، مش كتحليل نهائي.
 */

export const KNOWLEDGE_BUCKET = "knowledge";

/** حد النص المستخرج المخزّن لكل مصدر — حماية من ملفات ضخمة تكسّر التصنيف. */
export const MAX_EXTRACTED_CHARS = 400_000;

export interface ExtractionResult {
  /** النص المستخرج (فاضي لو الملف بيتقرأ بالنموذج مباشرةً). */
  text: string;
  /** لو الملف لازم يتبعت للنموذج نفسه بدل ما يتحوّل لنص. */
  media?: { mimeType: string; data: string };
  info: FileTypeInfo;
  truncated: boolean;
}

export type ExtractionOutcome =
  | { ok: true; result: ExtractionResult }
  | { ok: false; reason: string; skippable: boolean };

/** مسار تخزين ملف المعرفة داخل الـ bucket. */
export function knowledgeFilePath(projectId: string, sourceId: string, fileName: string): string {
  // تنظيف الاسم: التخزين بيرفض بعض الرموز، والاسم العربي بيتحوّل لترميز
  // مزعج في الـ URL. الاسم الأصلي محفوظ في صف المصدر على أي حال.
  const ext = fileName.includes(".") ? fileName.slice(fileName.lastIndexOf(".")) : "";
  return `${projectId}/${sourceId}${ext.toLowerCase()}`;
}

/** تجزئة محتوى الملف — الأساس اللي بيمنع إعادة تحليل نفس الملف. */
export async function hashBytes(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function decodeText(buffer: ArrayBuffer): string {
  // utf-8 مع fatal=false: الملفات المهنية أحيانًا بترميز قديم، والتساهل
  // هنا أحسن من رفض الملف بالكامل بسبب حرف واحد تالف.
  return new TextDecoder("utf-8", { fatal: false }).decode(buffer);
}

/**
 * يستخرج المحتوى من ملف مخزّن. بيرجّع `skippable: true` للأنواع اللي
 * بنحفظها كمرجع من غير تحليل (أرشيف / غير مدعوم) — دي مش أخطاء، فالمصدر
 * بيتعلّم `skipped` مش `failed`.
 */
export async function extractFromStorage(
  supabase: SupabaseClient,
  storagePath: string,
  fileName: string,
  mimeType: string | null
): Promise<ExtractionOutcome> {
  const info = classifyFile(fileName, mimeType);

  if (!isExtractable(info)) {
    return {
      ok: false,
      reason: unsupportedReason(info) ?? "نوع غير مدعوم للاستخراج.",
      skippable: true,
    };
  }

  const { data: blob, error } = await supabase.storage.from(KNOWLEDGE_BUCKET).download(storagePath);
  if (error || !blob) {
    return {
      ok: false,
      reason: error?.message ?? "تعذّر تحميل الملف من التخزين.",
      skippable: false,
    };
  }

  const buffer = await blob.arrayBuffer();

  try {
    if (info.method === "ai_native") {
      return {
        ok: true,
        result: {
          text: "",
          media: {
            mimeType: mimeType && mimeType !== "application/octet-stream" ? mimeType : guessMime(fileName),
            data: Buffer.from(buffer).toString("base64"),
          },
          info,
          truncated: false,
        },
      };
    }

    if (info.method === "docx") {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer: Buffer.from(buffer) });
      let text = result.value;
      // احتياطي: بعض ملفات docx يرجّع mammoth منها نصًّا فارغًا رغم وجود
      // محتوى — نقرأ document.xml مباشرةً بدل ما نعلن «بلا نص» بالغلط.
      if (text.trim().length === 0) {
        const { extractDocxXmlFallback } = await import("./office-extract");
        text = await extractDocxXmlFallback(Buffer.from(buffer));
      }
      return { ok: true, result: capped(text, info) };
    }

    if (info.method === "xlsx") {
      const { extractXlsxText } = await import("./office-extract");
      return { ok: true, result: capped(await extractXlsxText(Buffer.from(buffer)), info) };
    }

    return { ok: true, result: capped(decodeText(buffer), info) };
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : "فشل استخراج محتوى الملف.",
      skippable: false,
    };
  }
}

function capped(text: string, info: FileTypeInfo): ExtractionResult {
  const truncated = text.length > MAX_EXTRACTED_CHARS;
  return {
    text: truncated ? text.slice(0, MAX_EXTRACTED_CHARS) : text,
    info,
    truncated,
  };
}

/** استخراج من نص ملصوق مباشرةً — مافيش تحميل ولا فك. */
export function extractFromPastedText(text: string): ExtractionResult {
  return capped(text, { method: "text", label: "نص ملصوق", group: "documents" });
}

const MIME_BY_EXT: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  m4a: "audio/mp4",
  ogg: "audio/ogg",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
};

/**
 * المتصفح بيرجّع `application/octet-stream` لملفات كتير، والنموذج بيرفض
 * الـ MIME ده. الاستنتاج من الامتداد هنا هو اللي بيخلّي الـ PDF والصور
 * تتقرأ فعلًا بدل ما ترجع خطأ نوع غير مدعوم من مزوّد الذكاء الاصطناعي.
 */
function guessMime(fileName: string): string {
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  return MIME_BY_EXT[ext] ?? "application/octet-stream";
}
