import { STAGE_REGISTRY, getStageDefinition } from "./registry";
import type { StageState, WorkflowStageKey } from "./types";

/**
 * تعميم لفكرة lib/knowledge-sync/resync-engine.ts (اللي كانت بتغطي بس
 * "Brain → 4 مراحل مباشرة" بشكل مسطّح) على الـ 22 مرحلة كاملة، وبشكل
 * Transitive حقيقي: لو Brain اتغيّر وPRD لسه مبنّهش (Adapter لسه مقارنش
 * نسخته)، لازم Prototype Prompt وكل اللي بعده يتعلّموا "محتاج إعادة
 * توليد" برضه — مش بس القريب المباشر. **تعليم بس، مفيش أي إعادة توليد
 * تلقائية هنا** — نفس فلسفة resync-engine.ts's الأصلية بالظبط.
 */

export interface StalenessResult {
  stale: boolean;
  reason: string | null;
  /** direct: نسخة المصدر تغيّرت فعليًا (حسبها الـ Adapter). transitive: مرحلة سابقة في السلسلة عليها نفس التعليم. */
  source: "direct" | "transitive" | null;
}

/** كل مرحلة → المراحل اللي بتعتمد عليها هي مباشرة (نسخة من registry.dependencies، للتوثيق والاختبار). */
export function getUpstreamOf(key: WorkflowStageKey): WorkflowStageKey[] {
  return getStageDefinition(key)?.dependencies ?? [];
}

/** كل مرحلة → المراحل اللي بتعتمد عليها هي (عكس الاتجاه) — يفيد في "لو غيّرت X، مين هيتأثر". */
export function getDownstreamOf(key: WorkflowStageKey): WorkflowStageKey[] {
  return STAGE_REGISTRY.filter((s) => s.dependencies.includes(key)).map((s) => s.id);
}

/**
 * بيرجّع نتيجة Staleness لكل مرحلة موجودة في states، بالاعتماد على:
 * 1. isStale المباشرة اللي الـ Adapter نفسه حسبها لكل مرحلة (مقارنة
 *    نسخة فعلية بنسخة اتولّدت منها).
 * 2. انتشار Transitive: أي مرحلة من مراحلها الأعلى (dependencies)
 *    عليها تعليم Stale (مباشر أو Transitive هو نفسه)، فهي كمان محتاجة
 *    إعادة توليد — حتى لو نسختها هي شخصيًا لسه "متوافقة" مع مصدرها
 *    المباشر، لأن السلسلة كلها فوقها اتغيّرت.
 *
 * الترتيب في STAGE_REGISTRY مضمون Topological (كل dependencies بتشاور
 * على مرحلة order أصغر) فمعالجة المراحل بترتيبها كافية — مفيش حاجة
 * لـ Sort إضافي أو كشف Cycle.
 */
export function computeStaleness(states: Partial<Record<WorkflowStageKey, StageState>>): Record<WorkflowStageKey, StalenessResult> {
  const result = {} as Record<WorkflowStageKey, StalenessResult>;

  for (const stage of STAGE_REGISTRY) {
    const state = states[stage.id];
    const directStale = !!state?.versionInfo.isStale;

    let transitiveSource: { key: WorkflowStageKey; displayName: string } | null = null;
    for (const depKey of stage.dependencies) {
      if (result[depKey]?.stale) {
        transitiveSource = { key: depKey, displayName: getStageDefinition(depKey)?.displayName ?? depKey };
        break;
      }
    }

    if (directStale) {
      result[stage.id] = { stale: true, reason: state?.versionInfo.staleReason ?? "المصدر تغيّر منذ آخر توليد.", source: "direct" };
    } else if (transitiveSource) {
      result[stage.id] = {
        stale: true,
        reason: `تحتاج إعادة توليد بسبب تحديث في "${transitiveSource.displayName}".`,
        source: "transitive",
      };
    } else {
      result[stage.id] = { stale: false, reason: null, source: null };
    }
  }

  return result;
}
