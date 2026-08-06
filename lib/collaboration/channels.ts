import type { ProjectChannelKey } from "@/lib/types/database";

/** قنوات المشروع الفرعية الثابتة + تسمياتها — وحدة نقية (آمنة للكلاينت). */
export const PROJECT_CHANNELS: ProjectChannelKey[] = [
  "general",
  "development",
  "design",
  "testing",
  "deployment",
  "support",
];

const CHANNEL_LABELS: Record<ProjectChannelKey, string> = {
  general: "عام",
  development: "التطوير",
  design: "التصميم",
  testing: "الاختبار",
  deployment: "النشر",
  support: "الدعم",
};

export function channelLabel(key: ProjectChannelKey): string {
  return CHANNEL_LABELS[key] ?? key;
}
