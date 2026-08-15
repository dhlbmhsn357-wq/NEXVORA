import { describe, expect, it } from "vitest";
import { buildWhatsAppLink, renderTemplate } from "./whatsapp";

describe("buildWhatsAppLink", () => {
  it("يبني رابط wa.me صحيح مع الرقم المطبَّع", () => {
    const link = buildWhatsAppLink("201012345678", "مرحبا");
    expect(link.startsWith("https://wa.me/201012345678?text=")).toBe(true);
  });

  it("يرمّز النص العربي بصورة صحيحة (URL encoding)", () => {
    const link = buildWhatsAppLink("201012345678", "السلام عليكم");
    const url = new URL(link);
    expect(url.searchParams.get("text")).toBe("السلام عليكم");
  });

  it("يرمّز الرموز الخاصة (&, =, ?) داخل الرسالة بدون كسر الرابط", () => {
    const message = "هل يناسبك؟ Q&A = نعم";
    const link = buildWhatsAppLink("201012345678", message);
    const url = new URL(link);
    expect(url.searchParams.get("text")).toBe(message);
  });
});

describe("renderTemplate", () => {
  it("يستبدل placeholders بالقيم المعطاة", () => {
    const out = renderTemplate("مرحبا {{organization_name}}، من {{sender_name}}", {
      organization_name: "مدرسة النور",
      sender_name: "أحمد",
    });
    expect(out).toBe("مرحبا مدرسة النور، من أحمد");
  });

  it("يترك placeholder غير موجود في vars كما هو", () => {
    const out = renderTemplate("مرحبا {{organization_name}} {{missing}}", {
      organization_name: "س",
    });
    expect(out).toBe("مرحبا س {{missing}}");
  });

  it("يمنع HTML/Script injection من القيم (escape دفاعي)", () => {
    const out = renderTemplate("رسالة: {{organization_name}}", {
      organization_name: '<script>alert("xss")</script>',
    });
    expect(out).not.toContain("<script>");
    expect(out).toContain("&lt;script&gt;");
  });

  it("يمنع حقن سمات HTML عبر علامات الاقتباس والأقواس الزاوية", () => {
    const out = renderTemplate("{{v}}", { v: `"><img src=x onerror=alert(1)>` });
    expect(out).not.toContain("<img");
    expect(out).not.toContain('">');
  });

  it("القالب نفسه (خارج placeholders) لا يُغيَّر", () => {
    const out = renderTemplate("نص عادي بدون متغيرات", {});
    expect(out).toBe("نص عادي بدون متغيرات");
  });

  it("يستبدل نفس الـ placeholder في أكثر من مكان", () => {
    const out = renderTemplate("{{x}} و{{x}} مرة أخرى", { x: "قيمة" });
    expect(out).toBe("قيمة وقيمة مرة أخرى");
  });
});
