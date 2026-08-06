/**
 * سياسة قوة كلمة المرور (Enterprise IAM) — وحدة نقية بدون I/O.
 * تُستخدم في: الإعداد الأول، إنشاء مستخدم، تغيير/استعادة كلمة المرور.
 */

export const PASSWORD_MIN_LENGTH = 10;

export interface PasswordPolicyResult {
  ok: boolean;
  /** أسباب الرفض بالعربي — فاضية لو ok. */
  issues: string[];
}

export function validatePasswordStrength(password: string): PasswordPolicyResult {
  const issues: string[] = [];
  if (password.length < PASSWORD_MIN_LENGTH) {
    issues.push(`كلمة المرور لازم تكون ${PASSWORD_MIN_LENGTH} أحرف على الأقل.`);
  }
  if (!/[a-z]/.test(password)) issues.push("لازم تحتوي على حرف صغير (a-z) على الأقل.");
  if (!/[A-Z]/.test(password)) issues.push("لازم تحتوي على حرف كبير (A-Z) على الأقل.");
  if (!/[0-9]/.test(password)) issues.push("لازم تحتوي على رقم واحد على الأقل.");
  if (/^\s|\s$/.test(password)) issues.push("ممنوع تبدأ أو تنتهي بمسافة.");
  return { ok: issues.length === 0, issues };
}
