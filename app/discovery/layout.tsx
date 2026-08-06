import type { Metadata } from "next";
import { Tajawal } from "next/font/google";
import "../globals.css";

const tajawal = Tajawal({
  subsets: ["arabic", "latin"],
  weight: ["300", "400", "500", "700", "800", "900"],
  variable: "--font-tajawal",
});

/**
 * Root Layout مستقل تمامًا لبوابة الاكتشاف العامة — Next.js بيدعم أكتر
 * من Root Layout واحد لما تشيل layout.tsx من app/ وتحطّ واحد لكل قسم
 * علوي. هنا عمدًا:
 *   - بدون manifest (مفيش app/discovery/manifest.ts، وبدون <link rel="manifest">).
 *   - بدون Service Worker registration.
 *   - بدون Install Prompt.
 *   - بدون Toaster / Topbar / أي مكوّن من لوحة التحكم الداخلية.
 * النتيجة: زر "Install App" ما بيظهرش خالص على رابط العميل، والـ bundle
 * بتاع الصفحة معزول تمامًا عن كود المنصة الداخلية.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

export default function DiscoveryRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ar" dir="rtl" className={`h-full antialiased ${tajawal.variable}`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
