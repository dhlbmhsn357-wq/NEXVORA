"use server";

import { createClient } from "@/lib/supabase/server";
import {
  uploadDiscoveryFile,
  getDiscoveryFileUrl,
  HARD_MAX_UPLOAD_BYTES,
} from "@/lib/storage/discovery-uploads";
import type { DiscoveryUploadedFile } from "@/lib/types/database";

type UploadResult =
  | { ok: true; file: DiscoveryUploadedFile }
  | { ok: false; message: string };

/**
 * رفع ملف لسؤال اكتشاف من نوع رفع (file/logo/document). الرفع بحساب
 * المستخدم الداخلي المسجّل دخوله، مع تحقّق من النوع والحجم.
 */
export async function uploadDiscoveryFileAction(formData: FormData): Promise<UploadResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false, message: "غير مسجّل دخول." };

  const projectId = formData.get("projectId");
  const questionId = formData.get("questionId");
  const file = formData.get("file");
  const allowedRaw = formData.get("allowedTypes");
  const maxMbRaw = formData.get("maxMb");

  if (typeof projectId !== "string" || typeof questionId !== "string") {
    return { ok: false, message: "بيانات غير مكتملة." };
  }
  if (!(file instanceof File)) {
    return { ok: false, message: "لم يتم اختيار ملف." };
  }

  const allowed = typeof allowedRaw === "string" && allowedRaw
    ? allowedRaw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)
    : [];
  const maxMb = typeof maxMbRaw === "string" && maxMbRaw ? Number(maxMbRaw) : null;
  const maxBytes = Math.min(
    maxMb && maxMb > 0 ? maxMb * 1024 * 1024 : HARD_MAX_UPLOAD_BYTES,
    HARD_MAX_UPLOAD_BYTES
  );

  if (file.size > maxBytes) {
    return { ok: false, message: `حجم الملف أكبر من الحد المسموح (${Math.round(maxBytes / (1024 * 1024))} ميجا).` };
  }

  const ext = (file.name.split(".").pop() ?? "").toLowerCase();
  if (allowed.length > 0 && ext && !allowed.includes(ext)) {
    return { ok: false, message: `نوع الملف غير مسموح. المسموح: ${allowed.join("، ")}.` };
  }

  try {
    const buffer = await file.arrayBuffer();
    const path = await uploadDiscoveryFile(
      supabase,
      projectId,
      questionId,
      buffer,
      file.type,
      ext
    );
    return {
      ok: true,
      file: { path, name: file.name, size: file.size, type: file.type },
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "فشل رفع الملف." };
  }
}

/** ينشئ Signed URL مؤقت لتنزيل/عرض ملف مرفوع. */
export async function getDiscoveryFileUrlAction(
  path: string
): Promise<{ ok: true; url: string } | { ok: false }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false };

  const url = await getDiscoveryFileUrl(supabase, path);
  return url ? { ok: true, url } : { ok: false };
}
