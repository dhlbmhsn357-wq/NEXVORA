/**
 * Deployment Gate — القرار الفاصل "Production Ready" أو "Not Ready".
 * ممنوع اعتبار المشروع جاهزًا لو فيه أي Critical Finding غير محلول —
 * منطق حتمي بسيط عمدًا (مفيش مجال لتفسير AI هنا)، بيقرأ نتيجة الفحوصات
 * الحقيقية فقط.
 */
export function computeDeploymentGate(findings: { severity: string }[]): { productionReady: boolean; reason: string } {
  const criticalCount = findings.filter((f) => f.severity === "critical").length;
  if (criticalCount > 0) {
    return {
      productionReady: false,
      reason: `يوجد ${criticalCount} مشكلة Critical غير محلولة — لا يمكن اعتبار المشروع جاهزًا للإنتاج.`,
    };
  }
  return { productionReady: true, reason: "لا توجد مشاكل Critical — المشروع جاهز للإنتاج من ناحية Production Validation." };
}
