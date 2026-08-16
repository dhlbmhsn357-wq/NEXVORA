/**
 * NEXVORA Product Definition — State Machines Types (0122)
 * ==========================================================
 * التقاط مُهيكل بسيط لآلات الحالة (State Machines) — سلسلة حالات مرتّبة +
 * انتقالات وصفية اختيارية، زي مثال مثاني:
 *   Request Received → Scheduled → Ready → Live → Evaluated → Passed/Failed
 *
 * عمدًا بسيط: مفيش بيانات رسم بياني بصري (لا إحداثيات، لا layout) — بيتعرض
 * في الواجهة كنص/سلسلة أسهم زي ما مثاني نفسه بيعرضها. مصدر zero-invention
 * صارم لقسم PRD `state_machines_detail` (0122) — نفس ضمان business_rules
 * /system_messages (0116): المستخدم بيكتبه، الـ AI ممنوع يخترعه.
 */

export interface StateMachineTransition {
  from: string;
  to: string;
  trigger: string;
}

export interface StateMachineRow {
  id: string;
  projectId: string;
  name: string; // اسم الآلة (مثال: "دورة حياة طلب الاختبار")
  description: string;
  states: string[]; // بالترتيب: ["Request Received", "Scheduled", ...]
  transitions: StateMachineTransition[]; // وصف الانتقالات (اختياري تفصيليًا)
  linkedPersonaId: string | null;
  linkedFlowId: string | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
}
