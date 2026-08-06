/**
 * حارس بسيط (Defense-in-Depth) بيمنع تخزين Secrets أو Production
 * Credentials فعلية داخل access_credentials_ref — العمود ده المفروض
 * يحتوي مرجع نصي بس (زي "see 1Password vault X"). ده تحقق نمطي
 * (Heuristic) مش ضمان أمني كامل.
 */

const SECRET_LIKE_PATTERNS: RegExp[] = [
  /sk-[a-zA-Z0-9]{10,}/,
  /AKIA[0-9A-Z]{16}/,
  /bearer\s+[a-zA-Z0-9\-_.]{15,}/i,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /password\s*[:=]\s*\S+/i,
  /\b[a-f0-9]{32,}\b/i,
  /\b[a-zA-Z0-9+/]{40,}={0,2}\b/,
];

export function validateAccessCredentialsRef(value: string | null | undefined): {
  ok: boolean;
  reason?: string;
} {
  if (!value || !value.trim()) return { ok: true };

  for (const pattern of SECRET_LIKE_PATTERNS) {
    if (pattern.test(value)) {
      return {
        ok: false,
        reason:
          "الحقل ده مخصص لمرجع نصي بس (زي \"see 1Password vault X\") — النص المُدخل يشبه Secret أو Credential فعلي، وممنوع تخزينه هنا.",
      };
    }
  }

  return { ok: true };
}
