import type { DiscoveryAnalysisOutput } from "@/lib/discovery-analysis/types";
import type {
  BrainContent,
  BrainSectionMeta,
  BrainSectionSource,
  ConstraintItem,
  KnownFactItem,
  Section,
} from "./types";

/**
 * محوّل خالص Pure — بدون AI ولا قاعدة بيانات. يحوّل ناتج Discovery Analysis
 * إلى Brain Content مبدئي. يُستخدم لبناء أول Draft بعد نجاح التحليل.
 *
 * قواعد المطابقة:
 *  - الأقسام المتطابقة 1:1 (executive_summary, business_model, business_goals,
 *    stakeholders, functional_requirements, non_functional_requirements,
 *    assumptions, risks, missing_information, suggested_features,
 *    suggested_integrations, suggested_kpis, meeting_questions).
 *  - suggested_user_roles → user_roles
 *  - suggested_project_scope → project_scope
 *  - suggested_roadmap → roadmap
 *  - الأقسام الجديدة الغير موجودة في التحليل (business_rules) → فاضية
 *    ومصدرها future_update، بحيث يقدر PM يعبّيها يدويًا.
 *  - constraints → مشتقّ: بنود non_functional_requirements.compliance/security
 *    باعتبارها قيود قانونية/أمنية إجبارية.
 *  - known_facts → مشتقّ: بنود functional_requirements ذات evidence قوي
 *    (لأن الـ FR الصريح هو حقيقة موثّقة من العميل).
 */
