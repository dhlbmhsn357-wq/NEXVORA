/**
 * Prototype Studio — Client-side Export helpers
 * =============================================
 * تنزيل Markdown كملف عبر Blob + anchor (نفس نمط prototype-prompt).
 * لا يحتوي أي طلب شبكة أو Server call.
 */

export function downloadMarkdown(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
