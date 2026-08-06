import type { PromptTemplate } from "./types";

export const v0Template: PromptTemplate = {
  toolName: "v0",
  toolGuidance: `هذا البرومت موجّه لـ v0 (أداة توليد واجهات من Vercel) — بتبني React Components جاهزة باستخدام Next.js وTailwind CSS وshadcn/ui بشكل أساسي.

اكتب التعليمات بافتراض إن الأداة:
- هتنتج مكوّنات React/Next.js بالدرجة الأولى، فركّز في UI Guidelines على وصف بصري دقيق (Layout, Spacing, Components, States) بدل تفاصيل Backend عميقة.
- بتفهم مكتبة shadcn/ui وTailwind بشكل جيد — اذكرهم صراحة لو مناسبين بدل وصف عام.
- مش دايمًا متصلة بـ Backend حقيقي فورًا، فوضّح في Technical Context لو المطلوب Mock Data أو تكامل فعلي.
- الأولوية للنتيجة البصرية القابلة للمعاينة الفورية.`,
};
