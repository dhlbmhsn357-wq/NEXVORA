import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PrintButton from "@/components/ui/PrintButton";
import {
  ANALYSIS_SECTIONS,
  SECTION_LABELS,
  type AnalysisSectionKey,
  type DiscoveryAnalysisOutput,
  type DiscoveryAnalysisRow,
  type EvidenceRef,
  type SectionConfidence,
} from "@/lib/discovery-analysis/types";
import "@/app/print.css";

/**
 * صفحة PDF لتحليل الاكتشاف — 17 قسمًا مع الاستشهادات ومستوى الثقة.
 */
export default async function AnalysisPrintPage({
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

  const { data: analysis } = await supabase
    .from("discovery_analyses")
    .select("*")
    .eq("project_id", projectId)
    .eq("status", "completed")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!project || !analysis) notFound();

  const row = analysis as DiscoveryAnalysisRow;
  const output = row.output;
  if (!output) notFound();

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
          <h1 className="font-display text-3xl">تحليل الاكتشاف — {project.name}</h1>
          <p className="mt-1 text-sm text-slate-500">
            v{row.version} · {row.finished_at ? `اكتمل ${new Date(row.finished_at).toLocaleDateString("ar-EG")}` : ""}
            {row.model ? ` · ${row.model}` : ""}
          </p>
        </header>

        {ANALYSIS_SECTIONS.map((key) => (
          <SectionBlock key={key} title={SECTION_LABELS[key]} sectionKey={key} output={output} />
        ))}
      </div>
    </div>
  );
}

function ConfidenceBadge({ c }: { c?: SectionConfidence }) {
  if (!c) return null;
  const score = c.score;
  const style =
    score >= 75
      ? { background: "#DCFCE7", color: "#166534", border: "#86EFAC" }
      : score >= 50
        ? { background: "#FEF3C7", color: "#92400E", border: "#FCD34D" }
        : { background: "#FEE2E2", color: "#991B1B", border: "#FCA5A5" };
  return (
    <span
      className="inline-block rounded-full border px-2 py-0.5 text-[10px] font-semibold"
      style={{ backgroundColor: style.background, color: style.color, borderColor: style.border }}
    >
      ثقة {score}%{c.reason ? ` — ${c.reason}` : ""}
    </span>
  );
}

function Section({ title, confidence, children }: { title: string; confidence?: SectionConfidence; children: React.ReactNode }) {
  return (
    <div className="mt-6 break-inside-avoid">
      <div className="flex items-center justify-between border-b border-slate-200 pb-1">
        <h2 className="font-display text-lg">{title}</h2>
        <ConfidenceBadge c={confidence} />
      </div>
      <div className="mt-2 text-sm leading-relaxed text-slate-700">{children}</div>
    </div>
  );
}

function Empty() {
  return <p className="text-slate-400">— لا توجد بيانات —</p>;
}

