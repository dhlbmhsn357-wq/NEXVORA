"use client";

import { useEffect, useState } from "react";
import { getSupportAttachmentSignedUrl } from "./support-actions";

/**
 * يجيب Signed URL مؤقت لصورة مرفقة في محادثة دعم — صفر رابط عام
 * دائم، الرابط بيتولّد وقت العرض بس ولمدة قصيرة.
 */
export default function SupportAttachmentImage({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getSupportAttachmentSignedUrl(path).then((signedUrl) => {
      if (cancelled) return;
      if (signedUrl) setUrl(signedUrl);
      else setFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [path]);

  if (failed) return <p className="text-[10px] text-[var(--v-red)]">تعذّر تحميل المرفق</p>;
  if (!url) return <div className="h-16 w-16 animate-pulse rounded-[var(--v-radius-md)] bg-[var(--v-surface)]" />;

  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="مرفق" className="max-h-48 rounded-[var(--v-radius-md)] border border-[var(--v-border)] object-cover" />;
}
