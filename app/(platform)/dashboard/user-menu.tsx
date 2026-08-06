"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { logoutAction } from "../login/actions";
import Dropdown from "@/components/ui/Dropdown";
import { useT } from "@/lib/i18n/context";

export default function UserMenu({ label }: { label: string }) {
  const router = useRouter();
  const t = useT();
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    // Server action: بيسجّل حدث logout في audit_log (مع IP/جهاز) وبعدها بيمسح الجلسة.
    await logoutAction();
    router.push("/login");
    router.refresh();
  }

  return (
    <Dropdown
      trigger={({ toggle }) => (
        <button
          type="button"
          onClick={toggle}
          className="text-xs text-[var(--v-text-muted)] transition hover:text-[var(--v-primary)]"
        >
          {label}
        </button>
      )}
    >
      {(close) => (
        <>
          <Link
            href="/dashboard/account"
            onClick={close}
            className="block rounded-[var(--v-radius-md)] px-3 py-2 text-sm text-[var(--v-text)] transition hover:bg-[var(--v-surface)]"
          >
            {t("topbar.account")}
          </Link>
          <button
            type="button"
            onClick={handleLogout}
            disabled={loggingOut}
            className="block w-full rounded-[var(--v-radius-md)] px-3 py-2 text-right text-sm text-[var(--v-red)] transition hover:bg-[var(--v-red)]/10 disabled:opacity-50"
          >
            {loggingOut ? t("topbar.loggingOut") : t("topbar.logout")}
          </button>
        </>
      )}
    </Dropdown>
  );
}
