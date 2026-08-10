import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PrintButton from "@/components/ui/PrintButton";
import { ProjectModeBanner } from "@/app/(platform)/_shared/project-mode-banner";
import type { AcceptanceCriterion, UserStory } from "@/lib/types/database";
import "@/app/print.css";

/**
 * صفحة مستقلة (خارج تخطيط /dashboard) مُعدّة للطباعة/تصدير PDF —
 * بدون أي Header أو Navigation، بس محمية بنفس فحص تسجيل الدخول.
 */
export default async function PRDPrintPage({
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

  const { data: project } = await supabase
    .from("projects")
    .select("name, mode")
    .eq("id", id)
    .maybeSingle();

  const { data: prd } = await supabase.from("prd").select("*").eq("project_id", id).maybeSingle();

  if (!project || !prd) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-3xl px-8 py-10 text-[#0A1735]" dir="rtl">
        <div className="no-print mb-4 rounded border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
          💡 <strong>لأنظف PDF:</strong> اضغط Ctrl+P ← More Settings ← uncheck &quot;Headers and footers&quot;. ثم Save as PDF.
        </div>
        <div className="mb-6 no-print">
          <PrintButton />
        </div>

        <ProjectModeBanner mode={(project as { mode?: string | null }).mode ?? null} />

        <h1 className="font-display text-3xl">PRD — {project.name}</h1>
        <p className="mt-1 text-sm text-slate-500">
          نسخة {prd.version} · آخر تحديث: {new Date(prd.updated_at).toLocaleString("ar-EG")}
        </p>

        <Section title="نظرة عامة">
          <p>{prd.overview || "—"}</p>
        </Section>

        <Section title="بيان المشكلة">
          <p>{prd.problem_statement || "—"}</p>
        </Section>

        <Section title="الأهداف">
          <BulletList items={prd.goals} />
        </Section>

        <Section title="خارج النطاق">
          <BulletList items={prd.out_of_scope} />
        </Section>

        <Section title="المستخدمون المستهدفون">
          <BulletList items={prd.target_users} />
        </Section>

        <Section title="قصص المستخدم">
          {prd.user_stories.length === 0 ? (
            <p>—</p>
          ) : (
            <ul className="list-disc space-y-1 pr-5">
              {(prd.user_stories as UserStory[]).map((s, i) => (
                <li key={i}>
                  {s.role}، {s.want}، {s.benefit}
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="معايير القبول">
          {prd.acceptance_criteria.length === 0 ? (
            <p>—</p>
          ) : (
            <ul className="list-disc space-y-1 pr-5">
              {(prd.acceptance_criteria as AcceptanceCriterion[]).map((c, i) => (
                <li key={i}>
                  <strong>Given</strong> {c.given} <strong>When</strong> {c.when} <strong>Then</strong>{" "}
                  {c.then}
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="المتطلبات الوظيفية">
          <BulletList items={prd.functional_requirements} />
        </Section>

        <Section title="المتطلبات غير الوظيفية">
          <BulletList items={prd.non_functional_requirements} />
        </Section>

        <Section title="المخاطر والافتراضات">
          <BulletList items={prd.risks_assumptions} />
        </Section>

        <Section title="مؤشرات النجاح">
          <BulletList items={prd.success_metrics} />
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
