import type { PrototypePromptStage } from "@/lib/types/database";

/**
 * قرار "إيه اللي المفروض يتولّد بعده" — منطق خالص بدون أي state أو
 * side effect، عشان يقدر يتفحص بوحدة اختبار منفصلة عن الـ UI. بيرجّع
 * أول Stage لسه "pending" وكل الـ Stages اللي بيعتمد عليها بقت "ready"،
 * أو null لو مفيش حاجة جاهزة تتولّد دلوقتي (لسه فيه واحد شغال، أو كله
 * خلص، أو فيه اعتمادية لسه معلّقة).
 */
export function findNextStageToTrigger(stages: PrototypePromptStage[]): PrototypePromptStage | null {
  if (stages.some((s) => s.status === "generating")) return null;

  const pending = stages.filter((s) => s.status === "pending");
  const ready = pending.find((s) =>
    s.depends_on.every((d) => stages.find((x) => x.stage_index === d)?.status === "ready")
  );
  return ready ?? null;
}
