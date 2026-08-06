import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ROLE_LABELS } from "@/lib/auth/roles";
import { getI18n } from "@/lib/i18n/server";
import AccountForm from "./account-form";
import type { UserRole } from "@/lib/types/database";

export default async function AccountPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, email, avatar_url, role")
    .eq("id", user.id)
    .maybeSingle();

  const roleLabel = ROLE_LABELS[(profile?.role as UserRole) ?? "member"] ?? "";
  const { t } = await getI18n();

  return (
    <div>
      <h1 className="font-display text-display text-[var(--v-text)]">{t("account.title")}</h1>
      <p className="mt-1 text-sm text-[var(--v-text-secondary)]">{t("account.subtitle")}</p>

      <AccountForm
        initialName={profile?.full_name ?? ""}
        email={profile?.email ?? user.email ?? ""}
        avatarUrl={profile?.avatar_url ?? null}
        roleLabel={roleLabel}
      />
    </div>
  );
}
