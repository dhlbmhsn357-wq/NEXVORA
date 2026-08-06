import type { DetectedEntity, CanonicalEntity } from "./semantic-detection";

/**
 * كشف تدفّق الأعمال — **وحدة نقية بلا I/O**.
 *
 * يحاول فهم كيف تتحرّك البيانات (Customer → Quotation → Order → Invoice →
 * Payment → Receipt) بمطابقة الكيانات المكتشَفة مع سلاسل تدفّق معروفة.
 * يعرض Workflow مبدئيًا لكل مجال — نقطة بداية للمراجعة البشرية.
 */

export interface BusinessFlow {
  name: string;
  steps: CanonicalEntity[];
  presentSteps: CanonicalEntity[];
  coverage: number; // نسبة خطوات التدفّق الموجودة فعلًا
}

/** سلاسل تدفّق قياسية معروفة عبر المجالات. */
const KNOWN_FLOWS: Array<{ name: string; steps: CanonicalEntity[] }> = [
  { name: "دورة المبيعات", steps: ["customer", "quotation", "order", "invoice", "payment", "receipt"] },
  { name: "دورة المشتريات", steps: ["supplier", "purchase", "inventory", "payment"] },
  { name: "دورة المخزون", steps: ["product", "inventory", "order", "shipment"] },
  { name: "دورة الموارد البشرية", steps: ["employee", "department", "payment"] },
  { name: "الدورة المحاسبية", steps: ["account", "transaction", "invoice", "payment"] },
  { name: "دورة الدعم", steps: ["customer", "ticket"] },
  { name: "الدورة التعليمية", steps: ["student", "course", "enrollment"] },
  { name: "الدورة الصحّية", steps: ["patient", "appointment", "prescription", "invoice"] },
];

/**
 * يبني التدفّقات المبدئية من الكيانات المكتشَفة. يُبقي فقط التدفّقات التي
 * وُجد منها خطوتان+ (تجنّب ضوضاء تطابق خطوة واحدة).
 */
export function detectBusinessFlows(entities: DetectedEntity[]): BusinessFlow[] {
  const present = new Set(entities.filter((e) => e.entity !== "unknown").map((e) => e.entity));
  const flows: BusinessFlow[] = [];

  for (const flow of KNOWN_FLOWS) {
    const presentSteps = flow.steps.filter((s) => present.has(s));
    if (presentSteps.length >= 2) {
      flows.push({
        name: flow.name,
        steps: flow.steps,
        presentSteps,
        coverage: Math.round((presentSteps.length / flow.steps.length) * 100),
      });
    }
  }

  return flows.sort((a, b) => b.coverage - a.coverage);
}
