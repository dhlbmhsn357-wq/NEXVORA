import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";
import { sectionHeadings } from "@/lib/developer-handoff/export";
import type { DeveloperHandoff } from "@/lib/types/database";

/**
 * صفحة مشاركة عامة بدون تسجيل دخول — بتقرا عبر Share Token فقط (Service
 * Role Client موثوق، مش سياسة RLS مفتوحة). Read-Only بالكامل، صفر أي
 * تفاصيل خارج package_content (مفيش access_credentials_ref هنا نهائيًا).
 *
 * ألوان hex ثابتة قصدًا (مش --v-* tokens) — نفس سبب present/[token]:
 * صفحة مشاركة خارجية بهوية بصرية مستقلة عن الـ Chrome الداخلي.
 */
export default async function DeveloperHandoffSharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = createServiceClient();

  const { data: handoff } = await supabase
    .from("developer_handoff")
    .select(
      "id, project_id, package_content, repo_url, repo_ref, handoff_status, version, updated_at, share_token"
    )
    .eq("share_token", token)
    .maybeSingle();

  if (!handoff || (handoff as DeveloperHandoff).version === 0) {
    notFound();
  }

  void supabase
    .from("developer_handoff")
    .update({ share_token_last_used_at: new Date().toISOString() })
    .eq("share_token", token);

  const h = handoff as DeveloperHandoff;
  const content = h.package_content;

  return (
    <div className="min-h-screen bg-[#FBFDFF]" dir="rtl">
      <div className="mx-auto max-w-3xl px-6 py-16 text-[#0A1735]">
        <p className="font-display mb-2 text-sm font-bold text-[#3D5CFF]">VELORA — Developer Review Handoff</p>
        <h1 className="font-display text-3xl">حزمة مراجعة (Read Only)</h1>
        <p className="mt-1 text-sm text-[#64748B]">
          نسخة {h.version} · {h.handoff_status} · آخر تحديث: {new Date(h.updated_at).toLocaleString("ar-EG")}
        </p>
        <p dir="ltr" className="mt-1 text-left text-xs text-[#94A3B8]">
          {h.repo_url} @ {h.repo_ref.slice(0, 8)}
        </p>

        <Section title={sectionHeadings.project_overview}>
          <p className="text-base leading-relaxed text-[#475569]">{content.project_overview.summary}</p>
        </Section>

        <Section title={sectionHeadings.repository_environment}>
          <p className="text-sm text-[#475569]">
            <strong>Repository:</strong> {content.repository_environment.repo_url || "—"}
          </p>
          <p className="text-sm text-[#475569]">
            <strong>Branch/Commit:</strong> {content.repository_environment.repo_ref || "—"}
          </p>
          <p className="mt-3 text-sm font-medium text-[#0A1735]">Local Setup Steps</p>
          <BulletList items={content.repository_environment.setup_steps} />
        </Section>

        <Section title={sectionHeadings.expected_behavior}>
          <ol className="list-decimal space-y-2 pr-5 text-base text-[#475569]">
            {content.expected_behavior.items.map((item, i) => (
              <li key={i}>{item.statement}</li>
            ))}
          </ol>
        </Section>

        <Section title={sectionHeadings.known_state}>
          <p className="mb-2 text-sm font-medium text-[#0A1735]">User Stories</p>
          <ul className="mb-4 space-y-1 text-sm text-[#475569]">
            {content.known_state.user_stories.map((s, i) => (
              <li key={i}>
                {s.story} — <strong>{s.pm_override?.status ?? s.ai_status}</strong>
              </li>
            ))}
          </ul>
          <p className="mb-2 text-sm font-medium text-[#0A1735]">Acceptance Criteria</p>
          <ul className="mb-4 space-y-1 text-sm text-[#475569]">
            {content.known_state.acceptance_criteria_results.map((c, i) => (
              <li key={i}>
                {c.criterion} — <strong>{c.pm_override?.status ?? c.ai_status}</strong>
              </li>
            ))}
          </ul>
          <p className="mb-2 text-sm font-medium text-[#0A1735]">Missing Features</p>
          <BulletList items={content.known_state.missing_features} />
          <p className="mb-2 mt-4 text-sm font-medium text-[#0A1735]">Unresolved Risks</p>
          <BulletList items={content.known_state.unresolved_risks} />
        </Section>

        <Section title={sectionHeadings.review_focus_areas}>
          <ul className="space-y-2 text-base text-[#475569]">
            {content.review_focus_areas.items.map((item, i) => (
              <li key={i}>
                <strong>{item.area}</strong> ({item.priority}) — {item.reason}
              </li>
            ))}
          </ul>
        </Section>

        <Section title={sectionHeadings.bug_reporting_format}>
          <p className="whitespace-pre-wrap text-sm text-[#475569]">{content.bug_reporting_format.template}</p>
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
    <div className="mt-10">
      <h2 className="font-display mb-3 text-xl text-[#0A1735]">{title}</h2>
      {children}
    </div>
  );
}

function BulletList({ items }: { items: string[] }) {
  if (items.length === 0) return <p className="text-sm text-[#475569]">لا يوجد محتوى في هذا القسم بعد.</p>;
  return (
    <ul className="list-disc space-y-1 pr-5 text-sm text-[#475569]">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}
