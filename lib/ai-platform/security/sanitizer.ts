/**
 * طبقة التعقيم — الحارس الأخير قبل مغادرة البيانات إلى مزوّد خارجي.
 *
 * وحدة نقية بالكامل. تعمل على النص بعد بناء البرومبت وقبل الإرسال
 * مباشرة، فلا يمكن لأي مسار أن يتخطّاها.
 *
 * ## تمييز جوهري: الأسرار مقابل البيانات الشخصية
 *
 * **الأسرار تُحجب دائمًا وبلا استثناء.** مفتاح واجهة برمجية أو رمز
 * وصول لا معنى لإرساله لنموذج لغوي في أي سياق — وجوده في البرومبت
 * تسريب لا فائدة منه.
 *
 * **البيانات الشخصية تُحجب افتراضيًا، ويمكن السماح بها صراحةً.** وهذا
 * ليس تساهلًا: تحليل محضر اجتماع بلا أسماء المشاركين يفقد معناه، ومنصة
 * إدارة مشاريع تعمل على بيانات عملاء بطبيعتها. القرار يكون واعيًا
 * ومُوثَّقًا لكل نوع مهمة، لا افتراضًا صامتًا في الاتجاهين.
 */

export type RedactionKind =
  | "api_key"
  | "bearer_token"
  | "jwt"
  | "private_key"
  | "password_field"
  | "connection_string"
  | "email"
  | "phone"
  | "credit_card"
  | "national_id";

export interface Redaction {
  kind: RedactionKind;
  count: number;
}

export interface SanitizeResult {
  text: string;
  redactions: Redaction[];
  /** إجمالي ما حُجب — يُسجَّل مع كل نداء للمراجعة. */
  totalRedacted: number;
}

export interface SanitizeOptions {
  /**
   * السماح بالبيانات الشخصية (أسماء وإيميلات وهواتف).
   *
   * يُفعَّل لكل نوع مهمة على حدة وبقرار موثَّق. الأسرار **لا تتأثر**
   * بهذا الخيار إطلاقًا.
   */
  allowPii?: boolean;
}

interface Rule {
  kind: RedactionKind;
  pattern: RegExp;
  replacement: string;
  isPii: boolean;
}

/**
 * القواعد مرتّبة من الأخص للأعم عن قصد.
 *
 * الترتيب مهم: نمط عام يُطبَّق أولًا يبتلع النص فيمنع النمط الأخص من
 * تصنيفه بدقة، فيضيع سبب الحجب من السجل.
 */
