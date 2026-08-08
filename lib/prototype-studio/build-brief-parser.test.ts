import { describe, expect, it } from "vitest";
import { parseBuildBrief } from "./build-brief-parser";

describe("parseBuildBrief", () => {
  it("flags missing sections when brief has none of the expected headings", () => {
    const res = parseBuildBrief("just plain paragraphs with no structure whatsoever, more than a hundred words " + "word ".repeat(120));
    expect(res.missingSections).toEqual(["objective", "scope", "flows", "screens"]);
    expect(res.warnings.some((w) => w.includes("أقسام ناقصة"))).toBe(true);
    expect(res.warnings.some((w) => w.includes("لا توجد عناوين"))).toBe(true);
  });

  it("passes soft validation for a properly structured brief", () => {
    const md = `# Objective\nBuild a clickable prototype.\n\n# Scope\nCore checkout.\n\n# Flows\nSign-in, cart.\n\n# Screens\nHome, cart, checkout.\n${"word ".repeat(120)}`;
    const res = parseBuildBrief(md);
    expect(res.missingSections).toHaveLength(0);
    expect(res.warnings).toHaveLength(0);
    expect(res.headingsFound).toHaveLength(4);
  });

  it("accepts Arabic heading variants", () => {
    const md = `# الهدف\nx\n\n# النطاق\ny\n\n# التدفّقات\nz\n\n# الشاشات\nw\n${"كلمة ".repeat(120)}`;
    const res = parseBuildBrief(md);
    expect(res.missingSections).toHaveLength(0);
  });

  it("warns on short content", () => {
    const md = `# Objective\nx\n# Scope\ny\n# Flows\nz\n# Screens\nw`;
    const res = parseBuildBrief(md);
    expect(res.warnings.some((w) => w.includes("قصير جدًا"))).toBe(true);
  });
});
