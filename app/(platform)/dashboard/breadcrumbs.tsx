"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { NAV_ITEMS_FLAT } from "./nav-config";

/**
 * فتات التنقّل (Breadcrumbs) — يُشتق ديناميكيًا من المسار الحالي. يعيد
 * استخدام تسميات nav-config للمستوى الأول، مع خريطة تسميات للمقاطع
 * الأعمق المعروفة. presentation-only. RTL: الفاصل ChevronLeft (اتجاه
 * التقدّم لليسار في العربية).
 */

const SEGMENT_LABELS: Record<string, string> = {
  dashboard: "الرئيسية",
  projects: "المشاريع",
  leads: "العملاء المحتملون",
  clients: "العملاء",
  workspace: "مساحتي",
  collaboration: "التعاون",
  "organizational-intelligence": "الذكاء التنظيمي",
  automations: "الأتمتة",
  executive: "غرفة القيادة",
  templates: "قوالب الاكتشاف",
  settings: "الإعدادات",
  help: "دليل الاستخدام",
  notifications: "الإشعارات",
  account: "الحساب",
};

function labelFor(segment: string, href: string): string {
  const navMatch = NAV_ITEMS_FLAT.find((n) => n.href === href);
  if (navMatch) return navMatch.label;
  if (SEGMENT_LABELS[segment]) return SEGMENT_LABELS[segment];
  // معرّف (uuid/رقم) → تسمية عامة
  if (/^[0-9a-f]{8}-|^\d+$/i.test(segment)) return "تفاصيل";
  return decodeURIComponent(segment);
}

export default function Breadcrumbs() {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);

  // لا نعرض الـ breadcrumb على صفحة الجذر (/dashboard) — عنوان الصفحة يكفي.
  if (segments.length <= 1) return null;

  const crumbs = segments.map((seg, i) => {
    const href = "/" + segments.slice(0, i + 1).join("/");
    return { label: labelFor(seg, href), href, last: i === segments.length - 1 };
  });

  return (
    <nav aria-label="مسار التنقّل" className="mb-4 flex items-center gap-1.5 text-[13px] text-[var(--v-text-muted)]">
      {crumbs.map((c, i) => (
        <span key={c.href} className="flex items-center gap-1.5">
          {i > 0 && <ChevronLeft size={14} className="text-[var(--v-text-subtle)]" aria-hidden />}
          {c.last ? (
            <span className="font-medium text-[var(--v-text)]" aria-current="page">{c.label}</span>
          ) : (
            <Link href={c.href} className="transition hover:text-[var(--v-primary)]">{c.label}</Link>
          )}
        </span>
      ))}
    </nav>
  );
}
