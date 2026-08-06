import type { PromptTemplate } from "./types";

export const claudeCodeTemplate: PromptTemplate = {
  toolName: "Claude Code",
  toolGuidance: `هذا البرومت موجّه لـ Claude Code — أداة Agentic Coding بتشتغل مباشرة جوه مشروع كود حقيقي على جهاز المستخدم، وبتقدر تنشئ ملفات، تعدّل كود موجود، تشغّل أوامر Terminal، وتتفاعل مع Git.

اكتب التعليمات بافتراض إن الأداة:
- هتبدأ من مشروع فاضي أو هيكل مشروع موجود بالفعل، فوضّح الافتراض في قسم Technical Context.
- بتقدر تنفذ خطوات متسلسلة (تثبيت حزم، إنشاء ملفات، تشغيل اختبارات) — استخدم تعليمات تنفيذية واضحة ومرقّمة لما يكون مناسب.
- محتاجة تعرف بنية المجلدات والتقنيات المتوقعة بالتحديد (Framework, Language, Package Manager) في Technical Context.
- الجودة بتتقاس بقابلية الكود للتشغيل والاختبار فعليًا، مش بس الشكل.`,
};
