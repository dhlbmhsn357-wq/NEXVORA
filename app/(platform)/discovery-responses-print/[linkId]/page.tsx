import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PrintButton from "@/components/ui/PrintButton";
import { fetchSessionResponses, type SessionResponseItemData } from "@/lib/discovery-portal/session-service";
import "@/app/print.css";

const STATUS_LABELS: Record<string, string> = {
  pending: "بانتظار الفتح",
  opened: "اتفتح",
  in_progress: "قيد التعبئة",
  submitted: "مُسلّم",
  draft: "مسودة",
  expired: "منتهي",
  cancelled: "ملغي",
};

/** صياغة قيمة الإجابة للطباعة. */
function formatAnswer(value: unknown): string {
  if (value === undefined || value === null || value === "") return "";
  if (Array.isArray(value)) return value.map((v) => formatAnswer(v)).filter(Boolean).join("، ");
  if (typeof value === "boolean") return value ? "نعم" : "لا";
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (typeof obj.name === "string") return obj.name;
    if (typeof obj.url === "string") return obj.url;
    return JSON.stringify(value);
  }
  return String(value);
}

/** يجمّع البنود حسب القسم مع الحفاظ على ترتيب أول ظهور. */
function groupByCategory(
  items: SessionResponseItemData[]
): Array<{ category: string | null; items: SessionResponseItemData[] }> {
  const groups: Array<{ category: string | null; items: SessionResponseItemData[] }> = [];
  const index = new Map<string, number>();
  for (const item of items) {
    const cat = item.category ?? null;
    const mapKey = cat ?? "__none";
    if (!index.has(mapKey)) {
      index.set(mapKey, groups.length);
      groups.push({ category: cat, items: [] });
    }
    groups[index.get(mapKey)!].items.push(item);
  }
  return groups;
}

/**
 * صفحة مستقلة (خارج تخطيط /dashboard) لطباعة/تصدير إجابات جلسة اكتشاف
 * كـ PDF احترافي بعلامة VELORA — بدون أي Navigation، محمية بفحص الدخول.
 */
