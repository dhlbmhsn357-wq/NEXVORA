import { createClient } from "@/lib/supabase/server";
import HelpGuide from "./help-guide";

/**
 * صفحة دليل الاستخدام — تجيب دور المستخدم لتمرير isAdmin، فقسم «الذكاء
 * والأتمتة والإدارة» يظهر لـ owner/admin فقط. باقي الدليل للجميع.
 */
export default async function HelpPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  let isAdmin = false;
  if (user) {
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
    const role = (profile?.role as string | undefined) ?? "member";
    isAdmin = role === "owner" || role === "admin";
  }

  return <HelpGuide isAdmin={isAdmin} />;
}
