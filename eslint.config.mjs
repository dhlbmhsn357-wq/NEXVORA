import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * حارس بوابة الذكاء الاصطناعي.
 *
 * المواصفة تقول: «لا يُسمح لأي جزء من المشروع باستدعاء Gemini مباشرة».
 * الاعتماد على الانضباط وحده يفشل مع أول مطوّر مستعجل، فالمنع هنا
 * **بنيوي**: أي استيراد لطبقة المزوّدين من خارج البوابة يكسر الفحص
 * اللغوي، فيفشل البناء قبل الدمج لا بعد النشر.
 *
 * المسموح لها بالاستيراد: البوابة نفسها، وطبقة الذكاء الاصطناعي القائمة
 * (`lib/ai/**`) لأنها هي المزوّد وسجلّه، واختباراتها.
 */
const AI_PROVIDER_GUARD = {
  files: ["**/*.ts", "**/*.tsx"],
  ignores: [
    "lib/ai-platform/gateway/**",
    "lib/ai/**",
    "**/*.test.ts",
    "scripts/**",
  ],
  rules: {
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          {
            group: [
              "**/lib/ai/providers/*",
              "@/lib/ai/providers/*",
              "**/lib/ai/registry",
              "@/lib/ai/registry",
            ],
            message:
              "ممنوع استدعاء مزوّد الذكاء الاصطناعي مباشرة. استخدم بوابة المنصة: lib/ai-platform/gateway — أو أدرج مهمة في الطابور بنوع من ai.*",
          },
        ],
      },
    ],
  },
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  AI_PROVIDER_GUARD,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
