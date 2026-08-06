import { redirect } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";
import LoginForm from "./login-form";

// بتستعلم قاعدة البيانات (فحص الإعداد الأولي) — ممنوع الـ prerender وقت الـ build.
export const dynamic = "force-dynamic";

/**
 * صفحة الدخول (Server Component): لو المنصة لسه مافيهاش أي مسؤول نظام
 * (owner) — يبقى ده أول تشغيل، فبنحوّل لصفحة الإعداد الأولي /setup.
 * غير كده بنعرض نموذج الدخول المؤسسي.
 */
export default async function LoginPage() {
  const service = createServiceClient();
  const { count } = await service
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("role", "owner")
    .neq("status", "deleted");

  if ((count ?? 0) === 0) redirect("/setup");

  return <LoginForm />;
}
