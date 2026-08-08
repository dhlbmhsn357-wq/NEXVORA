/**
 * Prototype Studio — Pure derivation helpers
 * ==========================================
 * منطق حسابي خالص، بدون DB أو Server. مناسب للاختبار المباشر.
 */
import type {
  PrototypeStudioArtifactRow,
  PrototypeStudioConfigRow,
  StudioReadiness,
} from "./types";

/**
 * يحسب مؤشّر جاهزية Studio (0..100) بناءً على:
 *   - وجود config فيه هدف/personas/flows/scope
 *   - وجود Context Pack
 *   - وجود Build Brief معتمد
 *   - وجود Codex Build Pack
 */
export function computeStudioReadiness(
  config: PrototypeStudioConfigRow,
  artifacts: readonly PrototypeStudioArtifactRow[],
): StudioReadiness {
  const missing: string[] = [];
  const recommended: string[] = [];
  let score = 0;

  // Config (40 نقطة)
  if (config.prototypeGoal.trim().length >= 10) score += 10;
  else missing.push("هدف النموذج");
  if (config.primaryPersonas.length > 0) score += 8;
  else missing.push("Personas أساسية");
  if (config.coreFlows.length > 0) score += 8;
  else missing.push("Core flows");
  if (config.inScopeItems.length > 0 || config.outOfScopeItems.length > 0) score += 7;
  else missing.push("تحديد النطاق");
  if (config.designReferences.length > 0) score += 7;
  else recommended.push("إضافة مرجع بصري واحد على الأقل");

  const hasContextPack = artifacts.some((a) => a.artifactType === "context_pack");
  const hasApprovedBrief = artifacts.some(
    (a) => a.artifactType === "build_brief" && a.status === "approved",
  );
  const hasCodexPack = artifacts.some((a) => a.artifactType === "codex_build_pack");

  if (hasContextPack) score += 20;
  else missing.push("Context Pack");
  if (hasApprovedBrief) score += 25;
  else missing.push("Build Brief معتمد");
  if (hasCodexPack) score += 15;
  else recommended.push("توليد Codex Build Pack");

  return { score: Math.min(100, Math.max(0, score)), missing, recommended };
}
