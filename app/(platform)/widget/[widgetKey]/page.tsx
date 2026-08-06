import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";
import WidgetLoader from "./widget-loader";

/**
 * صفحة عامة بدون تسجيل دخول (خارج تخطيط /dashboard) — مُعدّة
 * للتضمين عبر <iframe> في موقع العميل. نطاق الوصول محصور بمشروع واحد
 * بس عبر widget_key (نفس نمط present/[token] بالظبط، Service Role
 * Client بيتخطى RLS بتصميم). خفيفة، Responsive، Lazy Loaded لجسم
 * المحادثة، وبدون أي هوية VELORA إجبارية.
 */
export default async function WidgetPage({
  params,
}: {
  params: Promise<{ widgetKey: string }>;
}) {
  const { widgetKey } = await params;
  const supabase = createServiceClient();

  const { data: project } = await supabase
    .from("projects")
    .select("id, name")
    .eq("widget_key", widgetKey)
    .maybeSingle();

  if (!project) {
    notFound();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-transparent p-2">
      <div className="w-full max-w-md">
        <WidgetLoader widgetKey={widgetKey} projectName={project.name} />
      </div>
    </div>
  );
}
