/**
 * NEXVORA Project Mode Banner (Print pages)
 * =========================================
 * Server component. مسموح استخدامه داخل أي print page:
 *   - mode='test'         → بانر أحمر بارز + كلاس body للـ diagonal overlay.
 *   - mode='unclassified' → تحذير أصغر (رمادي/أصفر).
 *   - mode='real'         → لا يعرض شيء.
 *
 * ملاحظة: لتفعيل الـ diagonal overlay على body، الصفحة تضيف
 * className="test-project-watermark" على <body> (تُضبط بواسطة inline script
 * بسيط لأن print pages ما بتستخدمش layout مشترك).
 */
import Script from "next/script";

export function ProjectModeBanner({ mode }: { mode: string | null | undefined }) {
  if (mode === "real") return null;

  if (mode === "test") {
    return (
      <>
        <div
          className="mb-4 rounded-lg border-2 border-red-500 bg-red-50 p-3 text-center text-sm font-semibold text-red-800"
          data-print="banner-test"
        >
          🧪 مشروع تجريبي — البيانات ليست حقيقية
        </div>
        {/* يضيف كلاس على body لتفعيل الـ ::before diagonal overlay من print.css */}
        <Script id="project-mode-watermark" strategy="afterInteractive">
          {`document.body.classList.add('test-project-watermark');`}
        </Script>
      </>
    );
  }

  // unclassified — تحذير أصغر
  return (
    <div
      className="mb-4 rounded-lg border border-yellow-500/60 bg-yellow-50 p-2 text-center text-xs text-yellow-900"
      data-print="banner-unclassified"
    >
      ⚠ نوع المشروع غير محدَّد
    </div>
  );
}
