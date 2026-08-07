import type { Metadata } from "next";
import { Tajawal } from "next/font/google";
import "../globals.css";

const tajawal = Tajawal({
  subsets: ["arabic", "latin"],
  weight: ["300", "400", "500", "700", "800", "900"],
  variable: "--font-tajawal",
});

/**
 * Root Layout مستقل تمامًا لبوابة اعتماد العميل العامة (P11).
 * بدون manifest / SW / Toaster / Topbar — عزل كامل عن كود لوحة التحكم.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

export default function ApproveRootLayout({
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
