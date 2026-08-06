import type { SupabaseClient } from "@supabase/supabase-js";
import { getLatestApprovedBrain, getLatestBrainDocument } from "./service";
import type { BrainContent } from "./types";
import type { ProjectRecommendation } from "@/lib/types/database";

export interface BrainForDownstream {
  content: BrainContent;
  version: number;
  isApproved: boolean;
}

/**
 * المصدر الموحّد لأي مرحلة لاحقة (PRD, Prototype Prompt, Client
 * Presentation, Developer Handoff) تحتاج بيانات Project Brain. يفضّل
 * النسخة المعتمدة (approved) دائمًا؛ لو معدش وجدت (لسه ما اتعملهاش
 * مراجعة/اعتماد)، يرجع بآخر نسخة موجودة (draft/in_review) عشان
 * المراحل التالية متتوقفش بالكامل لحد ما الاعتماد يحصل — لكن isApproved
 * بترجع false في الحالة دي عشان المستدعي يقدر يحذّر لو حاب.
 */
export async function getBrainForDownstreamGeneration(
  supabase: SupabaseClient,
  projectId: string
): Promise<BrainForDownstream | null> {
  const approved = await getLatestApprovedBrain(supabase, projectId);
  if (approved) return { content: approved.content, version: approved.version, isApproved: true };

  const latest = await getLatestBrainDocument(supabase, projectId);
  if (latest) return { content: latest.content, version: latest.version, isApproved: false };

  return null;
}

function bulletList<T>(items: T[], render: (item: T) => string): string {
  return items.length > 0 ? items.map((item) => `- ${render(item)}`).join("\n") : "(لا يوجد)";
}

/**
 * يحوّل BrainContent (v2، الـ19 قسم) لكتلة نصية جاهزة تُدرَج في أي
 * Prompt توليد لاحق — أغنى بكتير من ملخص v1 القديم (4 حقول مسطّحة)،
 * ويشمل كل شيء اعتمده/راجعه PM فعليًا في تبويب Project Brain.
 */
export function formatBrainV2ForPrompt(content: BrainContent): string {
  const lines: string[] = [];

  lines.push(`## الملخص التنفيذي\n${content.executive_summary.content || "(لا يوجد)"}`);

  lines.push(
    `## نموذج العمل\n${content.business_model.content.overview}\n${content.business_model.content.how_it_works}\n${content.business_model.content.value_delivery}`
  );

  lines.push(`## أهداف العمل\n${bulletList(content.business_goals.content, (g) => `${g.statement} (أولوية ${g.priority})`)}`);
  lines.push(`## أصحاب المصلحة\n${bulletList(content.stakeholders.content, (s) => `${s.name} — ${s.role}`)}`);
  lines.push(`## قواعد العمل\n${bulletList(content.business_rules.content, (r) => r.rule)}`);
  lines.push(`## المتطلبات الوظيفية\n${bulletList(content.functional_requirements.content, (f) => f.statement)}`);

  const nf = content.non_functional_requirements.content;
  lines.push(
    `## المتطلبات غير الوظيفية\n` +
      [
        `الأداء:\n${bulletList(nf.performance, (i) => i.statement)}`,
        `الأمان:\n${bulletList(nf.security, (i) => i.statement)}`,
        `التوسّع:\n${bulletList(nf.scalability, (i) => i.statement)}`,
        `الإتاحة:\n${bulletList(nf.availability, (i) => i.statement)}`,
        `إمكانية الوصول:\n${bulletList(nf.accessibility, (i) => i.statement)}`,
        `الامتثال:\n${bulletList(nf.compliance, (i) => i.statement)}`,
      ].join("\n\n")
  );

  lines.push(`## القيود\n${bulletList(content.constraints.content, (c) => `${c.constraint} (${c.type})`)}`);
  lines.push(`## الافتراضات\n${bulletList(content.assumptions.content, (a) => a.statement)}`);
  lines.push(`## المخاطر\n${bulletList(content.risks.content, (r) => `${r.risk} — السبب: ${r.cause}`)}`);
  lines.push(`## حقائق معروفة\n${bulletList(content.known_facts.content, (f) => f.fact)}`);
  lines.push(`## معلومات ناقصة\n${bulletList(content.missing_information.content, (m) => m.info)}`);
  lines.push(`## أدوار المستخدمين\n${bulletList(content.user_roles.content, (u) => u.role)}`);
  lines.push(`## مزايا مقترحة\n${bulletList(content.suggested_features.content, (f) => `${f.title}: ${f.rationale}`)}`);
  lines.push(
    `## تكاملات مقترحة\n${bulletList(content.suggested_integrations.content, (i) => `${i.title}: ${i.rationale}`)}`
  );
  lines.push(`## مؤشرات الأداء المقترحة\n${bulletList(content.suggested_kpis.content, (k) => `${k.name} — ${k.target_or_direction}`)}`);
  lines.push(
    `## نطاق المشروع\nداخل النطاق:\n${bulletList(content.project_scope.content.in_scope, (s) => s.statement)}\n\nخارج النطاق:\n${bulletList(content.project_scope.content.out_of_scope, (s) => s.statement)}`
  );
  lines.push(`## خارطة الطريق\n${bulletList(content.roadmap.content, (p) => `${p.phase}: ${p.description}`)}`);
  lines.push(`## أسئلة الاجتماع المفتوحة\n${bulletList(content.meeting_questions.content, (q) => q.question)}`);

  return lines.join("\n\n");
}

/**
 * كتلة نصية للتوصيات الذكية المقبولة (Phase 4) — تُدرَج في أي Prompt
 * توليد لاحق (PRD أساسًا) جنب formatBrainV2ForPrompt مباشرة. "الـ PRD
 * ما ينفعش يتولّد من الـ Brain لوحدها" — التوصيات المقبولة سياق إلزامي،
 * مش اختياري.
 */
export function formatAcceptedRecommendationsForPrompt(recommendations: ProjectRecommendation[]): string {
  if (recommendations.length === 0) return "(لا توجد توصيات مقبولة)";
  return recommendations
    .map((r) => `- [${r.category}${r.priority ? ` / أولوية ${r.priority}` : ""}] ${r.recommendation}${r.rationale ? ` — السبب: ${r.rationale}` : ""}`)
    .join("\n");
}
