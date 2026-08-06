import type { PromptContextBlock, PromptSource } from "./types";

/**
 * Context Engine — يوحّد تجميع السياق. كل عنصر سياق بيحمل:
 * - key: مفتاح متطلب الجاهزية (يطابق profile.readinessRequirements)
 * - title/content: كتلة العرض في البرومبت
 * - source: مصدر للـ Versioning (اختياري)
 *
 * الفكرة: كل مرحلة بتبني عناصرها من محمّلات السياق الموجودة أصلًا
 * (getBrainForDownstreamGeneration، getAggregatedDiscovery، ...) وتسيب
 * التطبيع + اشتقاق presentKeys (المفاتيح المتوفّرة فعلًا) هنا — فالجاهزية
 * والتركيب بيشتغلوا بنفس المنطق لكل المراحل بلا تكرار.
 */
export interface ContextItem {
  key: string;
  title: string;
  content: string;
  source?: PromptSource;
}

export interface ContextBuildResult {
  blocks: PromptContextBlock[];
  /** مفاتيح متطلبات الجاهزية المتوفّرة فعليًا (محتوى غير فارغ). */
  presentKeys: Set<string>;
  sources: PromptSource[];
}

function hasContent(content: string): boolean {
  return typeof content === "string" && content.trim().length > 0;
}

/** يبني نتيجة سياق موحّدة من عناصر خام — يتجاهل الفارغ ويشتق presentKeys/sources. */
export function buildContextResult(items: ContextItem[]): ContextBuildResult {
  const blocks: PromptContextBlock[] = [];
  const presentKeys = new Set<string>();
  const sources: PromptSource[] = [];

  for (const item of items) {
    if (!hasContent(item.content)) continue;
    presentKeys.add(item.key);
    blocks.push({ title: item.title, content: item.content });
    if (item.source) sources.push(item.source);
  }

  return { blocks, presentKeys, sources };
}
