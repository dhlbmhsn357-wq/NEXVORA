/**
 * قواعد اختيار الملفات "القابلة للمراجعة" — مصدر واحد يشترك فيه أي
 * قارئ Repository (readRepository الحالي و repo-diff-reader الجديد)
 * بدل ما كل واحد يكرر نفس قوائم الاستثناء (بالظبط النوع من التكرار
 * اللي Static Architecture Review Engine نفسه هيتّهم عليه أي كود تاني).
 */

const SOURCE_EXTENSIONS = [
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".py",
  ".go",
  ".rb",
  ".java",
  ".cs",
  ".php",
  ".vue",
  ".svelte",
  ".css",
  ".scss",
  ".sql",
  ".prisma",
  ".graphql",
];

const ALWAYS_INCLUDE_FILENAMES = ["package.json", "README.md", "readme.md"];

const EXCLUDED_PATH_SEGMENTS = [
  "node_modules/",
  ".git/",
  ".next/",
  "dist/",
  "build/",
  "out/",
  "vendor/",
  ".vercel/",
  "coverage/",
  ".turbo/",
  ".cache/",
];

const EXCLUDED_FILENAME_PATTERNS = [
  /package-lock\.json$/,
  /yarn\.lock$/,
  /pnpm-lock\.yaml$/,
  /\.min\.(js|css)$/,
  /\.map$/,
  /\.lock$/,
];

export function isRelevantPath(path: string): boolean {
  const lower = path.toLowerCase();
  if (EXCLUDED_PATH_SEGMENTS.some((seg) => lower.includes(seg))) return false;
  if (EXCLUDED_FILENAME_PATTERNS.some((re) => re.test(lower))) return false;

  const filename = path.split("/").pop() ?? "";
  if (ALWAYS_INCLUDE_FILENAMES.includes(filename)) return true;

  return SOURCE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}
