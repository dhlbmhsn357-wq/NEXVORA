import type { MentionType } from "@/lib/types/database";

/**
 * تحليل المنشنز من نص الرسالة — وحدة نقية بدون I/O.
 * يدعم: @user (بالـ handle قبل الإيميل @) والمجموعات الخاصة:
 * @admins @managers @projectteam @department.
 */

export interface ParsedMention {
  type: MentionType;
  /** للـ user: الـ handle (الجزء قبل @ في الإيميل، أو الاسم بدون مسافات). للمجموعات: null. */
  handle: string | null;
}

const GROUP_TOKENS: Record<string, MentionType> = {
  admins: "admins",
  managers: "managers",
  projectteam: "project_team",
  department: "department",
};

/**
 * يستخرج كل المنشنز الفريدة من النص. المجموعات لها أولوية على مطابقة
 * الـ user (عشان @admins ما يتفسّرش كـ user اسمه admins).
 */
export function parseMentions(body: string): ParsedMention[] {
  const results: ParsedMention[] = [];
  const seen = new Set<string>();
  const regex = /@([a-zA-Z0-9._-]+)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(body)) !== null) {
    const token = match[1].toLowerCase();
    const group = GROUP_TOKENS[token];
    if (group) {
      const key = `group:${group}`;
      if (!seen.has(key)) {
        seen.add(key);
        results.push({ type: group, handle: null });
      }
    } else {
      const key = `user:${token}`;
      if (!seen.has(key)) {
        seen.add(key);
        results.push({ type: "user", handle: token });
      }
    }
  }
  return results;
}

/** الـ handle المشتق من الإيميل (الجزء قبل @) — للمطابقة مع @user. */
export function handleFromEmail(email: string | null): string | null {
  if (!email) return null;
  const local = email.split("@")[0];
  return local ? local.toLowerCase() : null;
}
