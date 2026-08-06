/**
 * Claude Code Workflow block — يُحقَن **فقط** في البرومبتات الموجّهة لـ
 * Claude Code (target = 'claude_code'). بيوحّد ضمانات السلامة اللي كانت
 * ناقصة أو مبعثرة عبر المولّدات: Branch، منع العمل على main، تحليل
 * المشروع، Type Check، ESLint، Tests، Build، Rollback، Migration Safety،
 * Production Safety، Deployment Checklist.
 */
export function buildClaudeCodeWorkflowBlock(): string {
  return `## Workflow إلزامي (لأن هذا البرومبت موجّه لـ Claude Code)
قبل أي كود، وأثناء التنفيذ، والتزم بالخطوات دي بالترتيب:
1. أنشئ Branch جديد للمهمة — **ممنوع العمل مباشرة على main**.
2. حلّل المشروع والملفات المتأثرة قبل أي تعديل؛ التزم بالأنماط الموجودة.
3. عدّل فقط ما يخص المهمة — لا تلمس أي شيء خارج نطاقها.
4. بعد التعديل شغّل بالترتيب وأصلح أي فشل قبل المتابعة:
   - Type Check (tsc --noEmit)
   - ESLint
   - Tests (vitest / الاختبارات الموجودة)
   - Build (next build)
5. أي تعديل على قاعدة البيانات لازم يكون بـ migration مستقلة، additive، وآمنة (Migration Safety) — لا تكسر بيانات موجودة.
6. اكتب خطة Rollback واضحة لو احتاج التراجع.
7. راعِ سلامة الإنتاج (Production Safety): لا Downtime، لا كسر لمستخدمين حاليين.
8. قدّم Deployment Checklist مختصر قبل اعتبار المهمة جاهزة.`;
}
