/**
 * NEXVORA Sector Standards — Prototype Change Prompt + Standard Learning
 * Types (0125، المرحلة ج)
 * ============================================================================
 * "Prototype Change Prompt" = نص جاهز يلصقه المستخدم في أداة Prototype
 * خارجية (Google Stitch/Figma Make/Codex/Claude Code/Bolt)، مبني حصريًا
 * على change_impacts المُطبَّقة فعليًا لطلب تغيير معيّن — راجع migration
 * 0125 وprototype-prompt-service.ts.
 *
 * "Standard Learning Signal" = صف بيانات خام واحد لكل أثر تغيير مُطبَّق،
 * بذرة تجميع مستقبلية — مفيش أي منطق تحليل/aggregation في هذه المرحلة.
 */

export interface PrototypeChangePromptRow {
  id: string;
  changeRequestId: string;
  promptText: string;
  prototypeTool: string | null;
  generatedAt: string;
  generatedBy: string | null;
}

export interface StandardLearningSignalRow {
  id: string;
  standardProjectId: string | null;
  clientProjectId: string;
  changeRequestId: string;
  changeType: string;
  artifactType: string;
  impactType: string;
  title: string;
  recordedAt: string;
}
