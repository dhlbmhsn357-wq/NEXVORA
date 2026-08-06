import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { MeetingPresentation } from "@/lib/types/database";
import MeetingDeckViewer from "./meeting-deck-viewer";

/**
 * صفحة عرض الاجتماع المستقلة (منفصلة عن تخطيط لوحة التحكم) — شاشة كاملة
 * للعرض المباشر، محمية بالكامل بفحص تسجيل الدخول. مش رابط عام: لازم
 * المستخدم يكون مسجّل دخوله.
 */
export default async function MeetingPresentPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: pres } = await supabase
    .from("meeting_presentations")
    .select("*")
    .eq("project_id", projectId)
    .maybeSingle();

  if (!pres) notFound();
  const presentation = pres as MeetingPresentation;
  const hasContent = presentation.slides && Object.keys(presentation.slides).length > 0;
  if (!hasContent) notFound();

  return <MeetingDeckViewer slides={presentation.slides} title={presentation.title} />;
}
