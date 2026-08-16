import type { PersonaRow, RequirementRow, UserFlowRow, FlowStep } from "@/lib/product-definition/types";
import type { UserStoryRow } from "@/lib/user-stories/types";
import type { BusinessRuleRow, SystemMessageRow } from "@/lib/product-definition/business-rules-types";

/**
 * NEXVORA PRD — تجميع حسب الشخصية/الموديول (0122)
 * ===================================================
 * دالة خالصة (Pure Function) — بدون أي وصول لقاعدة بيانات — تعيد تجميع
 * محتوى مُهيكل بالفعل (stories/requirements/business_rules/system_messages
 * /flows) حسب linkedPersonaId/personaId الموجود بالفعل في كل جدول. الهدف:
 * تقليد أسلوب مثاني في تقسيم PRD لموديولات (Student Module / Teacher
 * Module / Admin Module...) بدل قايمة مسطّحة واحدة لكل نوع قسم.
 *
 * زيرو اختراع: الدالة دي مجرد إعادة تجميع (Regrouping) لمحتوى مُهيكَل
 * ملتقط بالفعل — لا تُضيف ولا تُنشئ أي محتوى جديد.
 *
 * قرار معماري مهم — "ما يُحسب موديول":
 *   • كل شخصية مسجّلة فعليًا في المشروع (product_personas) بتظهر كموديول
 *     مستقل، حتى لو حاليًا فاضية من أي عنصر مرتبط — ده بيطابق روح مثاني
 *     نفسه (بنية موديولات صريحة وثابتة زي Student/Teacher/Admin، مش قايمة
 *     ديناميكية بتختفي وتظهر حسب البيانات).
 *   • أي عنصر (قصة/متطلب/قاعدة عمل/رسالة نظام/تدفّق) من غير ربط بشخصية
 *     (أو مربوط بشخصية اتمسحت/مش موجودة فعليًا في القايمة) بيروح لموديول
 *     "عام" — وده بيظهر بس لو فيه فعلًا محتوى غير مرتبط (منعًا لموديول
 *     فاضي بلا فايدة). **ممنوع تمامًا إسقاط أي عنصر غير مرتبط بصمت** —
 *     ده أهم ضمان في الدالة دي.
 */

export const GENERAL_MODULE_LABEL = "عام";

export interface PersonaModuleStoryItem {
  id: string;
  code: string | null;
  title: string;
  asA: string;
  iWant: string;
  soThat: string;
  status: string;
}

export interface PersonaModuleRequirementItem {
  id: string;
  code: string | null;
  title: string;
  description: string;
  priority: string;
  status: string;
}

export interface PersonaModuleBusinessRuleItem {
  id: string;
  title: string;
  triggerCondition: string;
  thresholdValue: string;
  onViolation: string;
}

export interface PersonaModuleSystemMessageItem {
  id: string;
  eventName: string;
  messageType: string;
  messageText: string;
}

export interface PersonaModuleFlowItem {
  flowId: string;
  flowName: string;
  /** خطوات التدفّق بتفاصيلها التنفيذية (uiElements/successMessage/errorMessages) — نفس شكل UserFlowRow.steps. */
  steps: FlowStep[];
}

export interface PersonaModule {
  /** null = "عام / غير مرتبط بشخصية محددة" */
  personaId: string | null;
  personaName: string;
  personaRole: string | null;
  userStories: PersonaModuleStoryItem[];
  requirements: PersonaModuleRequirementItem[];
  businessRules: PersonaModuleBusinessRuleItem[];
  systemMessages: PersonaModuleSystemMessageItem[];
  flowSpecifications: PersonaModuleFlowItem[];
}

function emptyModule(personaId: string | null, personaName: string, personaRole: string | null): PersonaModule {
  return {
    personaId,
    personaName,
    personaRole,
    userStories: [],
    requirements: [],
    businessRules: [],
    systemMessages: [],
    flowSpecifications: [],
  };
}

/**
 * يجمّع كل المحتوى المُهيكل حسب الشخصية المرتبطة. الترتيب: بنفس ترتيب
 * مصفوفة `personas` المُمرَّرة (المتوقع إنها جاية بالفعل من `listPersonas`
 * بترتيبها الافتراضي: is_primary ثم created_at) — الدالة دي مش بتعيد
 * الترتيب. موديول "عام" دايمًا آخر عنصر في المخرَج، ولو فقط كان فيه
 * محتوى غير مرتبط فعليًا.
 */
export function groupByPersona(
  personas: PersonaRow[],
  stories: UserStoryRow[],
  requirements: RequirementRow[],
  businessRules: BusinessRuleRow[],
  systemMessages: SystemMessageRow[],
  flows: UserFlowRow[]
): PersonaModule[] {
  const byPersonaId = new Map<string, PersonaModule>();
  for (const p of personas) {
    byPersonaId.set(p.id, emptyModule(p.id, p.name, p.role || null));
  }
  const general = emptyModule(null, GENERAL_MODULE_LABEL, null);

  const bucketFor = (personaId: string | null): PersonaModule => {
    if (personaId && byPersonaId.has(personaId)) return byPersonaId.get(personaId) as PersonaModule;
    return general;
  };

  for (const s of stories) {
    bucketFor(s.linkedPersonaId).userStories.push({
      id: s.id,
      code: s.code,
      title: s.title,
      asA: s.asA,
      iWant: s.iWant,
      soThat: s.soThat,
      status: s.status,
    });
  }

  for (const r of requirements) {
    bucketFor(r.linkedPersonaId).requirements.push({
      id: r.id,
      code: r.code,
      title: r.title,
      description: r.description,
      priority: r.priority,
      status: r.status,
    });
  }

  for (const b of businessRules) {
    bucketFor(b.linkedPersonaId).businessRules.push({
      id: b.id,
      title: b.title,
      triggerCondition: b.triggerCondition,
      thresholdValue: b.thresholdValue,
      onViolation: b.onViolation,
    });
  }

  for (const m of systemMessages) {
    bucketFor(m.linkedPersonaId).systemMessages.push({
      id: m.id,
      eventName: m.eventName,
      messageType: m.messageType,
      messageText: m.messageText,
    });
  }

  for (const f of flows) {
    bucketFor(f.personaId).flowSpecifications.push({
      flowId: f.id,
      flowName: f.name,
      steps: f.steps,
    });
  }

  const result = Array.from(byPersonaId.values());

  const generalHasContent =
    general.userStories.length > 0 ||
    general.requirements.length > 0 ||
    general.businessRules.length > 0 ||
    general.systemMessages.length > 0 ||
    general.flowSpecifications.length > 0;

  if (generalHasContent) result.push(general);

  return result;
}
