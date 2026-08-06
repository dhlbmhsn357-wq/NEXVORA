import type { KnowledgeCandidate } from "./pending-changes-service";
import type { BrainSectionKey } from "./types";

export type ManualNoteType =
  | "decision"
  | "risk"
  | "requirement"
  | "customer_request"
  | "business_rule"
  | "constraint"
  | "idea"
  | "priority"
  | "question"
  | "clarification"
  | "action_item"
  | "client_feedback"
  | "pain_point"
  | "dependency";

export const MANUAL_NOTE_TYPES: ManualNoteType[] = [
  "decision", "risk", "requirement", "customer_request", "business_rule",
  "constraint", "idea", "priority", "question", "clarification",
  "action_item", "client_feedback", "pain_point", "dependency",
];

export const MANUAL_NOTE_TYPE_LABELS: Record<ManualNoteType, string> = {
  decision: "قرار",
  risk: "خطر",
  requirement: "متطلب",
  customer_request: "طلب عميل",
  business_rule: "قاعدة عمل",
  constraint: "قيد",
  idea: "فكرة",
  priority: "أولوية",
  question: "سؤال",
  clarification: "توضيح",
  action_item: "مهمة (Action Item)",
  client_feedback: "ملاحظة عميل مباشرة",
  pain_point: "نقطة ألم",
  dependency: "اعتماد",
};

export const MANUAL_NOTE_TYPE_SECTION: Record<ManualNoteType, BrainSectionKey> = {
  decision: "known_facts",
  risk: "risks",
  requirement: "functional_requirements",
  customer_request: "known_facts",
  business_rule: "business_rules",
  constraint: "constraints",
  idea: "suggested_features",
  priority: "business_goals",
  question: "meeting_questions",
  clarification: "known_facts",
  action_item: "roadmap",
  client_feedback: "known_facts",
  // مفيش قسم Brain مخصّص لنقاط الألم/الاعتماديات حاليًا — أقرب قسم
  // دلاليًا: نقطة الألم حقيقة معروفة عن وضع العميل الحالي، والاعتماد
  // نوع من القيود على الحل.
  pain_point: "known_facts",
  dependency: "constraints",
};

/**
 * كل نوع ملاحظة بيتحوّل لشكل العنصر الصحيح حسب القسم المستهدف — نفس
 * أشكال البيانات المُعرَّفة أصلًا في types.ts (RiskItem، BusinessRuleItem،
 * إلخ)، صفر بنية جديدة.
 */
export function buildManualNoteCandidate(noteType: ManualNoteType, text: string): KnowledgeCandidate {
  const trimmed = text.trim();
  const sectionKey = MANUAL_NOTE_TYPE_SECTION[noteType];
  const rationale = `ملاحظة يدوية من PM (${MANUAL_NOTE_TYPE_LABELS[noteType]})`;

  const buildValue = (): unknown => {
    switch (noteType) {
      case "decision":
        return { fact: trimmed, category: "قرار يدوي من PM", evidence: [] };
      case "customer_request":
        return { fact: trimmed, category: "طلب عميل (يدوي)", evidence: [] };
      case "clarification":
        return { fact: trimmed, category: "توضيح يدوي من PM", evidence: [] };
      case "risk":
        return { risk: trimmed, cause: "مذكور يدويًا من PM", likelihood: "medium", impact: "medium", evidence: [] };
      case "requirement":
        return { statement: trimmed, evidence: [] };
      case "business_rule":
        return { rule: trimmed, rationale: "قاعدة أضافها PM يدويًا", evidence: [] };
      case "constraint":
        return { constraint: trimmed, type: "other", evidence: [] };
      case "idea":
        return { title: trimmed, rationale: "فكرة من PM", priority: "medium", evidence: [] };
      case "priority":
        return { statement: trimmed, priority: "high", evidence: [] };
      case "question":
        return { question: trimmed, reason: "ملاحظة يدوية من PM", priority: "medium" };
      case "action_item":
        return { phase: trimmed, description: "مهمة أُضيفت يدويًا من PM", deliverables: [], evidence: [] };
      case "client_feedback":
        return { fact: trimmed, category: "ملاحظة عميل مباشرة (يدوي)", evidence: [] };
      case "pain_point":
        return { fact: trimmed, category: "نقطة ألم (يدوي)", evidence: [] };
      case "dependency":
        return { constraint: trimmed, type: "other", evidence: [] };
    }
  };

  return { sectionKey, newValue: buildValue(), rationale };
}
