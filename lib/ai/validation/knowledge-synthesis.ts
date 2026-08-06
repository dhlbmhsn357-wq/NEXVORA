import { extractJsonObject } from "@/lib/discovery-analysis/validation";
import type { BrainSectionKey } from "@/lib/brain-v2/types";
import { SYNTHESIS_TARGET_SECTIONS } from "@/lib/ai/prompts/knowledge-synthesis";

/**
 * مُحقّق نتيجة التوليف.
 *
 * حارسان أساسيان:
 *
 * 1. **حارس المرجع** — المقترح بلا `source_refs` صالحة بيتشال. المقترح
 *    ده داخل الـ Brain، وأي حاجة تدخل الـ Brain لازم يبقى ليها سند
 *    قابل للتتبّع لمستند حقيقي. من غير الحارس ده كان النموذج ممكن يضيف
 *    "أفضل ممارسة" من معرفته العامة وكأنها من مستندات العميل.
 *
 * 2. **حارس التكرار مع الـ Brain** — المقترح اللي نصه موجود بالفعل في
 *    الـ Brain بيتشال. الدمج الإضافي بيمنع التكرار الحرفي أصلًا، لكن
 *    الفحص هنا بيمنع الصياغة المختلفة لنفس المعنى كمان.
 */

export const OPERATIONAL_KINDS = [
  "approval_chain",
  "calculation",
  "exception",
  "scenario",
  "automation",
] as const;

export type OperationalKind = (typeof OPERATIONAL_KINDS)[number];

export const OPERATIONAL_LABELS: Record<OperationalKind, string> = {
  approval_chain: "سلسلة اعتماد",
  calculation: "معادلة حساب",
  exception: "استثناء",
  scenario: "سيناريو",
  automation: "فرصة أتمتة",
};

export interface SynthesisProposal {
  section: BrainSectionKey;
  title: string;
  detail: string;
  priority: "high" | "medium" | "low";
  confidence: number;
  sourceRefs: string[];
}

export interface OperationalArtifact {
  kind: OperationalKind;
  title: string;
  detail: string;
  sourceRefs: string[];
}

export interface KnowledgeSynthesisData {
  proposals: SynthesisProposal[];
  operational: OperationalArtifact[];
  /** اتشالوا لأنهم بلا مرجع صالح. */
  droppedUnsourced: number;
  /** اتشالوا لأنهم موجودون بالفعل في الـ Brain. */
  droppedDuplicate: number;
}

export type KnowledgeSynthesisResult =
  | { ok: true; data: KnowledgeSynthesisData }
  | { ok: false; reason: string };

const PRIORITIES = ["high", "medium", "low"] as const;

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function clampConfidence(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 50;
  return Math.max(0, Math.min(100, Math.round(n)));
}

/** تطبيع للمقارنة مع محتوى الـ Brain القائم. */
function normalize(text: string): string {
  return text
    .replace(/[ـ]/g, "")
    .replace(/[ً-ْٰ]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function refsOf(value: unknown, known: Set<string>): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((r) => str(r)).filter((r) => known.has(r)))];
}

export function validateKnowledgeSynthesis(
  raw: string | null,
  /** المعرّفات المسموح بها — اللي بعتناها في الـ Prompt. */
  knownRefs: Set<string>,
  /** نصوص الـ Brain القائمة، لمنع اقتراح المكرّر. */
  existingBrainStatements: string[] = []
): KnowledgeSynthesisResult {
  if (!raw || raw.trim().length === 0) {
    return { ok: false, reason: "الرد من نموذج الذكاء الاصطناعي فارغ." };
  }

  const parsed = extractJsonObject(raw);
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, reason: "الرد ليس كائن JSON صالحًا." };
  }
  const obj = parsed as Record<string, unknown>;

  const existing = new Set(existingBrainStatements.map(normalize).filter((s) => s.length > 0));
  const allowedSections = new Set<string>(SYNTHESIS_TARGET_SECTIONS);

  let droppedUnsourced = 0;
  let droppedDuplicate = 0;

  const proposals: SynthesisProposal[] = [];
  const seenTitles = new Set<string>();

  if (Array.isArray(obj.proposals)) {
    for (const entry of obj.proposals) {
      if (!entry || typeof entry !== "object") continue;
      const o = entry as Record<string, unknown>;

      const section = str(o.section);
      if (!allowedSections.has(section)) continue;

      const title = str(o.title);
      if (title.length === 0) continue;

      const sourceRefs = refsOf(o.source_refs, knownRefs);
      if (sourceRefs.length === 0) {
        droppedUnsourced += 1;
        continue;
      }

      const key = normalize(title);
      if (existing.has(key)) {
        droppedDuplicate += 1;
        continue;
      }
      // منع التكرار داخل نفس الرد كمان.
      if (seenTitles.has(`${section}|${key}`)) continue;
      seenTitles.add(`${section}|${key}`);

      const priority = str(o.priority) as (typeof PRIORITIES)[number];

      proposals.push({
        section: section as BrainSectionKey,
        title,
        detail: str(o.detail),
        priority: PRIORITIES.includes(priority) ? priority : "medium",
        confidence: clampConfidence(o.confidence),
        sourceRefs,
      });
    }
  }

  const operational: OperationalArtifact[] = [];
  const seenOperational = new Set<string>();

  if (Array.isArray(obj.operational)) {
    for (const entry of obj.operational) {
      if (!entry || typeof entry !== "object") continue;
      const o = entry as Record<string, unknown>;

      const kind = str(o.kind) as OperationalKind;
      if (!OPERATIONAL_KINDS.includes(kind)) continue;

      const title = str(o.title);
      const detail = str(o.detail);
      if (title.length === 0 || detail.length === 0) continue;

      const sourceRefs = refsOf(o.source_refs, knownRefs);
      if (sourceRefs.length === 0) {
        droppedUnsourced += 1;
        continue;
      }

      const key = `${kind}|${normalize(title)}`;
      if (seenOperational.has(key)) continue;
      seenOperational.add(key);

      operational.push({ kind, title, detail, sourceRefs });
    }
  }

  return { ok: true, data: { proposals, operational, droppedUnsourced, droppedDuplicate } };
}
