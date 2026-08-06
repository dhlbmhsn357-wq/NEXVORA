import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";
import type { ClientPresentation } from "@/lib/types/database";

/**
 * صفحة مشاركة عامة بدون تسجيل دخول — بتقرا عبر Share Token فقط
 * (Service Role Client موثوق، مش سياسة RLS مفتوحة). صفر أي تفاصيل
 * تقنية داخلية، الاعتماد بالكامل على slides_content كمصدر وحيد.
 *
 * ألوان ثابتة (hex) قصدًا بدل CSS Variables النظام (--v-*): الصفحة دي
 * عرض تقديمي (Pitch Deck) بهوية بصرية خاصة بيه بيتشاركها العميل
 * النهائي برّه لوحة التحكم — مش جزء من الـ Chrome الداخلي، فمش المفروض
 * تتبع Dark Mode النظام أو تتغيّر لو حد بدّل الـ Theme الداخلي. نفس
 * فلسفة PrintButton.tsx بالظبط لصفحات الطباعة.
 */
export default async function PresentSharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = createServiceClient();

  const { data: presentation } = await supabase
    .from("client_presentations")
    .select("*")
    .eq("share_token", token)
    .maybeSingle();

  if (!presentation || (presentation as ClientPresentation).version === 0) {
    notFound();
  }

  void supabase
    .from("client_presentations")
    .update({ share_token_last_used_at: new Date().toISOString() })
    .eq("share_token", token);

  const slides = (presentation as ClientPresentation).slides_content;
  // العروض المولّدة قبل توسعة الشرائح ماعندهاش المفاتيح الجديدة — نتعامل
  // معاها كـ Partial ونحرس كل شريحة جديدة بوجودها الفعلي.
  const s = slides as Partial<ClientPresentation["slides_content"]>;
  const dir = (presentation as ClientPresentation).language === "en" ? "ltr" : "rtl";

  return (
    <div className="min-h-screen bg-[#FBFDFF]" dir={dir}>
      {/* Cover */}
      <section className="flex min-h-screen flex-col items-center justify-center bg-[#0A1735] px-6 text-center">
        <p className="font-display mb-6 text-lg font-bold text-[#3D5CFF]">VELORA</p>
        <h1 className="font-display max-w-3xl text-4xl text-white sm:text-5xl">{slides.cover.title}</h1>
        <p className="mt-4 max-w-xl text-lg text-[#A8BCFF]">{slides.cover.subtitle}</p>
        <p className="mt-8 text-sm text-white/70">{slides.cover.client_name}</p>
      </section>

      <div className="mx-auto max-w-3xl space-y-16 px-6 py-20">
        {slides.agenda.items.length > 0 && (
          <Section title="جدول الأعمال">
            <ol className="grid grid-cols-1 gap-3 pr-5 text-lg text-[#475569] sm:grid-cols-2">
              {slides.agenda.items.map((item, i) => (
                <li key={i} className="list-decimal">
                  {item}
                </li>
              ))}
            </ol>
          </Section>
        )}

        <Section title={slides.executive_summary.title}>
          <p className="text-lg leading-relaxed text-[#475569]">{slides.executive_summary.body}</p>
          {slides.executive_summary.highlights.length > 0 && (
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {slides.executive_summary.highlights.map((h, i) => (
                <div key={i} className="rounded-[var(--v-radius-lg)] border border-[#E6EBF3] bg-white p-4 text-[#0A1735]">
                  {h}
                </div>
              ))}
            </div>
          )}
        </Section>

        {s.about_company && (
          <Section title={s.about_company.title}>
            <p className="text-lg leading-relaxed text-[#475569]">{s.about_company.body}</p>
          </Section>
        )}

        <Section title={slides.business_problem.title}>
          <p className="text-lg leading-relaxed text-[#475569]">{slides.business_problem.body}</p>
        </Section>

        <Section title={slides.current_situation.title}>
          <p className="text-lg leading-relaxed text-[#475569]">{slides.current_situation.body}</p>
          {slides.current_situation.points.length > 0 && (
            <ul className="mt-3 list-disc space-y-2 pr-5 text-lg text-[#475569]">
              {slides.current_situation.points.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ul>
          )}
        </Section>

        <Section title={slides.pain_points.title}>
          <ul className="list-disc space-y-2 pr-5 text-lg text-[#475569]">
            {slides.pain_points.items.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </Section>

        {s.our_understanding && (
          <Section title={s.our_understanding.title}>
            <p className="text-lg leading-relaxed text-[#475569]">{s.our_understanding.body}</p>
            {s.our_understanding.points.length > 0 && (
              <ul className="mt-3 list-disc space-y-2 pr-5 text-lg text-[#475569]">
                {s.our_understanding.points.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            )}
          </Section>
        )}

        {s.vision && (
          <Section title={s.vision.title}>
            <p className="text-lg leading-relaxed text-[#475569]">{s.vision.body}</p>
          </Section>
        )}

        <Section title={slides.solution.title}>
          <p className="text-lg leading-relaxed text-[#475569]">{slides.solution.body}</p>
        </Section>

        <Section title="نطاق العمل">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div>
              <p className="mb-2 text-sm font-bold text-[#16A34A]">داخل النطاق</p>
              <ul className="list-disc space-y-2 pr-5 text-base text-[#475569]">
                {slides.scope.in_scope.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="mb-2 text-sm font-bold text-[#94A3B8]">خارج النطاق الحالي</p>
              <ul className="list-disc space-y-2 pr-5 text-base text-[#475569]">
                {slides.scope.out_of_scope.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </div>
          </div>
        </Section>

        <Section title={slides.features.title}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {slides.features.features.map((f, i) => (
              <div key={i} className="rounded-[var(--v-radius-lg)] border border-[#E6EBF3] bg-white p-4 text-[#0A1735]">
                {f}
              </div>
            ))}
          </div>
        </Section>

        {s.modules && s.modules.items.length > 0 && (
          <Section title={s.modules.title}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {s.modules.items.map((m, i) => (
                <div key={i} className="rounded-[var(--v-radius-lg)] border border-[#E6EBF3] bg-white p-4 text-[#0A1735]">
                  {m}
                </div>
              ))}
            </div>
          </Section>
        )}

        {s.workflow && s.workflow.items.length > 0 && (
          <Section title={s.workflow.title}>
            <ol className="list-decimal space-y-2 pr-5 text-lg text-[#475569]">
              {s.workflow.items.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ol>
          </Section>
        )}

        {s.before_after && s.before_after.pairs.length > 0 && (
          <Section title={s.before_after.title}>
            <div className="space-y-3">
              {s.before_after.pairs.map((p, i) => (
                <div key={i} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="rounded-[var(--v-radius-lg)] border border-[#E6EBF3] bg-[#F8FAFC] p-4">
                    <p className="mb-1 text-xs font-bold text-[#94A3B8]">قبل</p>
                    <p className="text-base text-[#475569]">{p.before}</p>
                  </div>
                  <div className="rounded-[var(--v-radius-lg)] border border-[#16A34A]/30 bg-[#16A34A]/5 p-4">
                    <p className="mb-1 text-xs font-bold text-[#16A34A]">بعد</p>
                    <p className="text-base font-medium text-[#0A1735]">{p.after}</p>
                  </div>
                </div>
              ))}
            </div>
          </Section>
        )}

        {s.departments && s.departments.items.length > 0 && (
          <Section title={s.departments.title}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {s.departments.items.map((d, i) => (
                <div key={i} className="rounded-[var(--v-radius-lg)] border border-[#E6EBF3] bg-white p-4 text-[#0A1735]">
                  {d}
                </div>
              ))}
            </div>
          </Section>
        )}

        {s.user_roles && s.user_roles.items.length > 0 && (
          <Section title={s.user_roles.title}>
            <ul className="list-disc space-y-2 pr-5 text-lg text-[#475569]">
              {s.user_roles.items.map((u, i) => (
                <li key={i}>{u}</li>
              ))}
            </ul>
          </Section>
        )}

        {s.reports && s.reports.items.length > 0 && (
          <Section title={s.reports.title}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {s.reports.items.map((r, i) => (
                <div key={i} className="rounded-[var(--v-radius-lg)] border border-[#E6EBF3] bg-white p-4 text-[#0A1735]">
                  {r}
                </div>
              ))}
            </div>
          </Section>
        )}

        {s.ai_capabilities && s.ai_capabilities.items.length > 0 && (
          <Section title={s.ai_capabilities.title}>
            <ul className="list-disc space-y-2 pr-5 text-lg text-[#475569]">
              {s.ai_capabilities.items.map((a, i) => (
                <li key={i}>{a}</li>
              ))}
            </ul>
          </Section>
        )}

        {slides.timeline.phases.length > 0 && (
          <Section title={slides.timeline.title}>
            <div className="space-y-4">
              {slides.timeline.phases.map((p, i) => (
                <div key={i} className="rounded-[var(--v-radius-lg)] border border-[#E6EBF3] bg-white p-4">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-[#0A1735]">{p.name}</span>
                    <span className="text-sm text-[#3D5CFF]">{p.duration}</span>
                  </div>
                  <p className="mt-2 text-sm text-[#475569]">{p.description}</p>
                </div>
              ))}
            </div>
          </Section>
        )}

        <Section title={slides.architecture.title}>
          <p className="text-lg leading-relaxed text-[#475569]">{slides.architecture.description}</p>
          {slides.architecture.components.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {slides.architecture.components.map((c, i) => (
                <span key={i} className="rounded-full bg-[#0A1735] px-4 py-1.5 text-sm font-bold text-white">
                  {c}
                </span>
              ))}
            </div>
          )}
        </Section>

        {slides.risks.items.length > 0 && (
          <Section title={slides.risks.title}>
            <div className="space-y-3">
              {slides.risks.items.map((r, i) => (
                <div key={i} className="rounded-[var(--v-radius-lg)] border border-[#E6EBF3] bg-white p-4">
                  <p className="font-bold text-[#DC2626]">{r.risk}</p>
                  <p className="mt-1 text-sm text-[#475569]">{r.mitigation}</p>
                </div>
              ))}
            </div>
          </Section>
        )}

        {s.roi && s.roi.metrics.length > 0 && (
          <Section title={s.roi.title}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {s.roi.metrics.map((k, i) => (
                <div key={i} className="rounded-[var(--v-radius-lg)] border border-[#E6EBF3] bg-white p-4 text-center">
                  <p className="font-display text-3xl text-[#16A34A]">{k.value}</p>
                  <p className="mt-1 text-sm font-bold text-[#0A1735]">{k.name}</p>
                  <p className="mt-1 text-xs text-[#94A3B8]">{k.description}</p>
                </div>
              ))}
            </div>
          </Section>
        )}

        {slides.roadmap.milestones.length > 0 && (
          <Section title={slides.roadmap.title}>
            <div className="space-y-3">
              {slides.roadmap.milestones.map((m, i) => (
                <div key={i} className="flex items-center justify-between rounded-[var(--v-radius-lg)] border border-[#E6EBF3] bg-white p-4">
                  <span className="font-bold text-[#0A1735]">{m.name}</span>
                  <span className="text-sm text-[#3D5CFF]">{m.target_date}</span>
                </div>
              ))}
            </div>
          </Section>
        )}

        {s.transformation && (
          <Section title={s.transformation.title}>
            <p className="text-lg leading-relaxed text-[#475569]">{s.transformation.body}</p>
            {s.transformation.points.length > 0 && (
              <ul className="mt-3 list-disc space-y-2 pr-5 text-lg text-[#475569]">
                {s.transformation.points.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            )}
          </Section>
        )}

        {slides.kpis.metrics.length > 0 && (
          <Section title={slides.kpis.title}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {slides.kpis.metrics.map((k, i) => (
                <div key={i} className="rounded-[var(--v-radius-lg)] border border-[#E6EBF3] bg-white p-4 text-center">
                  <p className="font-display text-3xl text-[#3D5CFF]">{k.value}</p>
                  <p className="mt-1 text-sm font-bold text-[#0A1735]">{k.name}</p>
                  <p className="mt-1 text-xs text-[#94A3B8]">{k.description}</p>
                </div>
              ))}
            </div>
          </Section>
        )}

        <Section title={slides.next_steps.title}>
          <ol className="list-decimal space-y-2 pr-5 text-lg text-[#475569]">
            {slides.next_steps.items.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ol>
        </Section>

        {slides.qa.items.length > 0 && (
          <Section title={slides.qa.title}>
            <ul className="list-disc space-y-2 pr-5 text-lg text-[#475569]">
              {slides.qa.items.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </Section>
        )}
      </div>

      <section className="flex min-h-[60vh] flex-col items-center justify-center bg-[#0A1735] px-6 text-center">
        <h2 className="font-display max-w-2xl text-3xl text-white">{slides.closing.title}</h2>
        <p className="mt-4 max-w-xl text-lg text-[#A8BCFF]">{slides.closing.body}</p>
        <p className="mt-10 text-sm font-bold text-[#3D5CFF]">VELORA</p>
      </section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="font-display mb-4 text-2xl text-[#0A1735]">{title}</h2>
      {children}
    </div>
  );
}
