import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// بدون globals:true في vitest.config.ts، الـ Cleanup التلقائي بتاع
// Testing Library ما بيشتغلش لوحده — لازم نستدعيه يدويًا بعد كل اختبار
// عشان الـ render بتاع اختبار ما يفضلش في الـ DOM للاختبار اللي بعده.
afterEach(() => {
  cleanup();
});
