import { SLIDE_LABELS_AR } from "@/lib/ai/prompts/meeting-presentation";
import type { MeetingPresentationSlideKey, MeetingPresentationSlides } from "@/lib/types/database";

export interface SlideSummary {
  heading: string;
  bullets: string[];
}

/**
 * ملخص سريع (عنوان + نقاط) لأي شريحة من الـ 15 — مُستخدم في Live
 * Meeting Mode كمرجع سريع للـ PM أثناء الاجتماع (مش العرض الكامل
 * بتصميمه الغني؛ ده منطق حتمي خالص قابل للاختبار الكامل بدون AI أو
 * أي عنصر UI).
 */
export function getSlideSummary(
  key: MeetingPresentationSlideKey,
  content: MeetingPresentationSlides[typeof key]
): SlideSummary {
  const heading = SLIDE_LABELS_AR[key];
  if (!content) return { heading, bullets: [] };

  switch (key) {
    case "cover": {
      const c = content as NonNullable<MeetingPresentationSlides["cover"]>;
      return { heading, bullets: [c.project_name, c.client_name, `${c.current_phase} — ${c.status}`] };
    }
    case "executive_summary": {
      const c = content as NonNullable<MeetingPresentationSlides["executive_summary"]>;
      return { heading, bullets: c.key_points };
    }
    case "business_problem": {
      const c = content as NonNullable<MeetingPresentationSlides["business_problem"]>;
      return { heading, bullets: c.pain_points.map((p) => `${p.title} (${p.severity})`) };
    }
    case "business_goals": {
      const c = content as NonNullable<MeetingPresentationSlides["business_goals"]>;
      return { heading, bullets: c.goals.map((g) => g.title) };
    }
    case "current_workflow": {
      const c = content as NonNullable<MeetingPresentationSlides["current_workflow"]>;
      return { heading, bullets: c.steps.map((s) => s.title) };
    }
    case "future_workflow": {
      const c = content as NonNullable<MeetingPresentationSlides["future_workflow"]>;
      return { heading, bullets: c.steps.map((s) => s.title) };
    }
    case "actors": {
      const c = content as NonNullable<MeetingPresentationSlides["actors"]>;
      return { heading, bullets: c.actors.map((a) => a.name) };
    }
    case "modules": {
      const c = content as NonNullable<MeetingPresentationSlides["modules"]>;
      return { heading, bullets: c.modules.map((m) => m.name) };
    }
    case "screens": {
      const c = content as NonNullable<MeetingPresentationSlides["screens"]>;
      return { heading, bullets: c.screens.map((s) => s.name) };
    }
    case "architecture": {
      const c = content as NonNullable<MeetingPresentationSlides["architecture"]>;
      return { heading, bullets: [`Frontend: ${c.frontend}`, `Backend: ${c.backend}`, `Database: ${c.database}`] };
    }
    case "timeline": {
      const c = content as NonNullable<MeetingPresentationSlides["timeline"]>;
      return { heading, bullets: c.milestones.map((m) => m.title) };
    }
    case "risks": {
      const c = content as NonNullable<MeetingPresentationSlides["risks"]>;
      return { heading, bullets: c.risks.map((r) => `${r.title} (احتمالية ${r.probability} / أثر ${r.impact})`) };
    }
    case "open_questions": {
      const c = content as NonNullable<MeetingPresentationSlides["open_questions"]>;
      return { heading, bullets: c.questions.map((q) => q.question) };
    }
    case "client_decisions": {
      const c = content as NonNullable<MeetingPresentationSlides["client_decisions"]>;
      return { heading, bullets: c.decisions.map((d) => d.decision) };
    }
    case "final_summary": {
      const c = content as NonNullable<MeetingPresentationSlides["final_summary"]>;
      return { heading, bullets: c.next_steps };
    }
    default:
      return { heading, bullets: [] };
  }
}
