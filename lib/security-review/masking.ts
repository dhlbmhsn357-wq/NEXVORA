/**
 * إخفاء أي قيمة شكلها سرّ (API Key, Token, JWT, Connection String) داخل
 * أي نص قبل أي تخزين أو عرض — إجباري لكل Finding في محوري Security
 * وDatabase (مش بس محور "secrets")، لأن أي محور تاني ممكن يقتبس Snippet
 * فيه سر بالصدفة. النمط ده Best-Effort (مش ضمان مطلق) — بيغطي الأشكال
 * الشائعة الأكتر شيوعًا لمفاتيح الخدمات اللي المشروع ده بيستخدمها فعليًا
 * (Supabase, Gemini, GitHub, Stripe-style) + JWTs + Connection Strings +
 * أي سلسلة عشوائية طويلة تبدو كمفتاح (Base64/Hex عالي الإنتروبيا).
 */

const SECRET_PATTERNS: RegExp[] = [
  // Postgres/Supabase connection strings (بتحمل يوزر:باسورد داخل الرابط نفسه)
  /postgres(?:ql)?:\/\/[^\s'"]+:[^\s'"@]+@[^\s'"]+/gi,
  // JWT (ثلاث أجزاء Base64URL مفصولة بنقطة)
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
  // مفاتيح شائعة ببادئة معروفة (Gemini/Google، GitHub، Stripe-style، Slack، AWS)
  /\b(?:AIza[0-9A-Za-z_-]{20,}|ghp_[0-9A-Za-z]{20,}|gho_[0-9A-Za-z]{20,}|sk-[0-9A-Za-z]{20,}|xox[baprs]-[0-9A-Za-z-]{10,}|AKIA[0-9A-Z]{16})\b/g,
  // Generic API_KEY="..." / SECRET=... / TOKEN: '...' في نفس السطر
  /\b((?:api|secret|access|private)[_-]?(?:key|token|secret)s?\s*[:=]\s*["'])([^"'\s]{8,})(["'])/gi,
];

const MASK = "[MASKED]";

export function maskSecrets(text: string): string {
  if (!text) return text;
  let masked = text;
  for (const pattern of SECRET_PATTERNS) {
    masked = masked.replace(pattern, (match, ...groups) => {
      // النمط الرابع (Generic KEY="value") بيحتاج نحافظ على الاسم/العلامات
      // ونستبدل القيمة بس — باقي الأنماط بتستبدل المطابقة كلها.
      if (groups.length >= 3 && typeof groups[0] === "string" && typeof groups[2] === "string") {
        return `${groups[0]}${MASK}${groups[2]}`;
      }
      return MASK;
    });
  }
  return masked;
}

/**
 * يطبّق الإخفاء على كل الحقول النصية الحرة اللي ممكن تحمل دليل كود أو
 * تكرار غير مقصود لسر حقيقي — مش بس code_snippet. اكتُشف ده أثناء
 * المراجعة الذاتية (self-review) لهذه المرحلة: patch_suggestion ممكن
 * يقترح كود فيه نفس السر، وattack_scenario/root_cause ممكن يقتبسوا
 * الكود وهم بيشرحوا المشكلة. title/severity مُستثناة عمدًا (نصوص
 * وصفية قصيرة مالهاش علاقة باقتباس كود).
 */
export function maskFindingEvidence<
  T extends {
    code_snippet: string;
    description: string;
    impact: string;
    root_cause: string;
    attack_scenario: string;
    recommended_fix: string;
    patch_suggestion: string;
  },
>(finding: T): T {
  return {
    ...finding,
    code_snippet: maskSecrets(finding.code_snippet),
    description: maskSecrets(finding.description),
    impact: maskSecrets(finding.impact),
    root_cause: maskSecrets(finding.root_cause),
    attack_scenario: maskSecrets(finding.attack_scenario),
    recommended_fix: maskSecrets(finding.recommended_fix),
    patch_suggestion: maskSecrets(finding.patch_suggestion),
  };
}
