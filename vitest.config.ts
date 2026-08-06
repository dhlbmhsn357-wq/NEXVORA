import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    // اختبارات المنطق الخالص تفضل بيئة node (أسرع). اختبارات الـ Component
    // بتحدد jsdom بنفسها عبر تعليق // @vitest-environment jsdom في أول الملف.
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
