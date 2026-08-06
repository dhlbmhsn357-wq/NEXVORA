import { describe, expect, it } from "vitest";
import { renderTemplate, ALLOWED_TEMPLATE_VARIABLES } from "./templates";

describe("renderTemplate", () => {
  it("يستبدل المتغيّرات الموجودة", () => {
    const out = renderTemplate("مرحباً {{customer_name}} — مشروع {{project_name}}", {
      customer_name: "أحمد",
      project_name: "المنصة",
    });
    expect(out).toBe("مرحباً أحمد — مشروع المنصة");
  });

  it("يشيل المتغيّرات غير المسموحة", () => {
    const out = renderTemplate("{{customer_name}} — {{secret_key}}", {
      customer_name: "أحمد",
    });
    expect(out).toBe("أحمد — ");
  });

  it("يشيل مسافات داخل الأقواس", () => {
    const out = renderTemplate("{{  customer_name  }}", { customer_name: "أحمد" });
    expect(out).toBe("أحمد");
  });

  it("يعمل مع كل المتغيّرات المسموحة", () => {
    const body = ALLOWED_TEMPLATE_VARIABLES.map((k) => `{{${k}}}`).join(" ");
    const vars: Record<string, string> = {};
    for (const k of ALLOWED_TEMPLATE_VARIABLES) vars[k] = k;
    const out = renderTemplate(body, vars);
    expect(out).toBe(ALLOWED_TEMPLATE_VARIABLES.join(" "));
  });

  it("يحوّل غير الموجود لنص فارغ (ما يتركش القوس ظاهر)", () => {
    const out = renderTemplate("قبل {{customer_name}} بعد", {});
    expect(out).toBe("قبل  بعد");
  });
});
