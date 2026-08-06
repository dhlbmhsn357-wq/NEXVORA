import type { SupabaseClient } from "@supabase/supabase-js";
import { type DiscoveryPair } from "@/lib/discovery-templates/snapshot";
import { getAggregatedDiscovery } from "@/lib/discovery-portal/aggregate-sessions";
import type { DiscoveryAnalysisOutput } from "@/lib/discovery-analysis/types";
import type { BrainContent } from "@/lib/brain-v2/types";

export interface MeetingPrepContext {
  projectId: string;
  projectName: string;
  companyName: string | null;
  discoveryPairs: DiscoveryPair[]; // إجابات الاكتشاف (تشمل أي ملاحظات نصية حرة كتبها العميل)
  pmNotes: string[]; // ملاحظات الـ PM المسجّلة يدويًا (project_brain_entries)
  leadNotes: string | null;
  analysis: DiscoveryAnalysisOutput | null; // آخر تحليل ناجح
  brain: BrainContent | null; // آخر Brain معتمد أو draft (أيهما متاح)
  /** كتلة نصية جاهزة تُدرَج في كل الـ Prompts — بنبنيها مرة واحدة. */
  formattedSourceBlock: string;
}

function safeText(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v);
}

/**
 * يجمع كل مصادر البيانات المطلوبة (Discovery Answers/Notes, PM Notes,
 * Project Brain, AI Discovery Analysis) في سياق واحد جاهز، ويبني كتلة
 * نصية مشتركة تُستخدم في الـ13 Prompt بدون تكرار منطق التجميع.
 */
export async function buildMeetingPrepContext(
  supabase: SupabaseClient,
  projectId: string
): Promise<MeetingPrepContext | null> {
  const { data: project } = await supabase
    .from("projects")
    .select("name, lead_id, clients(company_name)")
    .eq("id", projectId)
    .maybeSingle();
  if (!project) return null;

  const companyName = Array.isArray(project.clients)
    ? project.clients[0]?.company_name ?? null
    : (project.clients as { company_name: string | null } | null)?.company_name ?? null;

  const [aggregatedDiscovery, { data: entries }, { data: lead }, { data: analysisRow }, { data: brainRow }] =
    await Promise.all([
      // Discovery Workspace: كل جلسات الاكتشاف مجمّعة (مش الأخيرة بس)
      getAggregatedDiscovery(supabase, projectId),
      supabase
        .from("project_brain_entries")
        .select("content")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false })
        .limit(30),
      project.lead_id
        ? supabase.from("leads").select("notes").eq("id", project.lead_id).maybeSingle()
        : Promise.resolve({ data: null }),
      supabase
        .from("discovery_analyses")
        .select("output")
        .eq("project_id", projectId)
        .eq("status", "completed")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("project_brain_documents")
        .select("content")
        .eq("project_id", projectId)
        .in("status", ["approved", "draft", "in_review"])
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  const discoveryPairs = aggregatedDiscovery.labeledPairs;
  const pmNotes = ((entries ?? []) as Array<{ content: string }>).map((e) => e.content);
  const analysis = (analysisRow?.output as DiscoveryAnalysisOutput | null) ?? null;
  const brain = (brainRow?.content as BrainContent | null) ?? null;

  const lines: string[] = [];
  lines.push(`## اسم المشروع\n${safeText(project.name)}`);
  if (companyName) lines.push(`## الشركة\n${companyName}`);

  lines.push("## إجابات نموذج الاكتشاف");
  lines.push(
    discoveryPairs.length > 0
      ? discoveryPairs.map((p) => `- ${p.label}: ${p.value}`).join("\n")
      : "(لا توجد إجابات مسجّلة)"
  );

  if (pmNotes.length > 0) {
    lines.push("## ملاحظات الـ PM المسجّلة يدويًا");
    lines.push(pmNotes.map((n) => `- ${n}`).join("\n"));
  }

  if (lead?.notes) {
    lines.push("## ملاحظات على العميل (من مرحلة Lead)");
    lines.push(lead.notes);
  }

  if (analysis) {
    lines.push("## من تحليل الاكتشاف الذكي (AI Discovery Analysis)");
    lines.push(`### الملخص التنفيذي\n${analysis.executive_summary.summary}`);
    lines.push(
      `### أهداف العمل\n${analysis.business_goals.items.map((g) => `- ${g.goal} (أولوية ${g.priority})`).join("\n") || "(لا يوجد)"}`
    );
    lines.push(
      `### المخاطر\n${analysis.risks.items.map((r) => `- ${r.risk}: ${r.cause}`).join("\n") || "(لا يوجد)"}`
    );
    lines.push(
      `### معلومات ناقصة\n${analysis.missing_information.items.map((m) => `- ${m.info} (${m.reason})`).join("\n") || "(لا يوجد)"}`
    );
    lines.push(
      `### متطلبات وظيفية\n${analysis.functional_requirements.items.map((f) => `- ${f.statement}`).join("\n") || "(لا يوجد)"}`
    );
    lines.push(
      `### قصص المستخدم المقترحة\n${analysis.suggested_user_stories.items.map((s) => `- بصفتي ${s.role}، أريد ${s.want}، حتى ${s.benefit}`).join("\n") || "(لا يوجد)"}`
    );
    lines.push(
      `### الافتراضات\n${analysis.assumptions.items.map((a) => `- ${a.statement} (${a.reason})`).join("\n") || "(لا يوجد)"}`
    );
  }

  if (brain) {
    lines.push("## من Project Brain المعتمد/الحالي");
    lines.push(`### الملخص التنفيذي\n${brain.executive_summary.content}`);
    lines.push(
      `### أهداف العمل\n${brain.business_goals.content.map((g) => `- ${g.statement}`).join("\n") || "(لا يوجد)"}`
    );
    lines.push(
      `### المخاطر\n${brain.risks.content.map((r) => `- ${r.risk}`).join("\n") || "(لا يوجد)"}`
    );
    lines.push(
      `### معلومات ناقصة\n${brain.missing_information.content.map((m) => `- ${m.info}`).join("\n") || "(لا يوجد)"}`
    );
  }

  return {
    projectId,
    projectName: project.name,
    companyName,
    discoveryPairs,
    pmNotes,
    leadNotes: lead?.notes ?? null,
    analysis,
    brain,
    formattedSourceBlock: lines.join("\n\n"),
  };
}

export function hasEnoughContextForMeetingPrep(ctx: MeetingPrepContext): boolean {
  return ctx.discoveryPairs.length > 0 || !!ctx.analysis || !!ctx.brain;
}
