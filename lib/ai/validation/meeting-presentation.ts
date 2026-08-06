import { MEETING_PRESENTATION_SLIDE_KEYS } from "@/lib/ai/prompts/meeting-presentation";
import type {
  ActorCard,
  ComplexityLevel,
  GoalItem,
  KpiItem,
  MeetingPresentationSlideKey,
  MeetingPresentationSlides,
  MilestoneItem,
  ModuleItem,
  PainPointItem,
  PriorityLevel,
  RiskItem,
  ScreenCard,
  SeverityLevel,
  TimelineEntry,
  WorkflowStep,
} from "@/lib/types/database";

const EXPECTED_KEYS = MEETING_PRESENTATION_SLIDE_KEYS;

export type MeetingPresentationValidationResult =
  | { ok: true; data: MeetingPresentationSlides }
  | { ok: false; reason: string };

const SEVERITY_VALUES: SeverityLevel[] = ["low", "medium", "high", "critical"];
const PRIORITY_VALUES: PriorityLevel[] = ["low", "medium", "high"];
const COMPLEXITY_VALUES: ComplexityLevel[] = ["XS", "S", "M", "L", "XL"];

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => isNonEmptyString(v));
}

function isNullableDateString(value: unknown): value is string | null {
  return value === null || isNonEmptyString(value);
}

function isPercent(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100;
}