function Evidence({ ev }: { ev?: EvidenceRef[] }) {
  if (!ev || ev.length === 0) return null;
  return (
    <ul className="mt-1 list-[circle] space-y-0.5 pr-5 text-[11px] text-slate-500">
      {ev.map((e, i) => (
        <li key={i}>
          <em>{e.question_label}</em>: &laquo;{e.quote}&raquo;
        </li>
      ))}
    </ul>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function SectionBlock({ title, sectionKey, output }: { title: string; sectionKey: AnalysisSectionKey; output: DiscoveryAnalysisOutput }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sec = (output as any)[sectionKey];
  if (!sec) return <Section title={title}><Empty /></Section>;
  const confidence: SectionConfidence | undefined = sec.confidence;

  switch (sectionKey) {
    case "executive_summary":
      return (
        <Section title={title} confidence={confidence}>
          <p className="whitespace-pre-wrap">{sec.summary || "—"}</p>
          <Evidence ev={sec.evidence} />
        </Section>
      );
    case "business_model":
      return (
        <Section title={title} confidence={confidence}>
          <div className="space-y-1">
            {sec.overview && <p><strong>نظرة عامة:</strong> {sec.overview}</p>}
            {sec.how_it_works && <p><strong>آلية العمل:</strong> {sec.how_it_works}</p>}
            {sec.value_delivery && <p><strong>تسليم القيمة:</strong> {sec.value_delivery}</p>}
            {sec.users_description && <p><strong>المستخدمون:</strong> {sec.users_description}</p>}
          </div>
          <Evidence ev={sec.evidence} />
        </Section>
      );
    case "stakeholders":
      return (
        <Section title={title} confidence={confidence}>
          {(sec.items ?? []).length === 0 ? <Empty /> : (
            <ul className="list-disc space-y-1 pr-5">
              {sec.items.map((it: { name: string; role: string; influence: string; evidence: EvidenceRef[] }, i: number) => (
                <li key={i}>
                  <strong>{it.name}</strong> — {it.role} <span className="text-xs text-slate-500">[نفوذ: {it.influence}]</span>
                  <Evidence ev={it.evidence} />
                </li>
              ))}
            </ul>
          )}
        </Section>
      );
    case "business_goals":
      return (
        <Section title={title} confidence={confidence}>
          {(sec.items ?? []).length === 0 ? <Empty /> : (
            <ul className="list-disc space-y-1 pr-5">
              {sec.items.map((it: { goal: string; priority: string; evidence: EvidenceRef[] }, i: number) => (
                <li key={i}>
                  {it.goal} <span className="text-xs text-slate-500">[{it.priority}]</span>
                  <Evidence ev={it.evidence} />
                </li>
              ))}
            </ul>
          )}
        </Section>
      );
    case "functional_requirements":
      return (
        <Section title={title} confidence={confidence}>
          {(sec.items ?? []).length === 0 ? <Empty /> : (
            <ul className="list-disc space-y-1 pr-5">
              {sec.items.map((it: { statement: string; evidence: EvidenceRef[] }, i: number) => (
                <li key={i}>{it.statement}<Evidence ev={it.evidence} /></li>
              ))}
            </ul>
          )}
        </Section>
      );
    case "non_functional_requirements": {
      const labels: Record<string, string> = {
        performance: "الأداء",
        security: "الأمن",
        scalability: "قابلية التوسع",
        availability: "الإتاحة",
        accessibility: "الوصولية",
        compliance: "الامتثال",
      };
      const groups = Object.keys(labels).filter((k) => (sec[k] ?? []).length > 0);
      return (
        <Section title={title} confidence={confidence}>
          {groups.length === 0 ? <Empty /> : (
            <div className="space-y-2">
              {groups.map((k) => (
                <div key={k}>
                  <p className="font-semibold">{labels[k]}</p>
                  <ul className="list-disc space-y-1 pr-5">
                    {sec[k].map((it: { statement: string; evidence: EvidenceRef[] }, i: number) => (
                      <li key={i}>{it.statement}<Evidence ev={it.evidence} /></li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </Section>
      );
    }
    case "risks":
      return (
        <Section title={title} confidence={confidence}>
          {(sec.items ?? []).length === 0 ? <Empty /> : (
            <ul className="list-disc space-y-1 pr-5">
              {sec.items.map((it: { risk: string; cause: string; likelihood: string; impact: string; evidence: EvidenceRef[] }, i: number) => (
                <li key={i}>
                  <strong>{it.risk}</strong>
                  {it.cause && <span className="block text-xs text-slate-600">السبب: {it.cause}</span>}
                  <span className="text-xs text-slate-500">احتمال: {it.likelihood} · أثر: {it.impact}</span>
                  <Evidence ev={it.evidence} />
                </li>
              ))}
            </ul>
          )}
        </Section>
      );
    case "assumptions":
      return (
        <Section title={title} confidence={confidence}>
          {(sec.items ?? []).length === 0 ? <Empty /> : (
            <ul className="list-disc space-y-1 pr-5">
              {sec.items.map((it: { statement: string; reason: string; evidence: EvidenceRef[] }, i: number) => (
                <li key={i}>
                  {it.statement}
                  {it.reason && <span className="block text-xs text-slate-500">— {it.reason}</span>}
                  <Evidence ev={it.evidence} />
                </li>
              ))}
            </ul>
          )}
        </Section>
      );
    case "missing_information":
      return (
        <Section title={title} confidence={confidence}>
          {(sec.items ?? []).length === 0 ? <Empty /> : (
            <ul className="list-disc space-y-1 pr-5">
              {sec.items.map((it: { info: string; impact: string; reason: string }, i: number) => (
                <li key={i}>
                  {it.info} <span className="text-xs text-slate-500">[أثر: {it.impact}]</span>
                  {it.reason && <span className="block text-xs text-slate-500">— {it.reason}</span>}
                </li>
              ))}
            </ul>
          )}
        </Section>
      );
    case "suggested_features":
    case "suggested_integrations":
      return (
        <Section title={title} confidence={confidence}>
          {(sec.items ?? []).length === 0 ? <Empty /> : (
            <ul className="list-disc space-y-1 pr-5">
              {sec.items.map((it: { title: string; rationale: string; priority: string; evidence: EvidenceRef[] }, i: number) => (
                <li key={i}>
                  <strong>{it.title}</strong> <span className="text-xs text-slate-500">[{it.priority}]</span>
                  {it.rationale && <span className="block text-xs text-slate-500">— {it.rationale}</span>}
                  <Evidence ev={it.evidence} />
                </li>
              ))}
            </ul>
          )}
        </Section>
      );
    case "suggested_user_roles":
      return (
        <Section title={title} confidence={confidence}>
          {(sec.items ?? []).length === 0 ? <Empty /> : (
            <ul className="list-disc space-y-1 pr-5">
              {sec.items.map((it: { role: string; responsibilities: string[]; evidence: EvidenceRef[] }, i: number) => (
                <li key={i}>
                  <strong>{it.role}</strong>
                  {it.responsibilities && it.responsibilities.length > 0 && (
                    <ul className="mt-1 list-[circle] space-y-0.5 pr-5 text-xs text-slate-600">
                      {it.responsibilities.map((r, j) => (<li key={j}>{r}</li>))}
                    </ul>
                  )}
                  <Evidence ev={it.evidence} />
                </li>
              ))}
            </ul>
          )}
        </Section>
      );
    case "suggested_kpis":
      return (
        <Section title={title} confidence={confidence}>
          {(sec.items ?? []).length === 0 ? <Empty /> : (
            <ul className="list-disc space-y-1 pr-5">
              {sec.items.map((it: { name: string; target_or_direction: string; goal_link: string; evidence: EvidenceRef[] }, i: number) => (
                <li key={i}>
                  <strong>{it.name}</strong> — {it.target_or_direction}
                  {it.goal_link && <span className="block text-xs text-slate-500">مرتبط بـ: {it.goal_link}</span>}
                  <Evidence ev={it.evidence} />
                </li>
              ))}
            </ul>
          )}
        </Section>
      );
    case "suggested_user_stories":
      return (
        <Section title={title} confidence={confidence}>
          {(sec.items ?? []).length === 0 ? <Empty /> : (
            <ul className="list-disc space-y-1 pr-5">
              {sec.items.map((it: { role: string; want: string; benefit: string; priority: string; evidence: EvidenceRef[] }, i: number) => (
                <li key={i}>
                  بصفتي <strong>{it.role}</strong>، أريد {it.want}، حتى {it.benefit}.
                  <span className="text-xs text-slate-500"> [{it.priority}]</span>
                  <Evidence ev={it.evidence} />
                </li>
              ))}
            </ul>
          )}
        </Section>
      );
    case "suggested_project_scope":
      return (
        <Section title={title} confidence={confidence}>
          <p className="font-semibold text-[#16A34A]">داخل النطاق</p>
          {(sec.in_scope ?? []).length === 0 ? <Empty /> : (
            <ul className="list-disc space-y-1 pr-5">
              {sec.in_scope.map((it: { statement: string; evidence: EvidenceRef[] }, i: number) => (
                <li key={i}>{it.statement}<Evidence ev={it.evidence} /></li>
              ))}
            </ul>
          )}
          <p className="mt-2 font-semibold text-slate-500">خارج النطاق</p>
          {(sec.out_of_scope ?? []).length === 0 ? <Empty /> : (
            <ul className="list-disc space-y-1 pr-5">
              {sec.out_of_scope.map((it: { statement: string; evidence: EvidenceRef[] }, i: number) => (
                <li key={i}>{it.statement}<Evidence ev={it.evidence} /></li>
              ))}
            </ul>
          )}
        </Section>
      );
    case "suggested_roadmap":
      return (
        <Section title={title} confidence={confidence}>
          {(sec.phases ?? []).length === 0 ? <Empty /> : (
            <ol className="list-decimal space-y-2 pr-5">
              {sec.phases.map((p: { phase: string; description: string; deliverables: string[]; evidence: EvidenceRef[] }, i: number) => (
                <li key={i}>
                  <strong>{p.phase}</strong>
                  {p.description && <p className="text-xs text-slate-600">{p.description}</p>}
                  {p.deliverables && p.deliverables.length > 0 && (
                    <ul className="mt-1 list-[circle] space-y-0.5 pr-5 text-xs text-slate-600">
                      {p.deliverables.map((d, j) => (<li key={j}>{d}</li>))}
                    </ul>
                  )}
                  <Evidence ev={p.evidence} />
                </li>
              ))}
            </ol>
          )}
        </Section>
      );
    case "meeting_questions":
      return (
        <Section title={title} confidence={confidence}>
          {(sec.items ?? []).length === 0 ? <Empty /> : (
            <ul className="list-disc space-y-1 pr-5">
              {sec.items.map((it: { question: string; reason: string; priority: string }, i: number) => (
                <li key={i}>
                  {it.question} <span className="text-xs text-slate-500">[{it.priority}]</span>
                  {it.reason && <span className="block text-xs text-slate-500">— {it.reason}</span>}
                </li>
              ))}
            </ul>
          )}
        </Section>
      );
    default:
      return <Section title={title}><Empty /></Section>;
  }
}
