import type { PromptTemplate } from "./types";

export const lovableTemplate: PromptTemplate = {
  toolName: "Lovable",
  toolGuidance: `هذا البرومت موجّه لـ Lovable — منصة بناء تطبيقات ويب كاملة (Frontend + Backend بسيط) من وصف نصي، بتنتج مشروع متكامل جاهز للنشر السريع.

اكتب التعليمات بافتراض إن الأداة:
- بتبني التطبيق كامل مرة واحدة (مش خطوة خطوة زي أداة Coding تفاعلية)، فالوضوح والاكتمال في كل قسم أهم من التسلسل الخطوي.
- بتدير الـ Backend والـ Database بشكل مبسّط بنفسها — وضّح في Technical Context لو محتاجين تكامل خارجي (Auth, API خارجي) صراحة.
- الأولوية لتطبيق شغال بالكامل من أول توليد (End-to-End)، فاذكر في Definition of Done إن كل الـ User Stories المذكورة لازم تكون قابلة للاستخدام فعليًا.`,
};
