import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateMeetingPptxBuffer } from "@/lib/meeting-presentation/pptx-generator";
import type { MeetingPresentation } from "@/lib/types/database";

/**
 * تنزيل عرض الاجتماع كملف PowerPoint (.pptx) — يُولَّد عند الطلب من نفس
 * محتوى الشرائح المخزّن (بدون تخزين وسيط). محمي بفحص تسجيل الدخول.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: project } = await supabase.from("projects").select("name").eq("id", projectId).maybeSingle();
  const { data: pres } = await supabase
    .from("meeting_presentations")
    .select("*")
    .eq("project_id", projectId)
    .maybeSingle();

  if (!pres || !project) return NextResponse.json({ error: "not found" }, { status: 404 });

  const presentation = pres as MeetingPresentation;
  const hasContent = presentation.slides && Object.keys(presentation.slides).length > 0;
  if (!hasContent) return NextResponse.json({ error: "no slides" }, { status: 409 });

  const buffer = await generateMeetingPptxBuffer(presentation, project.name as string);

  const safeName = (presentation.title || (project.name as string) || "meeting-presentation")
    .replace(/[^\w؀-ۿ\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60);
  const filename = `${safeName || "meeting-presentation"}.pptx`;

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "Content-Disposition": `attachment; filename="presentation.pptx"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "no-store",
    },
  });
}
