import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // microphone=(self): تسجيل الاجتماع داخل المنصة (Live Meeting Mode)
  // محتاج الميكروفون. القيمة () بتقفله على **كل** المصادر بما فيها
  // الموقع نفسه، فالمتصفح كان بيرفض getUserMedia مهما سمح المستخدم —
  // الرفض كان جاي من الرأس ده مش من إعدادات المتصفح. الكاميرا والموقع
  // الجغرافي مقفولين زي ما هما لأن مفيش أي ميزة بتستخدمهم.
  { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig: NextConfig = {
  // playwright/@sparticuz/chromium بيعتمدوا على require() ديناميكي
  // لملفات فعلية (زي browsers.json) — بندل Turbopack/Webpack العادي
  // بيفشل يكتشفها وقت التتبّع الثابت (Static File Tracing) فيسيبها
  // بره حزمة الدالة على Vercel، وهو بالظبط سبب الخطأ اللي حصل في
  // الإنتاج (production-monitoring cron). "External" بيخلّي الحزمتين
  // دول يتحمّلوا بـ require() عادي وقت التشغيل من node_modules زي ما
  // هما، بدل ما Next يحاول يبندلهم.
  serverExternalPackages: ["playwright", "playwright-core", "@sparticuz/chromium"],
  // serverExternalPackages لوحدها بتمنع الـ Bundling بس — مش بتضمن إن
  // Vercel هيرفع ملفات البيانات دي (browsers.json وملفات تانية) فعليًا
  // جوّه حزمة الدالة، لأن Static File Tracing (nft) بيكتشف الملفات
  // المطلوبة بتتبّع require()/import ثابت، وplaywright بيحمّل
  // browsers.json بطريقة ديناميكية مش قابلة للتتبّع الثابت. النتيجة:
  // حتى بعد "External"، الملف كان بيفضل غير موجود على الخادم فعليًا،
  // وهو السبب إن نفس الخطأ استمرّ في production-monitoring رغم إصلاح
  // launchBrowser() نفسه. outputFileTracingIncludes بيفرض تضمين
  // الملفات دي صراحةً لكل Route بيستخدم Playwright فعليًا.
  // ملاحظة: المفتاح glob pattern بيتقارن (عبر picomatch) مع الـ Route
  // بعد إزالة أي Route Group منه (زي (platform)) وأي لاحقة page/route —
  // فبيبقى "/dashboard/projects/[id]" بالظبط. لكن [id] في صياغة glob
  // بتتفسّر كـ Character Class (تطابق حرف "i" أو "d" بس) مش نص حرفي،
  // فلازم Escape للقوسين المربعين (\\[id\\]) وإلا المفتاح مبيتطابقش
  // نهائيًا مع أي Route فيه Dynamic Segment.
  outputFileTracingIncludes: {
    "/api/cron/production-monitoring": [
      "./node_modules/playwright-core/**",
      "./node_modules/@sparticuz/chromium/**",
    ],
    "/dashboard/projects/\\[id\\]": [
      "./node_modules/playwright-core/**",
      "./node_modules/@sparticuz/chromium/**",
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
