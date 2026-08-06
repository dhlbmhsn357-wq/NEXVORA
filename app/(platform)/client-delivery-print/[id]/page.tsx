import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PrintButton from "@/components/ui/PrintButton";
import type { ClientPresentation, ClientPresentationSlides } from "@/lib/types/database";

/**
 * صفحة مستقلة (خارج تخطيط /dashboard) لتصدير العرض التنفيذي كـ PDF —
 * تُقدَّم كمستند متصل مُهيّأ للطباعة (مش الديك ملء الشاشة)، وهو الأنسب
 * لـ PDF. محمية بنفس فحص تسجيل الدخول. الصيغة الثالثة بجانب PPTX +
 * HTML التفاعلي. أعمال-فقط، بدون أي كشف تقني.
 */
export default async function ClientDeliveryPrintPage({
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
  const { data: presentation } = await supabase
    .from("client_presentations")
    .select("*")
    .eq("project_id", id)
    .maybeSingle();

  if (!project || !presentation || (presentation as ClientPresentation).version === 0) {
    notFound();
  }

  const slides = (presentation as ClientPresentation).slides_content;
  const s = slides as Partial<ClientPresentationSlides>;
  const dir = (presentation as ClientPresentation).language === "en" ? "ltr" : "rtl";

  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-3xl px-8 py-10 text-[#0A1735]" dir={dir}>
        <div className="mb-6 print:hidden">
          <PrintButton />
        </div>

        {/* Cover */}
        <header className="border-b-2 border-[#3D5CFF] pb-4">
          <p className="text-sm font-bold tracking-widest text-[#3D5CFF]">VELORA</p>
          <h1 className="font-display mt-2 text-3xl">{slides.cover.title}</h1>
          <p className="mt-1 text-lg text-slate-600">{slides.cover.subtitle}</p>
          <p className="mt-2 text-sm text-slate-500">{slides.cover.client_name} · {project.name}</p>
        </header>

        {slides.agenda.items.length > 0 && (
          <Section title="جدول الأعمال">
            <BulletList items={slides.agenda.items} ordered />
          </Section>
        )}

        <Narrative title={slides.executive_summary.title} body={slides.executive_summary.body} points={slides.executive_summary.highlights} />
        {s.about_company && <Narrative title={s.about_company.title} body={s.about_company.body} />}
        <Narrative title={slides.business_problem.title} body={slides.business_problem.body} />
        <Narrative title={slides.current_situation.title} body={slides.current_situation.body} points={slides.current_situation.points} />
        <Section title={slides.pain_points.title}><BulletList items={slides.pain_points.items} /></Section>
        {s.our_understanding && <Narrative title={s.our_understanding.title} body={s.our_understanding.body} points={s.our_understanding.points} />}
        {s.vision && <Narrative title={s.vision.title} body={s.vision.body} />}
        <Narrative title={slides.solution.title} body={slides.solution.body} />

        <Section title="نطاق العمل">
          <p className="mb-1 font-bold text-[#16A34A]">داخل النطاق</p>
          <BulletList items={slides.scope.in_scope} />
          <p className="mb-1 mt-3 font-bold text-slate-500">خارج النطاق الحالي</p>
          <BulletList items={slides.scope.out_of_scope} />
        </Section>

        <Section title={slides.features.title}><BulletList items={slides.features.features} /></Section>
        {s.modules && <Section title={s.modules.title}><BulletList items={s.modules.items} /></Section>}
        {s.workflow && <Section title={s.workflow.title}><BulletList items={s.workflow.items} ordered /></Section>}

        {s.before_after && s.before_after.pairs.length > 0 && (
          <Section title={s.before_after.title}>
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className="border border-slate-300 bg-slate-100 p-2 text-right">قبل</th>
                  <th className="border border-slate-300 bg-[#16A34A]/10 p-2 text-right">بعد</th>
                </tr>
              </thead>
              <tbody>
                {s.before_after.pairs.map((p, i) => (
                  <tr key={i}>
                    <td className="border border-slate-300 p-2 align-top text-slate-600">{p.before}</td>
                    <td className="border border-slate-300 p-2 align-top font-medium">{p.after}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
        )}

        {s.departments && <Section title={s.departments.title}><BulletList items={s.departments.items} /></Section>}
        {s.user_roles && <Section title={s.user_roles.title}><BulletList items={s.user_roles.items} /></Section>}
        {s.reports && <Section title={s.reports.title}><BulletList items={s.reports.items} /></Section>}
        {s.ai_capabilities && <Section title={s.ai_capabilities.title}><BulletList items={s.ai_capabilities.items} /></Section>}

        {slides.timeline.phases.length > 0 && (
          <Section title={slides.timeline.title}>
            <ul className="space-y-2">
              {slides.timeline.phases.map((p, i) => (
                <li key={i}>
                  <strong>{p.name}</strong> — <span className="text-[#3D5CFF]">{p.duration}</span>
                  <p className="text-slate-600">{p.description}</p>
                </li>
              ))}
            </ul>
          </Section>
        )}

        <Section title={slides.architecture.title}>
          <p>{slides.architecture.description}</p>
          {slides.architecture.components.length > 0 && (
            <p className="mt-2 text-slate-600">{slides.architecture.components.join(" · ")}</p>
          )}
        </Section>

        {slides.risks.items.length > 0 && (
          <Section title={slides.risks.title}>
            <ul className="list-disc space-y-1 pr-5">
              {slides.risks.items.map((r, i) => (
                <li key={i}><strong className="text-[#DC2626]">{r.risk}</strong> — {r.mitigation}</li>
              ))}
            </ul>
          </Section>
        )}

        {s.roi && s.roi.metrics.length > 0 && <Metrics title={s.roi.title} metrics={s.roi.metrics} accent="#16A34A" />}
        {slides.kpis.metrics.length > 0 && <Metrics title={slides.kpis.title} metrics={slides.kpis.metrics} accent="#3D5CFF" />}

        {slides.roadmap.milestones.length > 0 && (
          <Section title={slides.roadmap.title}>
            <ul className="list-disc space-y-1 pr-5">
              {slides.roadmap.milestones.map((m, i) => (
                <li key={i}><strong>{m.name}</strong> — <span className="text-[#3D5CFF]">{m.target_date}</span>: {m.description}</li>
              ))}
            </ul>
          </Section>
        )}

        {s.transformation && <Narrative title={s.transformation.title} body={s.transformation.body} points={s.transformation.points} />}
        <Section title={slides.next_steps.title}><BulletList items={slides.next_steps.items} ordered /></Section>
        {slides.qa.items.length > 0 && <Section title={slides.qa.title}><BulletList items={slides.qa.items} /></Section>}

        <footer className="mt-8 break-inside-avoid border-t-2 border-[#3D5CFF] pt-4">
          <h2 className="font-display text-xl">{slides.closing.title}</h2>
          <p className="mt-1 text-slate-600">{slides.closing.body}</p>
          <p className="mt-3 text-sm font-bold tracking-widest text-[#3D5CFF]">VELORA</p>
        </footer>
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

function Narrative({ title, body, points }: { title: string; body: string; points?: string[] }) {
  return (
    <Section title={title}>
      <p>{body}</p>
      {points && points.length > 0 && <BulletList items={points} />}
    </Section>
  );
}

function Metrics({ title, metrics, accent }: { title: string; metrics: { name: string; value: string; description: string }[]; accent: string }) {
  return (
    <Section title={title}>
      <div className="grid grid-cols-3 gap-3">
        {metrics.map((m, i) => (
          <div key={i} className="rounded border border-slate-200 p-3 text-center">
            <p className="font-display text-2xl" style={{ color: accent }}>{m.value}</p>
            <p className="mt-1 text-xs font-bold">{m.name}</p>
            <p className="mt-1 text-[11px] text-slate-500">{m.description}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}

function BulletList({ items, ordered }: { items: string[]; ordered?: boolean }) {
  if (items.length === 0) return <p className="text-slate-400">لا توجد بيانات كافية بعد.</p>;
  const cls = "space-y-1 pr-5 " + (ordered ? "list-decimal" : "list-disc");
  return <ul className={cls}>{items.map((item, i) => <li key={i}>{item}</li>)}</ul>;
}
