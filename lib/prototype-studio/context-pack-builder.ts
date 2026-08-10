/**
 * Prototype Studio — Context Pack Builder
 * =======================================
 * تجميع deterministic لـ Context Pack (Markdown) من مصادر متعدّدة عبر
 * service functions فقط. لا AI. لا `select *` مباشرة. أي قسم ناقص:
 *   • يظهر في المخرج كـ `[معلومات ناقصة — <السبب>]`
 *   • يُرجع كذلك في المصفوفة `missing[]` للـ UI
 */
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getConfig } from "./config-service";
import { filterConfidentialResearch } from "./security-filter";
import { getBrainForDownstreamGeneration } from "@/lib/brain-v2/downstream-context";
import { listPersonas, listFlows, listRequirements } from "@/lib/product-definition/service";
import { listStories, listAcceptanceCriteria } from "@/lib/user-stories/service";
import { listItems as listDecisions } from "@/lib/product-decisions/service";
import { listMarketResearchItems } from "@/lib/market-research/service";
import type { PRD } from "@/lib/types/database";
import type {
  PrototypeStudioConfigRow,
  DesignDirection,
  DesignReference,
} from "./types";

const MISSING_TAG = "[معلومات ناقصة]";

function line(md: string[], s: string) { md.push(s); }
function blank(md: string[]) { md.push(""); }
function heading(md: string[], level: number, text: string) {
  md.push(`${"#".repeat(level)} ${text}`);
  md.push("");
}
function bulletsOr(md: string[], items: readonly string[], missingReason: string, missing: string[]) {
  if (!items || items.length === 0) {
    md.push(`${MISSING_TAG} ${missingReason}`);
    missing.push(missingReason);
  } else {
    for (const it of items) md.push(`- ${it}`);
  }
  md.push("");
}