export default async function DiscoveryResponsesPrintPage({
  params,
}: {
  params: Promise<{ linkId: string }>;
}) {
  const { linkId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const data = await fetchSessionResponses(supabase, linkId);
  if (!data.found) notFound();

  // اسم المشروع/العميل لسياق الترويسة
  const { data: link } = await supabase
    .from("discovery_form_links")
    .select("project_id, projects(name, clients(company_name))")
    .eq("id", linkId)
    .maybeSingle();
  const projectRel = link?.projects as { name?: string; clients?: { company_name?: string } | { company_name?: string }[] } | null;
  const projectName = projectRel?.name ?? "—";
  const clientRel = projectRel?.clients;
  const companyName = Array.isArray(clientRel) ? clientRel[0]?.company_name : clientRel?.company_name;

  const groups = groupByCategory(data.items);
  const completionPct = data.totalCount > 0 ? Math.round((data.answeredCount / data.totalCount) * 100) : 0;
  // ترقيم تسلسلي عام للأسئلة (نحسبه قبل الـ render لتفادي إعادة الإسناد أثناءه)
  const numberByKey = new Map(data.items.map((it, i) => [it.key, i + 1]));

  return (
    <div className="min-h-screen bg-white">
      <style>{`
        /* هامش الصفحة = 0 يخفي ترويسة/تذييل المتصفح التلقائية (التاريخ،
           اسم الصفحة، الرابط، رقم الصفحة). الهامش الفعلي بنضيفه من تصميمنا
           عبر .print-page عشان المحتوى ما يلزقش بالحواف. */
        @page { size: A4; margin: 0; }
        @media print {
          .no-print { display: none !important; }
          .avoid-break { break-inside: avoid; }
          .print-page { padding: 14mm !important; }
        }
      `}</style>

      <div className="print-page mx-auto max-w-3xl px-8 py-8 text-[#0A1735]" dir="rtl">
        <div className="no-print mb-4 rounded border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
          💡 <strong>لأنظف PDF:</strong> اضغط Ctrl+P ← More Settings ← uncheck &quot;Headers and footers&quot;. ثم Save as PDF.
        </div>
        <div className="no-print mb-6 flex justify-end">
          <PrintButton />
        </div>

        {/* ترويسة المشروع */}
        <header className="mb-6 flex items-center justify-between border-b-2 border-[#0A1735] pb-4">
          <div>
            <p className="font-display text-xl font-semibold text-[#0A1735]">
              {projectName}
              {companyName ? ` — ${companyName}` : ""}
            </p>
            <p className="text-[11px] text-[#64748B]">تقرير إجابات الاكتشاف</p>
          </div>
          <div className="text-left">
            <p className="text-[11px] text-[#64748B]">
              {new Date().toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" })}
            </p>
          </div>
        </header>

        {/* عنوان + ملخّص الجلسة */}
        <div className="mb-6">
          <h1 className="font-display text-2xl font-bold">
            إجابات الاكتشاف: {data.sessionName ?? "جلسة اكتشاف"}
          </h1>
          <p className="mt-1 text-sm text-[#475569]">
            {projectName}
            {companyName ? ` · ${companyName}` : ""}
          </p>

          <div className="mt-4 grid grid-cols-2 gap-3 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-4 sm:grid-cols-4">
            <SummaryCell label="الحالة" value={STATUS_LABELS[data.status ?? ""] ?? data.status ?? "—"} />
            <SummaryCell label="الإدارة" value={data.department ?? "—"} />
            <SummaryCell label="النموذج" value={data.templateName ?? "—"} />
            <SummaryCell label="نسبة الإكمال" value={`${completionPct}% · ${data.answeredCount}/${data.totalCount}`} />
          </div>
          {data.submittedAt && (
            <p className="mt-2 text-xs text-[#64748B]">
              تاريخ التسليم: {new Date(data.submittedAt).toLocaleString("ar-EG")}
            </p>
          )}
        </div>

        {/* الأقسام والأسئلة */}
        {groups.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[#CBD5E1] p-8 text-center text-sm text-[#64748B]">
            لا توجد أسئلة في هذه الجلسة.
          </p>
        ) : (
          <div className="space-y-6">
            {groups.map((group, gi) => (
              <section key={group.category ?? `g-${gi}`} className="avoid-break">
                {group.category && (
                  <h2 className="mb-3 rounded-lg bg-[#0A1735] px-3 py-2 font-display text-sm font-semibold text-white">
                    {gi + 1}. {group.category}
                  </h2>
                )}
                <div className="space-y-3">
                  {group.items.map((item) => {
                    return (
                      <div key={item.key} className="avoid-break rounded-lg border border-[#E2E8F0] p-3">
                        <p className="text-[13px] font-semibold text-[#334155]">
                          <span className="text-[#3D5CFF]">{numberByKey.get(item.key)}.</span> {item.label}
                        </p>
                        {item.answered ? (
                          <p className="mt-1.5 whitespace-pre-wrap border-r-2 border-[#3D5CFF] pr-3 text-sm leading-relaxed text-[#0A1735]">
                            {formatAnswer(item.answer)}
                          </p>
                        ) : (
                          <p className="mt-1.5 text-xs italic text-[#94A3B8]">— لم يُجب عليه —</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}

        {/* تذييل */}
        <footer className="mt-10 border-t border-[#E2E8F0] pt-4 text-center text-[11px] text-[#94A3B8]">
          وثيقة داخلية · صُدِّرت في {new Date().toLocaleDateString("ar-EG")}
        </footer>
      </div>
    </div>
  );
}

function SummaryCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] text-[#64748B]">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-[#0A1735]">{value}</p>
    </div>
  );
}