const RULES: Rule[] = [
  // ---------- أسرار: تُحجب دائمًا ----------
  {
    kind: "private_key",
    pattern: /-----BEGIN[\s\S]*?PRIVATE KEY-----[\s\S]*?-----END[\s\S]*?PRIVATE KEY-----/g,
    replacement: "[مفتاح خاص محجوب]",
    isPii: false,
  },
  {
    kind: "connection_string",
    pattern: /\b(?:postgres|postgresql|mysql|mongodb(?:\+srv)?|redis|amqp):\/\/[^\s"'<>]+/gi,
    replacement: "[رابط اتصال محجوب]",
    isPii: false,
  },
  {
    // JWT — ثلاثة مقاطع base64url. مفاتيح Supabase القديمة من هذا النوع.
    kind: "jwt",
    pattern: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
    replacement: "[رمز محجوب]",
    isPii: false,
  },
  {
    kind: "bearer_token",
    pattern: /\b(?:Bearer|Authorization:)\s+[A-Za-z0-9._~+/=-]{16,}/gi,
    replacement: "[رمز وصول محجوب]",
    isPii: false,
  },
  {
    // أنماط مفاتيح المزوّدين المعروفة: OpenAI · Google · GitHub · Slack ·
    // Stripe · Supabase الجديدة · Anthropic.
    kind: "api_key",
    pattern:
      /\b(?:sk-[A-Za-z0-9_-]{16,}|AIza[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{16,}|xox[baprs]-[A-Za-z0-9-]{10,}|(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{16,}|sb_(?:secret|publishable)_[A-Za-z0-9_-]{16,})\b/g,
    replacement: "[مفتاح محجوب]",
    isPii: false,
  },
  {
    // حقل باسم حسّاس مع قيمته — يغطّي JSON و YAML و`KEY=value`.
    kind: "password_field",
    pattern:
      /("|')?\b(?:password|passwd|pwd|secret|api[_-]?key|access[_-]?token|refresh[_-]?token|private[_-]?key|client[_-]?secret|service[_-]?role[_-]?key)\b\1?\s*[:=]\s*("|')?[^\s,;}"']{4,}\2?/gi,
    replacement: "[حقل سرّي محجوب]",
    isPii: false,
  },

  // ---------- بيانات شخصية: تُحجب افتراضيًا ----------
  {
    kind: "credit_card",
    // بطاقات الدفع لا تُرسَل أبدًا — تُصنَّف شخصية لكن لا يُنصَح بالسماح.
    pattern: /\b(?:\d[ -]?){13,19}\b/g,
    replacement: "[رقم بطاقة محجوب]",
    isPii: true,
  },
  {
    kind: "national_id",
    pattern: /\b\d{14}\b/g, // الرقم القومي المصري
    replacement: "[رقم قومي محجوب]",
    isPii: true,
  },
  {
    kind: "email",
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
    replacement: "[بريد محجوب]",
    isPii: true,
  },
  {
    kind: "phone",
    pattern: /(?:\+|00)\d[\d\s-]{8,16}\d/g,
    replacement: "[هاتف محجوب]",
    isPii: true,
  },
];

/** ينقّي نصًا واحدًا. */
export function sanitize(text: string, options: SanitizeOptions = {}): SanitizeResult {
  if (!text) return { text: text ?? "", redactions: [], totalRedacted: 0 };

  let output = text;
  const redactions: Redaction[] = [];

  for (const rule of RULES) {
    if (rule.isPii && options.allowPii) continue;

    let count = 0;
    output = output.replace(rule.pattern, () => {
      count += 1;
      return rule.replacement;
    });

    if (count > 0) redactions.push({ kind: rule.kind, count });
  }

  return {
    text: output,
    redactions,
    totalRedacted: redactions.reduce((sum, r) => sum + r.count, 0),
  };
}

/**
 * ينقّي كائنًا كاملًا بالتعمّق.
 *
 * المفاتيح الحسّاسة تُحجب قيمتها **بالكامل** لا بالنمط: حقل اسمه
 * `password` قيمته `123` لن يطابق أي نمط لقصره، لكنه كلمة مرور بالتأكيد.
 * الاسم دليل أقوى من الشكل هنا.
 */
const SENSITIVE_KEYS =
  /^(?:password|passwd|pwd|secret|token|api_?key|access_?token|refresh_?token|private_?key|client_?secret|service_?role_?key|authorization|cookie|session)$/i;

export function sanitizeObject<T>(value: T, options: SanitizeOptions = {}): {
  value: T;
  totalRedacted: number;
} {
  let total = 0;

  function walk(node: unknown): unknown {
    if (typeof node === "string") {
      const result = sanitize(node, options);
      total += result.totalRedacted;
      return result.text;
    }
    if (Array.isArray(node)) return node.map(walk);
    if (node && typeof node === "object") {
      const out: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(node as Record<string, unknown>)) {
        if (SENSITIVE_KEYS.test(key)) {
          total += 1;
          out[key] = "[محجوب]";
          continue;
        }
        out[key] = walk(val);
      }
      return out;
    }
    return node;
  }

  return { value: walk(value) as T, totalRedacted: total };
}

/**
 * فحص سريع: هل بقي في النص ما يشبه سرًّا؟
 *
 * يُستخدم كتأكيد أخير في البوابة. الفشل هنا يعني ثغرة في التعقيم نفسه،
 * فهو خطأ برمجي يُرفع لا تحذير يُتجاهَل.
 */
export function containsSecrets(text: string): boolean {
  return RULES.filter((r) => !r.isPii).some((r) => {
    r.pattern.lastIndex = 0;
    return r.pattern.test(text);
  });
}
