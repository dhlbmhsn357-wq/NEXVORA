/**
 * قائمة ثابتة Client-safe بمفاتيح المراحل الـ Continuable — منفصلة
 * عمدًا عن stage-registry.ts (اللي فيه دوال run() بتعمل import() ديناميكي
 * لمحركات فيها تبعيات Node-only زي playwright-core). لو الصفحة اللي
 * فيها الفهرس ده (Client Component) استوردت من stage-registry.ts
 * مباشرة، الـ Bundler بيحاول يجهّز نسخة Client-loadable من كل
 * أهداف الـ import() الديناميكي في نفس الملف — وده بيفشل الـ Build
 * فعليًا لو أي هدف بيستخدم Node built-ins (tls/net) مالهاش بديل في
 * المتصفح. الملف ده بديل بسيط وآمن 100% للاستخدام من الـ Client.
 *
 * ملاحظة: لازم يتحدّث يدويًا لو أي مرحلة جديدة اتضافت كـ continuable
 * في stage-registry.ts — اختبار stage-registry.test.ts بيتحقق من
 * التطابق بين الاتنين.
 */
export const CONTINUABLE_STAGE_KEYS: string[] = [
  "static_code_audit",
  "security_audit",
  "database_audit",
  "architecture_audit",
  "code_quality_audit",
  "performance_audit",
  "prd_compliance_audit",
  "functional_audit",
];
