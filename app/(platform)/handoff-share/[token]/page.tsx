import { notFound } from "next/navigation";
import HandoffPackageBody from "@/components/handoff/HandoffPackageBody";
import PrintButton from "@/components/ui/PrintButton";
import { verifyHandoffShareToken } from "@/lib/handoff/share-token";
import "@/app/print.css";

/**
 * صفحة مشاركة عامة لحزمة التسليم بدون تسجيل دخول.
 * التحقق: HMAC token يوقّع (projectId + packageId).
 * القراءة عبر Service Role Client من داخل HandoffPackageBody.
 */
export default async function HandoffSharePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams?: Promise<{ includeAll?: string }>;
}) {
  const { token } = await params;
  const sp = (await searchParams) ?? {};
  const includeAll = sp.includeAll === "1" || sp.includeAll === "true";

  const verified = verifyHandoffShareToken(token);
  if (!verified) notFound();

  return (
    <>
      <div className="mx-auto max-w-3xl px-8 pt-6" dir="rtl">
        <div className="no-print mb-4 rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
          <strong>حزمة تسليم للقراءة فقط (Read-Only)</strong> — تم مشاركتها معك عبر رابط موقّع.
          يمكنك حفظها كـ PDF من زر الطباعة بالأسفل.
        </div>
        <div className="no-print mb-6">
          <PrintButton />
        </div>
      </div>
      <HandoffPackageBody
        projectId={verified.projectId}
        packageId={verified.packageId}
        includeAll={includeAll}
      />
    </>
  );
}