export function mapAnalysisToBrainContent(
  analysis: DiscoveryAnalysisOutput,
  nowIso: string = new Date().toISOString()
): BrainContent {
  const meta = (source: BrainSectionSource, confidence: number, evidence: unknown[], confidence_reason: string | null = null): BrainSectionMeta => ({
    confidence,
    confidence_reason,
    evidence: evidence as BrainSectionMeta["evidence"],
    source,
    last_updated: nowIso,
  });

  const sec = <T>(
    content: T,
    source: BrainSectionSource,
    confidence: number,
    evidence: unknown[] = [],
    confidence_reason: string | null = null
  ): Section<T> => ({
    meta: meta(source, confidence, evidence, confidence_reason),
    content,
  });

  // اشتقاق constraints من NFR compliance/security
  const derivedConstraints: ConstraintItem[] = [
    ...analysis.non_functional_requirements.compliance.map(
      (i): ConstraintItem => ({
        constraint: i.statement,
        type: "legal",
        evidence: i.evidence,
      })
    ),
    ...analysis.non_functional_requirements.security.map(
      (i): ConstraintItem => ({
        constraint: i.statement,
        type: "technical",
        evidence: i.evidence,
      })
    ),
  ];

  // اشتقاق known_facts من functional_requirements + business_model overview
  // (نفصل الحقيقة الموثّقة عن التوصية أو الاقتراح)
  const derivedKnownFacts: KnownFactItem[] = analysis.functional_requirements.items.map(
    (i): KnownFactItem => ({
      fact: i.statement,
      category: "functional",
      evidence: i.evidence,
    })
  );

  return {
    executive_summary: sec(
      analysis.executive_summary.summary,
      "ai_analysis",
      analysis.executive_summary.confidence.score,
      analysis.executive_summary.evidence,
      analysis.executive_summary.confidence.reason
    ),
    business_model: sec(
      {
        overview: analysis.business_model.overview,
        how_it_works: analysis.business_model.how_it_works,
        value_delivery: analysis.business_model.value_delivery,
        users_description: analysis.business_model.users_description,
      },
      "ai_analysis",
      analysis.business_model.confidence.score,
      analysis.business_model.evidence,
      analysis.business_model.confidence.reason
    ),
    business_goals: sec(
      analysis.business_goals.items.map((i) => ({
        statement: i.goal,
        priority: i.priority,
        evidence: i.evidence,
      })),
      "ai_analysis",
      analysis.business_goals.confidence.score,
      [],
      analysis.business_goals.confidence.reason
    ),
    stakeholders: sec(
      analysis.stakeholders.items.map((i) => ({
        name: i.name,
        role: i.role,
        influence: i.influence,
        evidence: i.evidence,
      })),
      "ai_analysis",
      analysis.stakeholders.confidence.score,
      [],
      analysis.stakeholders.confidence.reason
    ),
    business_rules: sec(
      [],
      "future_update",
      0,
      [],
      "لم يُذكر صراحةً في الاكتشاف — أضفها يدويًا بعد الاجتماع الأول."
    ),
    functional_requirements: sec(
      analysis.functional_requirements.items.map((i) => ({
        statement: i.statement,
        evidence: i.evidence,
      })),
      "ai_analysis",
      analysis.functional_requirements.confidence.score,
      [],
      analysis.functional_requirements.confidence.reason
    ),
    non_functional_requirements: sec(
      {
        performance: analysis.non_functional_requirements.performance,
        security: analysis.non_functional_requirements.security,
        scalability: analysis.non_functional_requirements.scalability,
        availability: analysis.non_functional_requirements.availability,
        accessibility: analysis.non_functional_requirements.accessibility,
        compliance: analysis.non_functional_requirements.compliance,
      },
      "ai_analysis",
      analysis.non_functional_requirements.confidence.score,
      [],
      analysis.non_functional_requirements.confidence.reason
    ),
    constraints: sec(
      derivedConstraints,
      "ai_analysis",
      derivedConstraints.length === 0 ? 30 : 70,
      [],
      derivedConstraints.length === 0
        ? "لم تُذكر قيود قانونية/تقنية صريحة — راجع مع العميل."
        : null
    ),
    assumptions: sec(
      analysis.assumptions.items.map((i) => ({
        statement: i.statement,
        reason: i.reason,
        evidence: i.evidence,
      })),
      "ai_analysis",
      analysis.assumptions.confidence.score,
      [],
      analysis.assumptions.confidence.reason
    ),
    risks: sec(
      analysis.risks.items.map((i) => ({
        risk: i.risk,
        cause: i.cause,
        likelihood: i.likelihood,
        impact: i.impact,
        evidence: i.evidence,
      })),
      "ai_analysis",
      analysis.risks.confidence.score,
      [],
      analysis.risks.confidence.reason
    ),
    known_facts: sec(
      derivedKnownFacts,
      "discovery",
      derivedKnownFacts.length === 0 ? 30 : 85,
      [],
      derivedKnownFacts.length === 0
        ? "لا حقائق موثّقة بعد — اعتمد على المتطلبات الوظيفية."
        : null
    ),
    missing_information: sec(
      analysis.missing_information.items.map((i) => ({
        info: i.info,
        impact: i.impact,
        reason: i.reason,
      })),
      "ai_analysis",
      analysis.missing_information.confidence.score,
      [],
      analysis.missing_information.confidence.reason
    ),
    user_roles: sec(
      analysis.suggested_user_roles.items.map((i) => ({
        role: i.role,
        responsibilities: i.responsibilities,
        evidence: i.evidence,
      })),
      "ai_analysis",
      analysis.suggested_user_roles.confidence.score,
      [],
      analysis.suggested_user_roles.confidence.reason
    ),
    suggested_features: sec(
      analysis.suggested_features.items,
      "ai_analysis",
      analysis.suggested_features.confidence.score,
      [],
      analysis.suggested_features.confidence.reason
    ),
    suggested_integrations: sec(
      analysis.suggested_integrations.items,
      "ai_analysis",
      analysis.suggested_integrations.confidence.score,
      [],
      analysis.suggested_integrations.confidence.reason
    ),
    suggested_kpis: sec(
      analysis.suggested_kpis.items,
      "ai_analysis",
      analysis.suggested_kpis.confidence.score,
      [],
      analysis.suggested_kpis.confidence.reason
    ),
    project_scope: sec(
      {
        in_scope: analysis.suggested_project_scope.in_scope,
        out_of_scope: analysis.suggested_project_scope.out_of_scope,
      },
      "ai_analysis",
      analysis.suggested_project_scope.confidence.score,
      [],
      analysis.suggested_project_scope.confidence.reason
    ),
    roadmap: sec(
      analysis.suggested_roadmap.phases,
      "ai_analysis",
      analysis.suggested_roadmap.confidence.score,
      [],
      analysis.suggested_roadmap.confidence.reason
    ),
    meeting_questions: sec(
      analysis.meeting_questions.items,
      "ai_analysis",
      analysis.meeting_questions.confidence.score,
      [],
      analysis.meeting_questions.confidence.reason
    ),
  };
}
