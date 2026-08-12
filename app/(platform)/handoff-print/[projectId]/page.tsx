import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PrintButton from "@/components/ui/PrintButton";
import { ProjectModeBanner } from "@/app/(platform)/_shared/project-mode-banner";
import HandoffPackageBody from "@/components/handoff/HandoffPackageBody";
import "@/app/print.css";

/**
 * PDF Handoff Package — تسليم فعلي وليس فهرس.
 * الافتراضي: يعرض فقط العناصر المكتملة (لأنّ معظم العناصر الاختيارية
 * غير ذات صلة بالمشاريع الصغيرة). أضف `?includeAll=1` للاحتفاظ بعرض
 * كل العناصر (مفيد للمراجعة الداخلية أو تسليم Enterprise).
 */
export default async function HandoffPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams?: Promise<{ includeAll?: string }>;
}) {
  const { projectId } = await params;
  const sp = (await searchParams) ?? {};
  const includeAll = sp.includeAll === "1" || sp.includeAll === "true";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: project } = await supabase
    .from("projects")
    .select("mode")
    .eq("id", projectId)
    .maybeSingle();
  if (!project) notFound();

  return (
    <>
      <div className="mx-auto max-w-3xl px-8 pt-6" dir="rtl">
        <div className="no-print mb-4 rounded border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
          💡 <strong>لأنظف PDF:</strong> اضغط Ctrl+P ← More Settings ← uncheck &quot;Headers and footers&quot;. ثم Save as PDF.
        </div>
        <div className="no-print mb-4 rounded border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
          الـ PDF يعرض فقط <strong>العناصر المكتملة</strong>.
          {" "}
          {includeAll ? (
            <>عرض كل العناصر مُفعَّل. للعودة، أزل <code className="font-mono">?includeAll=1</code>.</>
          ) : (
            <>لعرض جميع العناصر (بما فيها المعلّقة/الاختيارية) أضف <code className="font-mono">?includeAll=1</code> للرابط.</>
          )}
        </div>
        <div className="no-print mb-6">
          <PrintButton />
        </div>
        <ProjectModeBanner mode={(project as { mode?: string | null }).mode ?? null} />
      </div>

      <HandoffPackageBody projectId={projectId} includeAll={includeAll} />
    </>
  );
}
