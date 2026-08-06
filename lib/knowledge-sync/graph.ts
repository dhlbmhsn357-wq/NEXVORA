/**
 * Live Knowledge Synchronization Engine — نموذج بيانات بسيط لعلاقة
 * الاعتماد بين Project Brain (المصدر) والمشتقات المباشرة اللي بتُبنى
 * فوقه. النطاق الحالي: خطوة واحدة (Brain → مشتق مباشر)، مش تسلسل كامل
 * (مثلاً Brain → PRD → Prototype Prompt تلقائيًا) — عشان أي تغيير في
 * Brain ما يطلقش سلسلة تلقائية غير محدودة من توليدات AI بتكلفة حقيقية
 * بدون ما الـ PM يشوفها.
 */

export type SyncArtifactKey =
  | "prd"
  | "prototype_prompt"
  | "client_presentation"
  | "developer_handoff";

/** كل المشتقات اللي بتعتمد مباشرة على محتوى Project Brain v2 المعتمد. */
export const DOWNSTREAM_OF_BRAIN: readonly SyncArtifactKey[] = [
  "prd",
  "prototype_prompt",
  "client_presentation",
  "developer_handoff",
] as const;

export const SYNC_ARTIFACT_LABELS: Record<SyncArtifactKey, string> = {
  prd: "PRD",
  prototype_prompt: "Prototype Prompt",
  client_presentation: "Client Presentation",
  developer_handoff: "Developer Handoff",
};
