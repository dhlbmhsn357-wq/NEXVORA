/**
 * بيانات صرفة (Viewports) بدون أي اعتماد على Playwright — مفصولة عمدًا
 * عن browser-runner.ts (اللي بيستورد "playwright" في أول السطر). أي
 * ملف بيحتاج بس شكل الـ Viewport Matrix (زي generation-service.ts وقت
 * إنشاء الجلسة) لازم يستورد من هنا، مش من browser-runner.ts — وإلا
 * هيسحب Playwright كاملة في أي Server Component بيستخدمه (راجع حادثة
 * انهيار صفحة المشروع الموثّقة في generation-service.ts).
 */

export interface ViewportSpec {
  name: string;
  width: number;
  height: number;
}

export const VIEWPORT_MATRIX: ViewportSpec[] = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "mobile", width: 375, height: 812 },
];
