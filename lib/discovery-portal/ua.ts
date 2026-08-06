/**
 * Parser صغير جدًا لنوع الجهاز والمتصفح من User-Agent — بدون مكتبات.
 * يكفي للـ analytics غير الحرجة (Insight فقط، مش لصنع قرارات).
 */

export interface ParsedUA {
  device: string; // "Mobile" | "Tablet" | "Desktop"
  browser: string; // "Chrome" | "Safari" | ...
}

export function parseUserAgent(ua: string | null | undefined): ParsedUA {
  if (!ua) return { device: "Unknown", browser: "Unknown" };
  const s = ua.toLowerCase();

  const device =
    /ipad|tablet/.test(s)
      ? "Tablet"
      : /android|iphone|mobile/.test(s)
        ? "Mobile"
        : "Desktop";

  let browser = "Unknown";
  if (/edg\//.test(s)) browser = "Edge";
  else if (/opr\/|opera/.test(s)) browser = "Opera";
  else if (/chrome\//.test(s) && !/edg\//.test(s)) browser = "Chrome";
  else if (/firefox\//.test(s)) browser = "Firefox";
  else if (/safari\//.test(s)) browser = "Safari";

  return { device, browser };
}
