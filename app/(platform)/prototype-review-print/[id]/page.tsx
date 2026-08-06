import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PrintButton from "@/components/ui/PrintButton";
import type { ImplementationStatus, PrototypeReview } from "@/lib/types/database";

const statusLabels: Record<ImplementationStatus, string> = {
  implemented: "Implemented",
  partially_implemented: "Partially Implemented",
  implemented_differently: "Implemented Differently",
  not_implemented: "Not Implemented",
};

/**
 * صفحة مستقلة (خارج تخطيط /dashboard) مُعدّة للطباعة/تصدير PDF لتقرير
 * المراجعة — بدون Header أو Navigation، بس محمية بنفس فحص تسجيل الدخول.
 */
export default async function ReviewPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const { data: project } = await supabase.from("projects").select("name").eq("id", id).maybeSingle();
  const { data: review } = await supabase
    .from("prototype_review")
    .select("*")
    .eq("project_id", id)
    .maybeSingle();

  if (!project || !review || (review as PrototypeReview).version === 0) {
    notFound();
  }

  const r = review as PrototypeReview;
  const report = r.gap_report;

  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-3xl px-8 py-10 text-[#0A1735]" dir="rtl">
        <div className="mb-6 print:hidden">
          <PrintButton />
        </div>

        <h1 className="font-display text-3xl">Prototype Review — {project.name}</h1>
        <p className="mt-1 text-sm text-slate-500">
          نسخة {r.version} · {r.completion_percentage}% مكتمل · {r.overall_status} · آخر تحديث:{" "}
          {new Date(r.updated_at).toLocaleString("ar-EG")}
        </p>
        <p dir="ltr" className="mt-1 text-left text-xs text-slate-400">
          {r.repo_url} @ {r.repo_ref.slice(0, 8)}
        </p>

        <Section title="User Stories">
          <ul className="space-y-2">
            {report.user_stories.map((s, i) => (
              <li key={i} className="break-inside-avoid">
                <p className="text-sm font-medium">{s.story}</p>
                <p className="text-xs text-slate-500">
                  {statusLabels[s.pm_override?.status ?? s.ai_status]}
                  {s.ai_gap ? ` — ${s.ai_gap}` : ""}
                </p>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Acceptance Criteria">
          <ul className="space-y-2">
            {report.acceptance_criteria_results.map((c, i) => (
              <li key={i} className="break-inside-avoid">
                <p className="text-sm font-medium">{c.criterion}</p>
                <p className="text-xs text-slate-500">
                  {statusLabels[c.pm_override?.status ?? c.ai_status]}
                  {c.ai_gap ? ` — ${c.ai_gap}` : ""}
                </p>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Missing Features">
          <BulletList items={report.missing_features} />
        </Section>
        <Section title="Scope Creep">
          <BulletList items={report.scope_creep} />
        </Section>
        <Section title="Non-Functional Gaps">
          <BulletList items={report.non_functional_gaps} />
        </Section>
        <Section title="Unresolved Risks">
          <BulletList items={report.unresolved_risks} />
        </Section>
        <Section title="Recommendation">
          <p className="text-sm">{report.recommendation_summary}</p>
        </Section>
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

function BulletList({ items }: { items: string[] }) {
  if (items.length === 0) return <p>—</p>;
  return (
    <ul className="list-disc space-y-1 pr-5">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}
