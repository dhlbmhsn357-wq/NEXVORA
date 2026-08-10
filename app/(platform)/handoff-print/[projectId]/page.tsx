import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PrintButton from "@/components/ui/PrintButton";
import {
  getLatestPackage,
  listItems,
  listQuestions,
  listDeliveries,
} from "@/lib/handoff/service";
import {
  HANDOFF_ITEM_REGISTRY,
  HANDOFF_ITEM_STATUS_LABELS,
  HANDOFF_PACKAGE_STATUS_LABELS,
  HANDOFF_QUESTION_STATUS_LABELS,
  HANDOFF_QUESTION_PRIORITY_LABELS,
  HANDOFF_DELIVERY_STATUS_LABELS,
  type HandoffItemDef,
  type HandoffItemRow,
} from "@/lib/handoff/types";
import "@/app/print.css";

/**
 * صفحة PDF لحزمة التسليم (Handoff Package) — كل العناصر مقسّمة بحسب
 * التصنيف مع الحالة والملاحظات، بالإضافة إلى ملخّص الأسئلة وسجل التسليم.
 */
export default async function HandoffPrintPage({
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

  const { data: project } = await supabase
    .from("projects")
    .select("name")
    .eq("id", projectId)
    .maybeSingle();
  if (!project) notFound();

  const pkg = await getLatestPackage(projectId);
  if (!pkg) notFound();

  const [items, questions, deliveries] = await Promise.all([
    listItems(pkg.id),
    listQuestions(pkg.id),
    listDeliveries(pkg.id),
  ]);

  const itemsByKey = new Map(items.map((i) => [i.itemKey, i]));

  const CATEGORY_LABELS: Record<HandoffItemDef["category"], string> = {
    docs: "وثائق",
    code: "كود",
    ops: "تشغيل",
    handover: "تسليم",
    compliance: "امتثال",
  };
  const categories = Array.from(new Set(HANDOFF_ITEM_REGISTRY.map((d) => d.category)));

  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-3xl px-8 py-10 text-[#0A1735]" dir="rtl">
        <div className="no-print mb-4 rounded border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
          💡 <strong>لأنظف PDF:</strong> اضغط Ctrl+P ← More Settings ← uncheck &quot;Headers and footers&quot;. ثم Save as PDF.
        </div>
        <div className="no-print mb-6">
          <PrintButton />
        </div>

        <header className="border-b-2 border-[#3D5CFF] pb-3">
          <h1 className="font-display text-3xl">
            {pkg.title || "حزمة التسليم"} — {project.name}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            v{pkg.version} · الحالة: {HANDOFF_PACKAGE_STATUS_LABELS[pkg.status]}
            {pkg.finalizedAt ? ` · مُسلَّمة في ${new Date(pkg.finalizedAt).toLocaleDateString("ar-EG")}` : ""}
          </p>
          {pkg.notes && <p className="mt-2 text-xs text-slate-600">{pkg.notes}</p>}
        </header>

        {categories.map((cat) => {
          const defs = HANDOFF_ITEM_REGISTRY.filter((d) => d.category === cat);
          return (
            <Section key={cat} title={CATEGORY_LABELS[cat]}>
              <div className="space-y-2">
                {defs.map((def) => {
                  const row = itemsByKey.get(def.key);
                  return <ItemRow key={def.key} def={def} row={row} />;
                })}
              </div>
            </Section>
          );
        })}

        {questions.length > 0 && (
          <Section title={`أسئلة الشريك (${questions.length})`}>
            <ul className="space-y-2">
              {questions.map((q) => (
                <li key={q.id} className="rounded border border-slate-200 p-2">
                  <p className="text-sm">
                    <strong>س:</strong> {q.question}
                  </p>
                  {q.answer && (
                    <p className="mt-1 border-r-2 border-[#3D5CFF] pr-2 text-xs text-slate-600">
                      <strong>ج:</strong> {q.answer}
                    </p>
                  )}
                  <p className="mt-1 text-[11px] text-slate-500">
                    الحالة: {HANDOFF_QUESTION_STATUS_LABELS[q.status]} · الأولوية: {HANDOFF_QUESTION_PRIORITY_LABELS[q.priority]}
                  </p>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {deliveries.length > 0 && (
          <Section title={`سجل التسليم (${deliveries.length})`}>
            <ul className="space-y-1">
              {deliveries.map((d) => (
                <li key={d.id} className="text-sm">
                  <strong>{d.partnerName || "—"}</strong> — {HANDOFF_DELIVERY_STATUS_LABELS[d.receiptStatus]}
                  {d.sentAt && <span className="block text-[11px] text-slate-500">أُرسل: {new Date(d.sentAt).toLocaleString("ar-EG")}</span>}
                  {d.acceptedAt && <span className="block text-[11px] text-slate-500">قُبل: {new Date(d.acceptedAt).toLocaleString("ar-EG")}</span>}
                  {d.notes && <span className="block text-[11px] text-slate-600">— {d.notes}</span>}
                </li>
              ))}
            </ul>
          </Section>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-6 break-inside-avoid">
      <h2 className="border-b border-slate-200 pb-1 font-display text-lg">{title}</h2>
      <div className="mt-2 text-sm leading-relaxed text-slate-700">{children}</div>
    </div>
  );
}

function ItemRow({ def, row }: { def: HandoffItemDef; row?: HandoffItemRow }) {
  const status = row?.status ?? "pending";
  const statusStyle: Record<string, { bg: string; color: string }> = {
    pending: { bg: "#F1F5F9", color: "#475569" },
    in_progress: { bg: "#FEF3C7", color: "#92400E" },
    completed: { bg: "#DCFCE7", color: "#166534" },
    skipped: { bg: "#F5F5F5", color: "#737373" },
  };
  const st = statusStyle[status];

  return (
    <div className="rounded border border-slate-200 p-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">
            {def.label}
            {def.isMandatory && <span className="mr-1 text-xs text-[#DC2626]">*</span>}
          </p>
          <p className="text-[11px] text-slate-500">{def.description}</p>
        </div>
        <span
          className="whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold"
          style={{ backgroundColor: st.bg, color: st.color }}
        >
          {HANDOFF_ITEM_STATUS_LABELS[status]}
        </span>
      </div>
      {row?.contentUrl && (
        <p className="mt-1 text-xs">
          الرابط: <a href={row.contentUrl} className="text-[#3D5CFF] underline">{row.contentUrl}</a>
        </p>
      )}
      {row?.contentText && <p className="mt-1 whitespace-pre-wrap text-xs text-slate-700">{row.contentText}</p>}
      {row?.notes && <p className="mt-1 text-[11px] text-slate-500">ملاحظات: {row.notes}</p>}
    </div>
  );
}
