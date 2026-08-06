import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PrintButton from "@/components/ui/PrintButton";
import { sectionHeadings } from "@/lib/developer-handoff/export";
import type { DeveloperHandoff } from "@/lib/types/database";

/**
 * صفحة مستقلة (خارج تخطيط /dashboard) مُعدّة للطباعة/تصدير PDF لحزمة
 * Developer Handoff — بدون Header أو Navigation، بس محمية بنفس فحص
 * تسجيل الدخول (نفس نمط prd-print / prototype-review-print).
 */
export default async function DeveloperHandoffPrintPage({
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
  const { data: handoff } = await supabase
    .from("developer_handoff")
    .select("*")
    .eq("project_id", id)
    .maybeSingle();

  if (!project || !handoff || (handoff as DeveloperHandoff).version === 0) {
    notFound();
  }

  const h = handoff as DeveloperHandoff;
  const content = h.package_content;

  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-3xl px-8 py-10 text-[#0A1735]" dir="rtl">
        <div className="mb-6 print:hidden">
          <PrintButton />
        </div>

        <h1 className="font-display text-3xl">Developer Handoff Package — {project.name}</h1>
        <p className="mt-1 text-sm text-slate-500">
          نسخة {h.version} · {h.handoff_status} · آخر تحديث: {new Date(h.updated_at).toLocaleString("ar-EG")}
        </p>
        <p dir="ltr" className="mt-1 text-left text-xs text-slate-400">
          {h.repo_url} @ {h.repo_ref.slice(0, 8)}
        </p>

        <Section title={sectionHeadings.project_overview}>
          <p className="text-sm leading-relaxed">{content.project_overview.summary}</p>
        </Section>

        <Section title={sectionHeadings.repository_environment}>
          <p className="text-sm">
            <strong>Repository:</strong> {content.repository_environment.repo_url || "—"}
          </p>
          <p className="text-sm">
            <strong>Branch/Commit:</strong> {content.repository_environment.repo_ref || "—"}
          </p>
          <p className="mt-2 text-sm font-medium">Local Setup Steps:</p>
          <BulletList items={content.repository_environment.setup_steps} />
        </Section>

        <Section title={sectionHeadings.expected_behavior}>
          <ol className="list-decimal space-y-1 pr-5 text-sm">
            {content.expected_behavior.items.map((item, i) => (
              <li key={i}>{item.statement}</li>
            ))}
          </ol>
        </Section>

        <Section title={sectionHeadings.known_state}>
          <p className="mb-1 text-sm font-medium">User Stories</p>
          <ul className="mb-3 space-y-1 text-sm">
            {content.known_state.user_stories.map((s, i) => (
              <li key={i} className="break-inside-avoid">
                {s.story} — {s.pm_override?.status ?? s.ai_status}
              </li>
            ))}
          </ul>
          <p className="mb-1 text-sm font-medium">Acceptance Criteria</p>
          <ul className="mb-3 space-y-1 text-sm">
            {content.known_state.acceptance_criteria_results.map((c, i) => (
              <li key={i} className="break-inside-avoid">
                {c.criterion} — {c.pm_override?.status ?? c.ai_status}
              </li>
            ))}
          </ul>
          <p className="mb-1 text-sm font-medium">Missing Features</p>
          <BulletList items={content.known_state.missing_features} />
          <p className="mb-1 mt-3 text-sm font-medium">Unresolved Risks</p>
          <BulletList items={content.known_state.unresolved_risks} />
        </Section>

        <Section title={sectionHeadings.review_focus_areas}>
          <ul className="space-y-1 text-sm">
            {content.review_focus_areas.items.map((item, i) => (
              <li key={i} className="break-inside-avoid">
                <strong>{item.area}</strong> ({item.priority}) — {item.reason}
              </li>
            ))}
          </ul>
        </Section>

        <Section title={sectionHeadings.bug_reporting_format}>
          <p className="whitespace-pre-wrap text-sm">{content.bug_reporting_format.template}</p>
        </Section>

        <Section title={sectionHeadings.review_acceptance_criteria}>
          <BulletList items={content.review_acceptance_criteria.items} />
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
