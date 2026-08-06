import { describe, it, expect } from "vitest";
import { containsSecrets, sanitize, sanitizeObject } from "./sanitizer";

/**
 * أهم اختبارات المرحلة.
 *
 * التسريب هنا غير قابل للتراجع: ما يصل لمزوّد خارجي لا يُسترجَع. لذلك
 * الاختبارات تتحقّق من الحجب **ومن عدم الإفراط فيه** معًا — تعقيم يبتلع
 * المحتوى المفيد يدفع المطوّرين لتعطيله، وهذا أسوأ من تعقيم متساهل.
 */

describe("الأسرار — تُحجب دائمًا", () => {
  it("مفاتيح OpenAI", () => {
    const r = sanitize("المفتاح: sk-abcdefghijklmnopqrstuvwxyz123456");
    expect(r.text).not.toContain("sk-abcdefghijkl");
    expect(r.text).toContain("[مفتاح محجوب]");
  });

  it("مفاتيح Google", () => {
    const r = sanitize("AIzaSyD-1234567890abcdefghijklmnopqrstu");
    expect(r.text).toContain("[مفتاح محجوب]");
  });

  it("مفاتيح GitHub و Slack و Stripe", () => {
    for (const key of [
      "ghp_1234567890abcdefghijklmnopqrstuvwxyz",
      "xoxb-123456789012-abcdefghijklmnop",
      "sk_live_1234567890abcdefghijklmn",
    ]) {
      expect(sanitize(`token=${key}`).totalRedacted).toBeGreaterThan(0);
    }
  });

  it("مفاتيح Supabase بالصيغتين", () => {
    // القديمة JWT والجديدة sb_secret — الاتنين لازم يتحجبوا.
    const jwt =
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyZWYiOiJhYmNkIiwicm9sZSI6ImFub24ifQ.signature123";
    expect(sanitize(jwt).text).toContain("[رمز محجوب]");
    expect(sanitize("sb_secret_abcdefghijklmnopqrstuvwx").totalRedacted).toBeGreaterThan(0);
  });

  it("المفتاح الخاص كاملًا", () => {
    const key = `-----BEGIN RSA PRIVATE KEY-----
MIIEowIBAAKCAQEA1234567890
-----END RSA PRIVATE KEY-----`;
    const r = sanitize(`الشهادة:\n${key}`);
    expect(r.text).not.toContain("MIIEow");
    expect(r.text).toContain("[مفتاح خاص محجوب]");
  });

  it("روابط الاتصال بقواعد البيانات", () => {
    const r = sanitize("postgresql://user:hunter2@db.example.com:5432/app");
    expect(r.text).not.toContain("hunter2");
  });

  it("ترويسة التفويض", () => {
    const r = sanitize("Authorization: Bearer abcdefghijklmnopqrstuvwxyz123456");
    expect(r.totalRedacted).toBeGreaterThan(0);
  });

  it("الحقول الحسّاسة بالاسم", () => {
    for (const field of ['password: "s3cret!"', "api_key=abcd1234efgh", 'client_secret: "xyz789ab"']) {
      expect(sanitize(field).totalRedacted).toBeGreaterThan(0);
    }
  });

  it("الأسرار تُحجب حتى مع السماح بالبيانات الشخصية", () => {
    // خيار البيانات الشخصية **لا يمسّ الأسرار إطلاقًا**.
    const r = sanitize("sk-abcdefghijklmnopqrstuvwxyz123456", { allowPii: true });
    expect(r.text).toContain("[مفتاح محجوب]");
  });
});

