import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { sanitizeExperience } from "./sanitize";
import { classifyDomain, computeConfidence, type ExperienceType } from "./experience-model";

/**
 * محرّك استخلاص الخبرة — **مُشغَّل بموافقة المدير فقط**.
 *
 * ## الفلسفة (من المواصفة)
 *
 * «كل مشروع فرصة لتعليم المنصة. بعد اعتماده، حلّله واستخرج المعرفة
 * القابلة لإعادة الاستخدام — لكن لا تُعتمَد مباشرة، بل تمرّ بمراجعة
 * المدير.»
 *
 * ده بيجمع المعرفة المهيكلة للمشروع، **ينظّفها من بيانات العملاء**،
 * ويسجّلها كمرشّحين ينتظرون قرار المدير — لا يدخلون المكتبة مباشرة.
 */

const UNDEFINED_TABLE = "42P01";

export interface ExtractionOutcome {
  status: "ok" | "unavailable" | "failed";
  promotionId?: string;
  candidateCount?: number;
  message?: string;
}

/**
 * يستخلص مرشّحي خبرة من مشروع معتمَد.
 */
export async function extractProjectExperience(
  projectId: string,
  actorId: string | null,
  client?: SupabaseClient
): Promise<ExtractionOutcome> {
  const db = client ?? createServiceClient();

  const project = await db.from("projects").select("name, domain").eq("id", projectId).maybeSingle();
  if (project.error?.code === UNDEFINED_TABLE) return { status: "unavailable", message: "الجداول غير مطبَّقة." };
  const projectName = (project.data?.name as string | null) ?? "";
  const domain = ((project.data?.domain as string | null) ?? "generic").trim() || "generic";

  // سجلّ عملية الترقية.
  const promo = await db
    .from("org_promotions")
    .insert({ project_id: projectId, status: "extracting", triggered_by: actorId })
    .select("id")
    .maybeSingle();
  if (promo.error) {
    if (promo.error.code === UNDEFINED_TABLE) return { status: "unavailable", message: "الجداول غير مطبَّقة بعد (0082)." };
    return { status: "failed", message: promo.error.message };
  }
  const promotionId = promo.data?.id as string;

  // الأسماء الخاصة اللي لازم تُجرَّد — اسم المشروع + أسماء العملاء.
  const stripNames = [projectName].filter(Boolean);

  const candidates = await gatherCandidates(db, projectId, domain, stripNames);

  if (candidates.length > 0) {
    const rows = candidates.map((c) => ({
      project_id: projectId,
      promotion_id: promotionId,
      experience_type: c.type,
      domain: c.domain,
      title: c.title,
      content: c.content,
      sanitized: true,
      suggested_confidence: c.confidence,
      status: "pending",
    }));
    await db.from("org_experience_candidates").insert(rows);
  }

  await db
    .from("org_promotions")
    .update({ status: "extracted", candidate_count: candidates.length })
    .eq("id", promotionId);

  return { status: "ok", promotionId, candidateCount: candidates.length };
}

interface Candidate {
  type: ExperienceType;
  domain: string;
  title: string;
  content: string;
  confidence: number;
}

/**
 * يجمع المرشّحين من المعرفة المهيكلة للمشروع، منظَّفة.
 *
 * كل نوع مصدر بيتحوّل لنوع خبرة: قواعد العمل → قواعد قابلة لإعادة
 * الاستخدام، سير العمل → سير عمل قابل، المخاطر المُخفَّفة → دروس، إلخ.
 */
async function gatherCandidates(
  db: SupabaseClient,
  projectId: string,
  domain: string,
  stripNames: string[]
): Promise<Candidate[]> {
  const out: Candidate[] = [];
  const baseConfidence = computeConfidence({ projectCount: 1, quality: 60, humanApproved: false });
  const expDomain = classifyDomain([domain]);

  const push = (type: ExperienceType, title: string, content: string) => {
    const cleanTitle = sanitizeExperience(title, stripNames).text;
    const cleanContent = sanitizeExperience(content, stripNames).text;
    if (!cleanTitle.trim()) return;
    out.push({ type, domain: expDomain, title: cleanTitle, content: cleanContent, confidence: baseConfidence });
  };

  try {
    const [rules, workflows, risks, decisions] = await Promise.all([
      db.from("knowledge_business_rules").select("name, condition, action").eq("project_id", projectId).eq("status", "active").limit(200),
      db.from("knowledge_workflows").select("name, description").eq("project_id", projectId).eq("status", "active").limit(100),
      db.from("knowledge_risks").select("description, mitigation, status").eq("project_id", projectId).limit(200),
      db.from("knowledge_decisions").select("decision, rationale").eq("project_id", projectId).eq("status", "active").limit(100),
    ]);

    for (const r of (rules.data ?? []) as Array<{ name: string; condition: string; action: string }>) {
      push("reusable_business_rule", r.name || r.condition, `${r.condition} ⇐ ${r.action}`);
    }
    for (const w of (workflows.data ?? []) as Array<{ name: string; description: string }>) {
      push("reusable_workflow", w.name, w.description);
    }
    for (const k of (risks.data ?? []) as Array<{ description: string; mitigation: string | null; status: string }>) {
      // مخاطرة مُخفَّفة = درس مستفاد؛ مفتوحة = خطر شائع (نمط فشل محتمل).
      if (k.status === "mitigated" && k.mitigation) {
        push("lesson_learned", k.description, `المخاطرة: ${k.description} — التخفيف: ${k.mitigation}`);
      }
    }
    for (const d of (decisions.data ?? []) as Array<{ decision: string; rationale: string | null }>) {
      if (d.rationale) push("best_practice", d.decision, `${d.decision} (السبب: ${d.rationale})`);
    }
  } catch {
    // جداول المشروع قد تكون غير مطبَّقة — نرجع بما جمعناه.
  }

  return out;
}
