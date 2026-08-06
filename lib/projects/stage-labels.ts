import type { ProjectStage } from "@/lib/types/database";

export const stageLabels: Record<string, string> = {
  lead: "عميل محتمل",
  intake: "استلام البيانات",
  research: "بحث وتحليل",
  discovery_meeting: "اجتماع الاستكشاف",
  scope_proposal: "النطاق والعرض",
  prototype: "نموذج أولي",
  build: "التنفيذ",
  launch: "الإطلاق",
  support: "الدعم",
  reopened: "أُعيد فتحه",
};

// الأزرق محجوز كـ Accent — شارة المرحلة بتاخد لون دلالي بدل ما كل مرحلة تبقى زرقاء.
export const stageTones: Record<string, "neutral" | "success" | "warning"> = {
  lead: "neutral",
  intake: "neutral",
  research: "neutral",
  discovery_meeting: "neutral",
  scope_proposal: "neutral",
  prototype: "neutral",
  build: "neutral",
  launch: "success",
  support: "success",
  reopened: "warning",
};

export const knownStages: ProjectStage[] = [
  "lead",
  "intake",
  "research",
  "discovery_meeting",
  "scope_proposal",
  "prototype",
  "build",
  "launch",
  "support",
  "reopened",
];

// ترتيب خطي لدورة حياة المشروع (بدون reopened اللي مش جزء من التسلسل
// الطبيعي) — بيُستخدم لحساب نسبة تقدّم حتمية من مرحلة المشروع نفسها،
// صفر بيانات مُخترعة.
const progressOrder: string[] = [
  "lead",
  "intake",
  "research",
  "discovery_meeting",
  "scope_proposal",
  "prototype",
  "build",
  "launch",
  "support",
];

export function stageProgressPercent(stage: string): number {
  const effectiveStage = stage === "reopened" ? "build" : stage;
  const index = progressOrder.indexOf(effectiveStage);
  if (index === -1) return 0;
  return Math.round(((index + 1) / progressOrder.length) * 100);
}
