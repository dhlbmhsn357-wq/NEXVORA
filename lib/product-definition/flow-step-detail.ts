/**
 * NEXVORA Product Definition — Flow Step Detail Helpers (P6/0116 Part 2)
 * =========================================================================
 * منطق خالص (pure) بدون أي I/O — يُستخدم في:
 *  - definition-panel.tsx: شارة "تفاصيل تنفيذية" على ملخّص الخطوة المطوية.
 *  - prd-panel.tsx: تجميع flow_specifications (مصفوفة مسطّحة لكل خطوة لها
 *    تفاصيل) حسب اسم التدفّق لعرضها مجمّعة.
 */
import type { FlowStep } from "./types";
import type { PRDFlowSpecification } from "@/lib/types/database";

type StepDetailShape = Pick<FlowStep, "uiElements" | "successMessage" | "errorMessages">;

export interface StepDetailCounts {
  uiElements: number;
  hasSuccessMessage: boolean;
  errorMessages: number;
}

/** يحسب عدد عناصر التفاصيل التنفيذية الموجودة فعليًا في خطوة تدفّق. */
export function stepDetailCounts(step: StepDetailShape): StepDetailCounts {
  return {
    uiElements: step.uiElements?.length ?? 0,
    hasSuccessMessage: !!step.successMessage?.trim(),
    errorMessages: step.errorMessages?.length ?? 0,
  };
}

/** true لو الخطوة فيها أي تفصيل تنفيذي واحد على الأقل (عنصر واجهة/رسالة نجاح/رسالة خطأ). */
export function hasStepDetail(step: StepDetailShape): boolean {
  const c = stepDetailCounts(step);
  return c.uiElements > 0 || c.hasSuccessMessage || c.errorMessages > 0;
}

/** نص شارة مختصر للعرض على ملخّص الخطوة المطوية — null لو مفيش تفاصيل. */
export function stepDetailBadgeLabel(step: StepDetailShape): string | null {
  const c = stepDetailCounts(step);
  const parts: string[] = [];
  if (c.uiElements > 0) parts.push(`${c.uiElements} ${c.uiElements === 1 ? "عنصر واجهة" : "عناصر واجهة"}`);
  if (c.hasSuccessMessage) parts.push("رسالة نجاح");
  if (c.errorMessages > 0) parts.push(`${c.errorMessages} ${c.errorMessages === 1 ? "رسالة خطأ" : "رسائل خطأ"}`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

export interface FlowSpecificationGroup {
  flowName: string;
  items: PRDFlowSpecification[];
}

/**
 * تجميع مصفوفة flow_specifications المسطّحة (سطر واحد لكل خطوة موثَّقة)
 * حسب flow_name — بترتيب أول ظهور (Map بيحافظ على ترتيب الإدراج).
 */
export function groupFlowSpecificationsByFlow(specs: PRDFlowSpecification[]): FlowSpecificationGroup[] {
  const map = new Map<string, PRDFlowSpecification[]>();
  for (const spec of specs) {
    const key = spec.flow_name || "—";
    const list = map.get(key);
    if (list) list.push(spec);
    else map.set(key, [spec]);
  }
  return Array.from(map.entries()).map(([flowName, items]) => ({ flowName, items }));
}
