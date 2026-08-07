import { describe, expect, it } from "vitest";
import { LayoutDashboard } from "lucide-react";
import { filterNavByFlags, filterNav, type NavGroup } from "./nav-config";

const groups: NavGroup[] = [
  {
    title: "Core",
    items: [
      { href: "/a", label: "A", icon: LayoutDashboard },
      { href: "/b", label: "B", icon: LayoutDashboard, flag: "beta" },
    ],
  },
  {
    title: "Extended",
    items: [
      { href: "/c", label: "C", icon: LayoutDashboard, flag: "extended_technical_delivery" },
      { href: "/d", label: "D", icon: LayoutDashboard, flag: "extended_technical_delivery" },
    ],
  },
  {
    title: "Admin",
    items: [
      { href: "/e", label: "E", icon: LayoutDashboard, roles: ["owner", "admin"] },
    ],
  },
];

describe("filterNavByFlags", () => {
  it("يخفي المجموعة كاملة لو كل عناصرها مغلقة بـ flag غير مفعّل", () => {
    const out = filterNavByFlags(groups, new Set());
    expect(out.map((g) => g.title)).toEqual(["Core", "Admin"]);
    expect(out[0].items.map((i) => i.href)).toEqual(["/a"]);
  });

  it("يظهر المجموعة لو الـ flag مفعّل", () => {
    const out = filterNavByFlags(groups, new Set(["extended_technical_delivery"]));
    expect(out.map((g) => g.title)).toEqual(["Core", "Extended", "Admin"]);
    expect(out[1].items.map((i) => i.href)).toEqual(["/c", "/d"]);
  });

  it("العنصر بدون flag يظهر دائمًا", () => {
    const out = filterNavByFlags(groups, new Set());
    expect(out[0].items.find((i) => i.href === "/a")).toBeDefined();
  });
});

describe("filterNav (role + flags)", () => {
  it("يجمع الفلترتين", () => {
    const out = filterNav(groups, "member", new Set(["extended_technical_delivery"]));
    // Admin group مش هيظهر لأن /e مقيّد بأدوار
    expect(out.map((g) => g.title)).toEqual(["Core", "Extended"]);
  });

  it("owner يشوف كل حاجة", () => {
    const out = filterNav(groups, "owner", new Set(["extended_technical_delivery", "beta"]));
    expect(out.map((g) => g.title)).toEqual(["Core", "Extended", "Admin"]);
    expect(out[0].items.length).toBe(2);
  });
});
