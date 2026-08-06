"use client";

import UserMenu from "./user-menu";
import MobileNav from "./mobile-nav";
import GlobalSearch from "@/components/ui/GlobalSearch";
import NotificationsBell from "@/components/ui/NotificationsBell";
import ThemeToggle from "@/components/ui/ThemeToggle";
import LanguageSwitcher from "@/components/ui/LanguageSwitcher";

/**
 * Topbar موحّد — التنقّل الأساسي في الـ Sidebar (الديسكتوب). على الموبايل
 * (أقل من lg) المكوّن MobileNav بيعرض الشعار + زر القائمة + درج تنقّل
 * كامل (رأس/بحث/أقسام Accordion/تذييل). التوب-بار نفسه: بحث + إشعارات +
 * وضع ليلي + قائمة مستخدم.
 */
export default function Topbar({ userLabel, role }: { userLabel: string; role: string | null }) {
  return (
    <header className="sticky top-0 z-20 border-b border-[var(--v-border)] bg-[var(--v-bg)]/85 backdrop-blur-md">
      <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <MobileNav userLabel={userLabel} role={role} />
        </div>

        <div className="flex items-center gap-2">
          <div className="hidden sm:block">
            <GlobalSearch />
          </div>
          <NotificationsBell />
          <LanguageSwitcher />
          <ThemeToggle />
          <div className="hidden sm:block">
            <UserMenu label={userLabel} />
          </div>
        </div>
      </div>
    </header>
  );
}
