import type { Metadata, Viewport } from "next";
import { Tajawal, Inter } from "next/font/google";
import Toaster from "@/components/ui/Toaster";
import ServiceWorkerRegister from "./components/service-worker-register";
import InstallPrompt from "./components/install-prompt";
import { LocaleProvider } from "@/lib/i18n/context";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { getLocale } from "@/lib/i18n/server";
import { dirForLocale } from "@/lib/i18n/config";
import "../globals.css";

const tajawal = Tajawal({
  subsets: ["arabic", "latin"],
  weight: ["300", "400", "500", "700", "800", "900"],
  variable: "--font-tajawal",
});

// خط الأرقام/المصطلحات التقنية — مستخدم فقط عبر .font-mono-plex
// (الإحصائيات، النسخ، الأكواد)، مش بديل لـ Tajawal في النص العربي.
const inter = Inter({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "PM Operating System — VELORA",
  description: "العقل المركزي لإدارة دورة حياة مشاريع VELORA.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "VELORA PM",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0f1e" },
  ],
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const dict = getDictionary(locale);
  return (
    <html lang={locale} dir={dirForLocale(locale)} className={`h-full antialiased ${tajawal.variable} ${inter.variable}`}>
      <head>
        {/* بيطبّق تفضيل الوضع المحفوظ قبل أول Paint — يمنع أي وميض بين
            الفاتح والغامق وقت تحميل الصفحة. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem("pm-os-theme");if(t==="dark"||(!t&&window.matchMedia("(prefers-color-scheme: dark)").matches)){document.documentElement.setAttribute("data-theme","dark");}}catch(e){}`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">
        <LocaleProvider locale={locale} dict={dict}>
          {children}
          <Toaster />
          <ServiceWorkerRegister />
          <InstallPrompt />
        </LocaleProvider>
      </body>
    </html>
  );
}
