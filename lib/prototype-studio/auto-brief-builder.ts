/**
 * Prototype Studio — Auto Build Brief fallback
 * ============================================
 * Builds a minimal Build Brief markdown from Studio config when no
 * ChatGPT-approved brief exists. Deterministic, no AI. Marked as
 * `brief_source: "auto"` so downstream flows know it wasn't reviewed
 * by a human in a ChatGPT session.
 */
import type { PrototypeStudioConfigRow } from "./types";

function bulletList(items: readonly string[], emptyText: string): string {
  if (!items || items.length === 0) return `- _(${emptyText})_`;
  return items.map((i) => `- ${i}`).join("\n");
}

export function buildAutoBriefFromConfig(cfg: PrototypeStudioConfigRow): string {
  const dd = cfg.designDirection;
  const brandColors = dd.brand_colors.length > 0
    ? dd.brand_colors.map((c) => `${c.name} (${c.hex})`).join(" · ")
    : "—";
  const typography = (dd.typography.heading || dd.typography.body)
    ? `heading=${dd.typography.heading || "—"} · body=${dd.typography.body || "—"}`
    : "—";

  return `# Build Brief (Auto-Generated Fallback)

> ملاحظة: هذا Brief مُوَلَّد آليًا من إعدادات Studio لأنه لا يوجد Brief معتمَد من ChatGPT.
> جودة الإخراج أفضل بكثير عند إجراء نقاش ChatGPT واعتماد النسخة الناتجة.

## Objective
${cfg.prototypeGoal.trim() || "_(لم يُحدَّد هدف — أضف هدف النموذج في إعدادات Studio)_"}

## Prototype Type & Fidelity
- **النوع:** ${cfg.prototypeType}
- **مستوى الدقة:** ${cfg.fidelity}
- **المنصّة:** ${cfg.platform}

## In-Scope
${bulletList(cfg.inScopeItems, "لم يُحدَّد نطاق داخلي")}

## Out-of-Scope (لا تُنفَّذ حتى لو بدت مفيدة)
${bulletList(cfg.outOfScopeItems, "لم يُحدَّد نطاق مُستبعَد")}

## Core Flows — Build These FIRST (Phase 1 MVP)
${bulletList(cfg.coreFlows, "لم تُحدَّد تدفّقات أساسية")}

## Design Direction
- **الأسلوب البصري:** ${dd.visual_style || "—"}
- **كثافة الواجهة:** ${dd.ui_density}
- **التخطيط:** ${dd.layout_preference || "—"}
- **أسلوب التنقّل:** ${dd.navigation_preference || "—"}
- **ألوان العلامة:** ${brandColors}
- **الطباعة:** ${typography}
- **ملاحظات a11y:** ${dd.accessibility_notes || "—"}

## Data Strategy
- **استراتيجية البيانات:** ${cfg.dataStrategy} (mocked/in-memory — لا backend حقيقي)
- **متطلّبات backend:** ${cfg.backendRequirement}

## Language / RTL
- **اللغة الأساسية:** ${cfg.language}
- **RTL:** ${cfg.isRtl ? "نعم — كل الشاشات RTL أوّلًا" : "لا"}

## Personas الأساسية
${bulletList(cfg.primaryPersonas, "لم تُحدَّد personas")}

---
_مُوَلَّد آليًا من Studio config في ${new Date().toISOString()}. للجودة القصوى، أنشئ نسخة معتمَدة عبر نقاش ChatGPT._
`;
}
