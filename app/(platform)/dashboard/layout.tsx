import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Topbar from "./topbar";
import Sidebar from "./sidebar";
import Breadcrumbs from "./breadcrumbs";
import CommandPalette from "./command-palette";
import PageTransition from "./page-transition";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, email, role")
    .eq("id", user.id)
    .single();

  return (
    <div className="flex min-h-screen bg-[var(--v-bg-soft)]">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar userLabel={profile?.full_name || profile?.email || ""} role={profile?.role ?? null} />
        <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
          <Breadcrumbs />
          <PageTransition>{children}</PageTransition>
        </main>
      </div>
      <CommandPalette />
    </div>
  );
}
