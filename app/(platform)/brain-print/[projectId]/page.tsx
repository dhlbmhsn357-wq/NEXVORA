import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PrintButton from "@/components/ui/PrintButton";
import { ProjectModeBanner } from "@/app/(platform)/_shared/project-mode-banner";
import { getLatestBrainDocument } from "@/lib/brain-v2/service";
import {
  BRAIN_SECTIONS,
  BRAIN_SECTION_LABELS,
  type BrainContent,
  type BrainSectionKey,
  type Section,
} from "@/lib/brain-v2/types";
import "@/app/print.css";

/**
 * صفحة PDF لـ Project Brain — كل الأقسام الـ19 مع النسخة والحالة.
 * محمية بفحص تسجيل الدخول. مطبعة عبر متصفح Chrome (Ctrl+P → Save as PDF).
 */
export default async function BrainPrintPage({
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
    .select("name, mode")
    .eq("id", projectId)
    .maybeSingle();

  const doc = await getLatestBrainDocument(supabase, projectId);
  if (!project || !doc) notFound();

  const content = doc.content as BrainContent;

  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-3xl px-8 py-10 text-[#0A1735]" dir="rtl">
        <div className="no-print mb-4 rounded border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
          💡 <strong>لأنظف PDF:</strong> اضغط Ctrl+P ← More Settings ← uncheck &quot;Headers and footers&quot;. ثم Save as PDF.
        </div>
        <div className="no-print mb-6">
          <PrintButton />
        </div>

        <ProjectModeBanner mode={(project as { mode?: string | null }).mode ?? null} />

        <header className="border-b-2 border-[#3D5CFF] pb-3">
          <h1 className="font-display text-3xl">Project Brain — {project.name}</h1>
          <p className="mt-1 text-sm text-slate-500">
            نسخة v{doc.version} · الحالة: {statusLabel(doc.status)}
            {doc.approved_at
              ? ` · اعتُمد ${new Date(doc.approved_at).toLocaleDateString("ar-EG")}`
              : ` · أُنشئ ${new Date(doc.created_at).toLocaleDateString("ar-EG")}`}
          </p>
          {typeof doc.completeness_score === "number" && (
            <p className="mt-1 text-xs text-slate-500">اكتمال: {doc.completeness_score}%</p>
          )}
        </header>

        {BRAIN_SECTIONS.map((key) => (
          <Section key={key} title={BRAIN_SECTION_LABELS[key]}>
            <SectionRenderer sectionKey={key} section={content[key]} />
          </Section>
        ))}
      </div>
    </div>
  );
}

function statusLabel(s: string): string {
  const map: Record<string, string> = {
    draft: "مسودّة",
    in_review: "قيد المراجعة",
    approved: "معتمَدة",
    archived: "مؤرشفة",
    rejected: "مرفوضة",
  };
  return map[s] ?? s;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-6 break-inside-avoid">
      <h2 className="border-b border-slate-200 pb-1 font-display text-lg">{title}</h2>
      <div className="mt-2 text-sm leading-relaxed text-slate-700">{children}</div>
    </div>
  );
}

function Empty() {
  return <p className="text-slate-400">— لم يُملأ بعد —</p>;
}

function BulletList({ items }: { items: string[] }) {
  if (!items || items.length === 0) return <Empty />;
  return (
    <ul className="list-disc space-y-1 pr-5">
      {items.map((it, i) => (
        <li key={i}>{it}</li>
      ))}
    </ul>
  );
}

