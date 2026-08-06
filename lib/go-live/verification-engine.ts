/**
 * محرّك التحقّق المؤسسي (Enterprise Verification Engine) — **وحدة نقية**.
 *
 * يقارن Source ↔ Production: التحقّق من البيانات (أعداد الكيانات: عملاء/
 * موظفون/فواتير/مخازن/فروع/مرفقات/صلاحيات...) + التحقّق التجاري (منطق الأعمال
 * لم يتغيّر) + السيناريوهات الوظيفية الحقيقية. حتمي بالكامل — الأدلّة من
 * تقارير المرحلة ٦ (التنفيذ) والمرحلة ٥ (المحاكاة).
 */

import type {
  EntityCountPair, DataCheck, DataVerificationReport,
  BusinessCheckItem, FunctionalScenario, CheckState,
} from "./verification-types";
import { STANDARD_DEPARTMENTS } from "./verification-types";

/** يتحقّق من تطابق أعداد السجلات لكل كيان بين المصدر والإنتاج. */
export function verifyData(pairs: EntityCountPair[]): DataVerificationReport {
  const checks: DataCheck[] = pairs.map((p) => {
    const difference = p.sourceCount - p.productionCount;
    const matched = difference === 0;
    return {
      entity: p.entity,
      label: p.label,
      sourceCount: p.sourceCount,
      productionCount: p.productionCount,
      difference,
      matched,
      note: matched ? "مطابق تمامًا." : `فرق ${difference} — يستحق تحقيقًا قبل الاعتماد.`,
    };
  });
  const matchedCount = checks.filter((c) => c.matched).length;
  return { checks, matchedCount, totalEntities: checks.length, fullyMatched: checks.length > 0 && matchedCount === checks.length };
}

interface BusinessInput {
  dataFullyMatched: boolean;
  brokenRelations: number;
  businessFailures: number;
  dataLossCount: number;
  criticalIssues: number;
}

/** يتحقّق أن منطق الأعمال لم يتغيّر (مبيعات/فواتير/مخزون/حسابات/صلاحيات...). */
export function verifyBusiness(input: BusinessInput): BusinessCheckItem[] {
  const st = (ok: boolean): CheckState => (ok ? "pass" : "fail");
  return [
    { key: "sales", title: "المبيعات والفواتير تعمل", state: st(input.criticalIssues === 0), detail: input.criticalIssues === 0 ? "لا أخطاء حرجة تمسّ المبيعات." : `${input.criticalIssues} مشكلة حرجة.` },
    { key: "inventory", title: "المخزون صحيح", state: st(input.businessFailures === 0), detail: input.businessFailures === 0 ? "التحقّق التجاري للمخزون سليم." : `${input.businessFailures} فشل تجاري.` },
    { key: "accounting", title: "الحسابات والإيرادات صحيحة", state: st(input.businessFailures === 0 && input.dataLossCount === 0), detail: input.dataLossCount === 0 ? "لا فقدان في القيم المالية." : `${input.dataLossCount} فقدان بيانات.` },
    { key: "relationships", title: "العلاقات (فواتير↔عملاء↔مدفوعات) سليمة", state: st(input.brokenRelations === 0), detail: input.brokenRelations === 0 ? "لا علاقات مكسورة." : `${input.brokenRelations} مرجع مكسور.` },
    { key: "reports", title: "التقارير ولوحات المؤشّرات متسقة", state: st(input.dataFullyMatched), detail: input.dataFullyMatched ? "الأعداد مطابقة فتُبنى التقارير صحيحة." : "فروق في الأعداد قد تُشوّه التقارير." },
    { key: "permissions", title: "صلاحيات المستخدمين صحيحة", state: st(input.dataLossCount === 0), detail: "تُعتمَد نهائيًا عبر قسم الموارد البشرية/الإدارة." },
    { key: "workflow", title: "Workflow والاعتمادات والإشعارات تعمل", state: "pending", detail: "تُختبَر يدويًا في UAT ويعتمدها قسم الإدارة." },
  ];
}

/** يولّد السيناريوهات الوظيفية الحقيقية لكل قسم (تُختبَر وتُعتمَد في UAT). */
export function buildFunctionalScenarios(): FunctionalScenario[] {
  const scenarios: Array<{ key: string; title: string; department: string }> = [
    { key: "create_customer", title: "إنشاء عميل جديد", department: "sales" },
    { key: "create_invoice", title: "إنشاء فاتورة", department: "sales" },
    { key: "receive_payment", title: "استلام دفعة", department: "accounting" },
    { key: "sell_item", title: "بيع صنف/سيارة", department: "sales" },
    { key: "return_item", title: "إرجاع صنف/سيارة", department: "sales" },
    { key: "transfer_inventory", title: "تحويل مخزون بين المخازن", department: "inventory" },
    { key: "approve_request", title: "اعتماد طلب (Approval)", department: "management" },
    { key: "generate_report", title: "إنشاء تقرير", department: "management" },
  ];
  return scenarios.map((s) => ({ ...s, state: "pending" as CheckState }));
}

/** قوائم الأقسام القياسية (نسخة قابلة للحفظ). */
export function buildDepartmentChecklists() {
  return STANDARD_DEPARTMENTS;
}