/** يوحّد hex لبادئة `#` واحدة (يتحمّل input مثل "##0E7490" أو "0E7490"). */
function normalizeHex(hex: string): string {
  const clean = (hex ?? "").replace(/^#+/, "").trim();
  return clean ? `#${clean}` : "—";
}

function renderDesignDirection(dd: DesignDirection): string[] {
  const out: string[] = [];
  out.push(`- **الأسلوب البصري:** ${dd.visual_style || "—"}`);
  out.push(`- **كثافة الواجهة:** ${dd.ui_density}`);
  out.push(`- **التخطيط:** ${dd.layout_preference || "—"}`);
  out.push(`- **أسلوب التنقّل:** ${dd.navigation_preference || "—"}`);
  out.push(`- **ملاحظات الوصول (a11y):** ${dd.accessibility_notes || "—"}`);
  if (dd.brand_colors.length > 0) {
    out.push(`- **ألوان العلامة:** ${dd.brand_colors.map((c) => `${c.name} (${normalizeHex(c.hex)})`).join(" · ")}`);
  }
  if (dd.typography.heading || dd.typography.body) {
    out.push(`- **الطباعة:** heading=${dd.typography.heading || "—"} · body=${dd.typography.body || "—"} · sizes=${dd.typography.sizes || "—"}`);
  }
  return out;
}

function renderDesignReferences(refs: DesignReference[]): string[] {
  if (refs.length === 0) return [`${MISSING_TAG} لم يتم تحديد مراجع بصرية`];
  const out: string[] = [];
  for (const r of refs) {
    out.push(`- **${r.url}**`);
    if (r.liked) out.push(`  - نستفيد منه: ${r.liked}`);
    if (r.avoid) out.push(`  - نتجنّب منه: ${r.avoid}`);
    if (r.notes) out.push(`  - ملاحظات: ${r.notes}`);
  }
  return out;
}

function renderConfig(cfg: PrototypeStudioConfigRow, md: string[]) {
  heading(md, 2, "Studio Config");
  line(md, `- **نوع النموذج:** ${cfg.prototypeType}`);
  line(md, `- **الهدف:** ${cfg.prototypeGoal || "—"}`);
  line(md, `- **المنصّة:** ${cfg.platform}`);
  line(md, `- **مستوى الدقة:** ${cfg.fidelity}`);
  line(md, `- **اللغة:** ${cfg.language} (RTL=${cfg.isRtl ? "نعم" : "لا"})`);
  line(md, `- **متطلّبات الـ Backend:** ${cfg.backendRequirement}`);
  line(md, `- **استراتيجية البيانات:** ${cfg.dataStrategy}`);
  blank(md);
}

function renderPrd(prd: PRD | null, md: string[], missing: string[]) {
  heading(md, 2, "PRD (نسخة معتمدة أو أحدث)");
  if (!prd) {
    line(md, `${MISSING_TAG} لم يتم توليد PRD بعد`);
    missing.push("PRD");
    blank(md);
    return;
  }
  line(md, `_الإصدار ${prd.version} · الحالة ${prd.status}_`);
  blank(md);
  line(md, "### نظرة عامة");
  line(md, prd.overview || "—");
  blank(md);
  line(md, "### بيان المشكلة");
  line(md, prd.problem_statement || "—");
  blank(md);
  line(md, "### الأهداف");
  bulletsOr(md, prd.goals ?? [], "أهداف PRD", missing);
  line(md, "### خارج النطاق");
  bulletsOr(md, prd.out_of_scope ?? [], "PRD out-of-scope", missing);
  line(md, "### المتطلّبات الوظيفية");
  bulletsOr(md, prd.functional_requirements ?? [], "متطلّبات وظيفية", missing);
  line(md, "### مقاييس النجاح");
  bulletsOr(md, prd.success_metrics ?? [], "مقاييس نجاح", missing);
}

export interface ContextPackResult {
  md: string;
  missing: string[];
  pinnedPrdVersion: number | null;
  pinnedBrainVersion: number | null;
  pinnedConfigUpdatedAt: string | null;
}

export async function buildContextPackMarkdown(projectId: string): Promise<ContextPackResult> {
  const supabase = await createClient();
  const missing: string[] = [];

  const [cfg, brain, personas, flows, requirements, stories, acs, decisions, marketRaw] = await Promise.all([
    getConfig(projectId),
    getBrainForDownstreamGeneration(supabase, projectId),
    listPersonas(projectId),
    listFlows(projectId),
    listRequirements(projectId),
    listStories(projectId),
    listAcceptanceCriteria(projectId),
    listDecisions(projectId, {}),
    listMarketResearchItems(projectId),
  ]);

  const { data: prdRow } = await supabase
    .from("prd").select("*").eq("project_id", projectId).maybeSingle();
  const prd = prdRow as PRD | null;

  const publicMarket = filterConfidentialResearch(marketRaw);

  const md: string[] = [];
  heading(md, 1, "Prototype Studio — Context Pack");
  line(md, `_تم التوليد آليًا (بدون AI) من مصادر NEXVORA — مراجعة بشرية مطلوبة قبل الاستخدام._`);
  blank(md);

  renderConfig(cfg, md);

  heading(md, 2, "In-Scope / Out-of-Scope");
  line(md, "### In-Scope");
  bulletsOr(md, cfg.inScopeItems, "عناصر داخل النطاق", missing);
  line(md, "### Out-of-Scope");
  bulletsOr(md, cfg.outOfScopeItems, "عناصر خارج النطاق", missing);

  renderPrd(prd, md, missing);

  heading(md, 2, "Project Brain (نسخة downstream)");
  if (!brain) {
    line(md, `${MISSING_TAG} لا توجد نسخة Brain متاحة`);
    missing.push("Project Brain");
    blank(md);
  } else {
    line(md, `_الإصدار ${brain.version} · معتمد=${brain.isApproved ? "نعم" : "لا"}_`);
    blank(md);
  }

  heading(md, 2, "Personas");
  if (personas.length === 0) {
    line(md, `${MISSING_TAG} لم يتم تعريف personas`);
    missing.push("Personas");
    blank(md);
  } else {
    for (const p of personas) {
      line(md, `- **${p.name}** (${p.role || "—"})${p.isPrimary ? " · أساسي" : ""}`);
    }
    blank(md);
  }

  heading(md, 2, "User Flows");
  if (flows.length === 0) {
    line(md, `${MISSING_TAG} لم يتم تعريف تدفّقات`);
    missing.push("User Flows");
    blank(md);
  } else {
    for (const f of flows) {
      line(md, `- **${f.name}** — ${f.description || "—"}`);
    }
    blank(md);
  }

  heading(md, 2, "Requirements");
  if (requirements.length === 0) {
    line(md, `${MISSING_TAG} لم يتم تعريف متطلّبات`);
    missing.push("Requirements");
    blank(md);
  } else {
    for (const r of requirements) {
      line(md, `- [${r.priority}] **${r.title}** — ${r.description || "—"}`);
    }
    blank(md);
  }

  heading(md, 2, "User Stories + Acceptance Criteria");
  if (stories.length === 0) {
    line(md, `${MISSING_TAG} لا توجد user stories`);
    missing.push("User Stories");
    blank(md);
  } else {
    for (const s of stories) {
      const linkedAcs = acs.filter((a) => a.userStoryId === s.id);
      line(md, `- **${s.title}** — كـ${s.asA ? ` ${s.asA}` : ""}${s.iWant ? `، أريد ${s.iWant}` : ""}`);
      for (const a of linkedAcs) line(md, `  - AC (${a.title}): Given ${a.givenClause}; When ${a.whenClause}; Then ${a.thenClause}`);
    }
    blank(md);
  }

  heading(md, 2, "Open Decisions / Risks / Questions");
  const openDecisions = decisions.filter((d) => d.status !== "resolved" && d.status !== "rejected");
  if (openDecisions.length === 0) {
    line(md, "(لا يوجد بنود مفتوحة)");
    blank(md);
  } else {
    for (const d of openDecisions) {
      line(md, `- [${d.itemType}/${d.priority}] **${d.title}** — ${d.status}`);
    }
    blank(md);
  }

  heading(md, 2, "أبحاث سوق عامّة (public only)");
  if (publicMarket.length === 0) {
    line(md, "(لا توجد أبحاث سوقية عامّة — الأبحاث الداخلية/السرّية مستبعدة أمنيًا)");
    blank(md);
  } else {
    for (const m of publicMarket) {
      line(md, `- **${m.title}** — ${m.summary || "—"}`);
    }
    blank(md);
  }

  heading(md, 2, "Design Direction");
  for (const l of renderDesignDirection(cfg.designDirection)) line(md, l);
  blank(md);

  heading(md, 2, "Design References");
  for (const l of renderDesignReferences(cfg.designReferences)) line(md, l);
  if (cfg.designReferences.length === 0) missing.push("Design References");
  blank(md);

  heading(md, 2, "Deny-List Notice");
  line(md, "استُبعدت الحقول التالية أمنيًا: `ai_task_model_config`, `commercial*`, `handoff_partners`, `raw_prompt`, `sync_status`, `private_notes`, والأبحاث المصنّفة `internal`/`confidential`.");
  blank(md);

  // Prepend UTF-8 BOM (U+FEFF) so Windows apps render the Arabic correctly
  // instead of guessing a codepage and showing mojibake (e.g. `ط...`).
  return {
    md: "﻿" + md.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n",
    missing,
    pinnedPrdVersion: prd?.version ?? null,
    pinnedBrainVersion: brain?.version ?? null,
    pinnedConfigUpdatedAt: cfg.updatedAt,
  };
}