// حسب شكل content لكل قسم
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function SectionRenderer({ sectionKey, section }: { sectionKey: BrainSectionKey; section: Section<any> | undefined }) {
  if (!section) return <Empty />;
  const c = section.content;
  const isEmptyArray = Array.isArray(c) && c.length === 0;
  const isEmptyString = typeof c === "string" && !c.trim();
  if (c === null || c === undefined || isEmptyArray || isEmptyString) return <Empty />;

  switch (sectionKey) {
    case "executive_summary":
      return <p className="whitespace-pre-wrap">{String(c)}</p>;
    case "business_model": {
      const b = c as { overview: string; how_it_works: string; value_delivery: string; users_description: string };
      return (
        <div className="space-y-2">
          {b.overview && <p><strong>نظرة عامة:</strong> {b.overview}</p>}
          {b.how_it_works && <p><strong>آلية العمل:</strong> {b.how_it_works}</p>}
          {b.value_delivery && <p><strong>تسليم القيمة:</strong> {b.value_delivery}</p>}
          {b.users_description && <p><strong>وصف المستخدمين:</strong> {b.users_description}</p>}
        </div>
      );
    }
    case "business_goals":
      return (
        <ul className="list-disc space-y-1 pr-5">
          {(c as { statement: string; priority: string }[]).map((it, i) => (
            <li key={i}>
              {it.statement} <span className="text-xs text-slate-500">[{it.priority}]</span>
            </li>
          ))}
        </ul>
      );
    case "stakeholders":
      return (
        <ul className="list-disc space-y-1 pr-5">
          {(c as { name: string; role: string; influence: string }[]).map((it, i) => (
            <li key={i}>
              <strong>{it.name}</strong> — {it.role} <span className="text-xs text-slate-500">[نفوذ: {it.influence}]</span>
            </li>
          ))}
        </ul>
      );
    case "business_rules":
      return (
        <ul className="list-disc space-y-1 pr-5">
          {(c as { rule: string; rationale: string }[]).map((it, i) => (
            <li key={i}>
              {it.rule}
              {it.rationale && <span className="block text-xs text-slate-500">— {it.rationale}</span>}
            </li>
          ))}
        </ul>
      );
    case "functional_requirements":
      return <BulletList items={(c as { statement: string }[]).map((x) => x.statement)} />;
    case "non_functional_requirements": {
      const n = c as Record<string, { statement: string }[]>;
      const labels: Record<string, string> = {
        performance: "الأداء",
        security: "الأمن",
        scalability: "قابلية التوسع",
        availability: "الإتاحة",
        accessibility: "الوصولية",
        compliance: "الامتثال",
      };
      const groups = Object.keys(labels).filter((k) => (n[k] ?? []).length > 0);
      if (groups.length === 0) return <Empty />;
      return (
        <div className="space-y-2">
          {groups.map((k) => (
            <div key={k}>
              <p className="font-semibold">{labels[k]}</p>
              <BulletList items={n[k].map((x) => x.statement)} />
            </div>
          ))}
        </div>
      );
    }
    case "constraints":
      return (
        <ul className="list-disc space-y-1 pr-5">
          {(c as { constraint: string; type: string }[]).map((it, i) => (
            <li key={i}>{it.constraint} <span className="text-xs text-slate-500">[{it.type}]</span></li>
          ))}
        </ul>
      );
    case "assumptions":
      return (
        <ul className="list-disc space-y-1 pr-5">
          {(c as { statement: string; reason: string }[]).map((it, i) => (
            <li key={i}>
              {it.statement}
              {it.reason && <span className="block text-xs text-slate-500">— {it.reason}</span>}
            </li>
          ))}
        </ul>
      );
    case "risks":
      return (
        <ul className="list-disc space-y-1 pr-5">
          {(c as { risk: string; cause: string; likelihood: string; impact: string }[]).map((it, i) => (
            <li key={i}>
              <strong>{it.risk}</strong>
              {it.cause && <span className="block text-xs text-slate-500">السبب: {it.cause}</span>}
              <span className="text-xs text-slate-500">احتمال: {it.likelihood} · أثر: {it.impact}</span>
            </li>
          ))}
        </ul>
      );
    case "known_facts":
      return (
        <ul className="list-disc space-y-1 pr-5">
          {(c as { fact: string; category: string }[]).map((it, i) => (
            <li key={i}>{it.fact} <span className="text-xs text-slate-500">[{it.category}]</span></li>
          ))}
        </ul>
      );
    case "missing_information":
      return (
        <ul className="list-disc space-y-1 pr-5">
          {(c as { info: string; impact: string; reason: string }[]).map((it, i) => (
            <li key={i}>
              {it.info} <span className="text-xs text-slate-500">[أثر: {it.impact}]</span>
              {it.reason && <span className="block text-xs text-slate-500">— {it.reason}</span>}
            </li>
          ))}
        </ul>
      );
    case "user_roles":
      return (
        <ul className="list-disc space-y-1 pr-5">
          {(c as { role: string; responsibilities: string[] }[]).map((it, i) => (
            <li key={i}>
              <strong>{it.role}</strong>
              {it.responsibilities && it.responsibilities.length > 0 && (
                <ul className="mt-1 list-[circle] space-y-0.5 pr-5 text-xs text-slate-600">
                  {it.responsibilities.map((r, j) => (<li key={j}>{r}</li>))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      );
    case "suggested_features":
    case "suggested_integrations":
      return (
        <ul className="list-disc space-y-1 pr-5">
          {(c as { title: string; rationale: string; priority: string }[]).map((it, i) => (
            <li key={i}>
              <strong>{it.title}</strong> <span className="text-xs text-slate-500">[{it.priority}]</span>
              {it.rationale && <span className="block text-xs text-slate-500">— {it.rationale}</span>}
            </li>
          ))}
        </ul>
      );
    case "suggested_kpis":
      return (
        <ul className="list-disc space-y-1 pr-5">
          {(c as { name: string; target_or_direction: string; goal_link: string }[]).map((it, i) => (
            <li key={i}>
              <strong>{it.name}</strong> — {it.target_or_direction}
              {it.goal_link && <span className="block text-xs text-slate-500">مرتبط بـ: {it.goal_link}</span>}
            </li>
          ))}
        </ul>
      );
    case "project_scope": {
      const s = c as { in_scope: { statement: string }[]; out_of_scope: { statement: string }[] };
      return (
        <div className="space-y-2">
          <div>
            <p className="font-semibold text-[#16A34A]">داخل النطاق</p>
            <BulletList items={(s.in_scope ?? []).map((x) => x.statement)} />
          </div>
          <div>
            <p className="font-semibold text-slate-500">خارج النطاق</p>
            <BulletList items={(s.out_of_scope ?? []).map((x) => x.statement)} />
          </div>
        </div>
      );
    }
    case "roadmap":
      return (
        <ol className="list-decimal space-y-2 pr-5">
          {(c as { phase: string; description: string; deliverables: string[] }[]).map((it, i) => (
            <li key={i}>
              <strong>{it.phase}</strong>
              {it.description && <p className="text-xs text-slate-600">{it.description}</p>}
              {it.deliverables && it.deliverables.length > 0 && (
                <ul className="mt-1 list-[circle] space-y-0.5 pr-5 text-xs text-slate-600">
                  {it.deliverables.map((d, j) => (<li key={j}>{d}</li>))}
                </ul>
              )}
            </li>
          ))}
        </ol>
      );
    case "meeting_questions":
      return (
        <ul className="list-disc space-y-1 pr-5">
          {(c as { question: string; reason: string; priority: string }[]).map((it, i) => (
            <li key={i}>
              {it.question} <span className="text-xs text-slate-500">[{it.priority}]</span>
              {it.reason && <span className="block text-xs text-slate-500">— {it.reason}</span>}
            </li>
          ))}
        </ul>
      );
    default:
      return <pre className="whitespace-pre-wrap text-xs">{JSON.stringify(c, null, 2)}</pre>;
  }
}