describe("البيانات الشخصية — تُحجب افتراضيًا", () => {
  it("البريد الإلكتروني", () => {
    const r = sanitize("راسل ahmed@example.com");
    expect(r.text).toContain("[بريد محجوب]");
  });

  it("الهاتف الدولي", () => {
    expect(sanitize("+20 100 123 4567").totalRedacted).toBeGreaterThan(0);
  });

  it("بطاقة الدفع", () => {
    const r = sanitize("4111 1111 1111 1111");
    expect(r.text).toContain("[رقم بطاقة محجوب]");
  });

  it("الرقم القومي", () => {
    expect(sanitize("29001011234567").totalRedacted).toBeGreaterThan(0);
  });

  it("السماح الصريح يمرّرها", () => {
    // تحليل محضر اجتماع بلا أسماء ولا إيميلات يفقد معناه — فالقرار
    // يكون واعيًا لكل نوع مهمة لا افتراضًا صامتًا.
    const r = sanitize("راسل ahmed@example.com", { allowPii: true });
    expect(r.text).toContain("ahmed@example.com");
  });
});

describe("عدم الإفراط في الحجب", () => {
  it("النص العادي يمرّ كما هو", () => {
    const text = "المشروع يحتاج ثلاث مراحل: التحليل ثم التصميم ثم التنفيذ.";
    expect(sanitize(text).text).toBe(text);
    expect(sanitize(text).totalRedacted).toBe(0);
  });

  it("الأرقام العادية لا تُحجب كبطاقات", () => {
    const text = "الميزانية 50000 جنيه على 12 شهر.";
    expect(sanitize(text).totalRedacted).toBe(0);
  });

  it("الكلمات التقنية بلا قيمة لا تُحجب", () => {
    // ذكر كلمة password في وصف مطلب ليس تسريبًا.
    const text = "المستخدم لازم يقدر يغيّر الـ password بتاعه من الإعدادات.";
    expect(sanitize(text).totalRedacted).toBe(0);
  });

  it("النص الفارغ آمن", () => {
    expect(sanitize("").totalRedacted).toBe(0);
    expect(sanitize("").text).toBe("");
  });
});

describe("تعقيم الكائنات", () => {
  it("المفاتيح الحسّاسة تُحجب بالاسم مهما كانت القيمة", () => {
    // قيمة قصيرة زي "123" ماتطابقش أي نمط، لكن الحقل اسمه password
    // فهي كلمة مرور بالتأكيد — الاسم دليل أقوى من الشكل.
    const { value, totalRedacted } = sanitizeObject({ password: "123", name: "أحمد" });
    expect((value as Record<string, unknown>).password).toBe("[محجوب]");
    expect(totalRedacted).toBeGreaterThan(0);
  });

  it("يتعمّق في الكائنات المتداخلة والمصفوفات", () => {
    const { value } = sanitizeObject({
      config: { db: { connection: "postgresql://u:p@h:5432/d" } },
      items: [{ token: "abc" }],
    });
    const nested = value as unknown as { config: { db: { connection: string } } };
    expect(nested.config.db.connection).not.toContain("postgresql://u:p");
  });

  it("يحافظ على البنية والقيم غير النصّية", () => {
    const { value } = sanitizeObject({ count: 5, active: true, tags: ["a", "b"] });
    expect(value).toEqual({ count: 5, active: true, tags: ["a", "b"] });
  });
});

describe("الفحص النهائي", () => {
  it("يكشف السرّ المتبقّي", () => {
    expect(containsSecrets("sk-abcdefghijklmnopqrstuvwxyz123456")).toBe(true);
  });

  it("لا ينذر على نص نظيف", () => {
    expect(containsSecrets("تحليل المشروع جاهز.")).toBe(false);
  });

  it("النص بعد التعقيم يعدّي الفحص", () => {
    // الثابت الحاكم: مخرج التعقيم لا يحمل أسرارًا. فشله يعني ثغرة
    // في التعقيم نفسه، والبوابة توقف الطلب عندها.
    const dirty = "key=sk-abcdefghijklmnopqrstuvwxyz123456 و AIzaSyD-1234567890abcdefghijklmnopqrs";
    expect(containsSecrets(sanitize(dirty).text)).toBe(false);
  });

  it("البيانات الشخصية لا تُحسب سرًّا", () => {
    expect(containsSecrets("ahmed@example.com")).toBe(false);
  });
});