function isEnum<T extends string>(value: unknown, allowed: T[]): value is T {
  return typeof value === "string" && (allowed as string[]).includes(value);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isArrayOf<T>(value: unknown, check: (item: unknown) => item is T): value is T[] {
  return Array.isArray(value) && value.every(check);
}

function isTimelineEntry(v: unknown): v is TimelineEntry {
  return isObject(v) && isNonEmptyString(v.label) && isNullableDateString(v.date);
}
function isPainPointItem(v: unknown): v is PainPointItem {
  return isObject(v) && isNonEmptyString(v.title) && isEnum(v.severity, SEVERITY_VALUES);
}
function isGoalItem(v: unknown): v is GoalItem {
  return isObject(v) && isNonEmptyString(v.title) && isEnum(v.priority, PRIORITY_VALUES) && isPercent(v.progress_percent) && isNonEmptyString(v.expected_outcome);
}
function isKpiItem(v: unknown): v is KpiItem {
  return isObject(v) && isNonEmptyString(v.name) && isNonEmptyString(v.target);
}
function isWorkflowStep(v: unknown): v is WorkflowStep {
  return isObject(v) && isNonEmptyString(v.title) && isNonEmptyString(v.description);
}
function isActorCard(v: unknown): v is ActorCard {
  return isObject(v) && isNonEmptyString(v.name) && isStringArray(v.responsibilities) && isStringArray(v.permissions) && isStringArray(v.pain_points);
}
function isModuleItem(v: unknown): v is ModuleItem {
  return (
    isObject(v) &&
    isNonEmptyString(v.name) &&
    isNonEmptyString(v.purpose) &&
    isEnum(v.priority, PRIORITY_VALUES) &&
    isEnum(v.complexity, COMPLEXITY_VALUES) &&
    isStringArray(v.dependencies)
  );
}
function isScreenCard(v: unknown): v is ScreenCard {
  return isObject(v) && isNonEmptyString(v.name) && isNonEmptyString(v.goal) && isStringArray(v.functions);
}
function isMilestoneItem(v: unknown): v is MilestoneItem {
  return isObject(v) && isNonEmptyString(v.title) && isNullableDateString(v.date) && isPercent(v.progress_percent);
}
function isRiskItem(v: unknown): v is RiskItem {
  return isObject(v) && isNonEmptyString(v.title) && isEnum(v.probability, PRIORITY_VALUES) && isEnum(v.impact, PRIORITY_VALUES) && isNonEmptyString(v.mitigation);
}

/** كل شريحة شكلها مختلف تمامًا — بدل الشكل الموحّد القديم {heading,body,bullets}. */
function validateSlide(key: MeetingPresentationSlideKey, value: unknown): string | null {
  if (!isObject(value)) return `"${key}" ليس كائن.`;
  const o = value;

  switch (key) {
    case "cover":
      if (
        !isNonEmptyString(o.project_name) ||
        !isNonEmptyString(o.client_name) ||
        !isNullableDateString(o.meeting_date) ||
        !isNonEmptyString(o.pm_name) ||
        !isNonEmptyString(o.current_phase) ||
        !isNonEmptyString(o.status) ||
        !isPercent(o.progress_percent)
      ) {
        return `"cover" يحتاج project_name/client_name/pm_name/current_phase/status كنصوص، meeting_date نص أو null، progress_percent رقم 0-100.`;
      }
      return null;
    case "executive_summary":
      if (!isNonEmptyString(o.summary) || !isStringArray(o.key_points)) {
        return `"executive_summary" يحتاج summary نص، key_points مصفوفة نصوص.`;
      }
      return null;
    case "business_problem":
      if (
        !isNonEmptyString(o.problem_statement) ||
        !isArrayOf(o.timeline, isTimelineEntry) ||
        !isArrayOf(o.pain_points, isPainPointItem) ||
        !isNonEmptyString(o.business_impact)
      ) {
        return `"business_problem" يحتاج problem_statement/business_impact نصوص، timeline وpain_points مصفوفات بالشكل الصحيح.`;
      }
      return null;
    case "business_goals":
      if (!isArrayOf(o.goals, isGoalItem) || !isArrayOf(o.kpis, isKpiItem)) {
        return `"business_goals" يحتاج goals وkpis مصفوفات بالشكل الصحيح.`;
      }
      return null;
    case "current_workflow":
      if (!isArrayOf(o.steps, isWorkflowStep)) return `"current_workflow" يحتاج steps مصفوفة بالشكل الصحيح.`;
      return null;
    case "future_workflow":
      if (!isArrayOf(o.steps, isWorkflowStep) || !isStringArray(o.improvements)) {
        return `"future_workflow" يحتاج steps مصفوفة بالشكل الصحيح، improvements مصفوفة نصوص.`;
      }
      return null;
    case "actors":
      if (!isArrayOf(o.actors, isActorCard)) return `"actors" يحتاج actors مصفوفة بالشكل الصحيح.`;
      return null;
    case "modules":
      if (!isArrayOf(o.modules, isModuleItem)) return `"modules" يحتاج modules مصفوفة بالشكل الصحيح.`;
      return null;
    case "screens":
      if (!isArrayOf(o.screens, isScreenCard)) return `"screens" يحتاج screens مصفوفة بالشكل الصحيح.`;
      return null;
    case "architecture":
      if (
        !isNonEmptyString(o.frontend) ||
        !isNonEmptyString(o.backend) ||
        !isNonEmptyString(o.database) ||
        !isNonEmptyString(o.storage) ||
        !isNonEmptyString(o.authentication) ||
        !isStringArray(o.integrations)
      ) {
        return `"architecture" يحتاج frontend/backend/database/storage/authentication نصوص، integrations مصفوفة نصوص.`;
      }
      return null;
    case "timeline":
      if (!isArrayOf(o.milestones, isMilestoneItem)) return `"timeline" يحتاج milestones مصفوفة بالشكل الصحيح.`;
      return null;
    case "risks":
      if (!isArrayOf(o.risks, isRiskItem)) return `"risks" يحتاج risks مصفوفة بالشكل الصحيح.`;
      return null;
    case "open_questions":
      if (!isArrayOf(o.questions, (q): q is { question: string; context: string } => isObject(q) && isNonEmptyString(q.question) && isNonEmptyString(q.context))) {
        return `"open_questions" يحتاج questions مصفوفة {question, context}.`;
      }
      return null;
    case "client_decisions":
      if (
        !isArrayOf(
          o.decisions,
          (d): d is { decision: string; date: string | null; rationale: string } =>
            isObject(d) && isNonEmptyString(d.decision) && isNullableDateString(d.date) && isNonEmptyString(d.rationale)
        )
      ) {
        return `"client_decisions" يحتاج decisions مصفوفة {decision, date, rationale}.`;
      }
      return null;
    case "final_summary":
      if (!isStringArray(o.next_steps) || !isStringArray(o.meeting_objectives) || !isNonEmptyString(o.closing_note)) {
        return `"final_summary" يحتاج next_steps وmeeting_objectives مصفوفات نصوص، closing_note نص.`;
      }
      return null;
    default:
      return `مفتاح شريحة غير معروف: "${key}".`;
  }
}

/**
 * يتحقق من رد توليد العرض كامل: JSON صالح، 15 مفتاحًا بالضبط بنفس
 * الأسماء المطلوبة، وكل شريحة بشكلها البنيوي المحدد لها.
 */
export function validateMeetingPresentation(raw: string | null): MeetingPresentationValidationResult {
  if (!raw || raw.trim().length === 0) {
    return { ok: false, reason: "الرد من نموذج الذكاء الاصطناعي فارغ." };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.trim());
  } catch {
    return { ok: false, reason: "الرد ليس JSON صالحًا." };
  }

  if (!isObject(parsed)) {
    return { ok: false, reason: "الرد ليس كائن JSON." };
  }

  const obj = parsed;
  const actualKeys = Object.keys(obj);

  const missingKeys = EXPECTED_KEYS.filter((k) => !actualKeys.includes(k));
  if (missingKeys.length > 0) {
    return { ok: false, reason: `شرائح ناقصة: ${missingKeys.join(", ")}` };
  }

  const extraKeys = actualKeys.filter((k) => !(EXPECTED_KEYS as readonly string[]).includes(k));
  if (extraKeys.length > 0) {
    return { ok: false, reason: `شرائح إضافية غير مسموحة: ${extraKeys.join(", ")}` };
  }

  for (const key of EXPECTED_KEYS) {
    const error = validateSlide(key, obj[key]);
    if (error) return { ok: false, reason: error };
  }

  return { ok: true, data: obj as unknown as MeetingPresentationSlides };
}

export type MeetingPresentationSlideValidationResult =
  | { ok: true; value: unknown }
  | { ok: false; reason: string };

/**
 * يتحقق من رد إعادة توليد شريحة واحدة: JSON صالح، مفتاح واحد بالظبط
 * (نفس اسم الشريحة المطلوبة)، وشكلها البنيوي المحدد صحيح.
 */
export function validateMeetingPresentationSlide(
  raw: string | null,
  slideKey: MeetingPresentationSlideKey
): MeetingPresentationSlideValidationResult {
  if (!raw || raw.trim().length === 0) {
    return { ok: false, reason: "الرد من نموذج الذكاء الاصطناعي فارغ." };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.trim());
  } catch {
    return { ok: false, reason: "الرد ليس JSON صالحًا." };
  }

  if (!isObject(parsed)) {
    return { ok: false, reason: "الرد ليس كائن JSON." };
  }

  const obj = parsed;
  const actualKeys = Object.keys(obj);

  if (actualKeys.length !== 1 || actualKeys[0] !== slideKey) {
    return { ok: false, reason: `المتوقع مفتاح واحد بس باسم "${slideKey}".` };
  }

  const error = validateSlide(slideKey, obj[slideKey]);
  if (error) return { ok: false, reason: error };

  return { ok: true, value: obj[slideKey] };
}
