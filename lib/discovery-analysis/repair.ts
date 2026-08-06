import type { DiscoverySnapshotItem } from "@/lib/types/database";
import type { DiscoveryAnalysisOutput } from "./types";

/**
 * إصلاح لطيف لناتج التحليل بعد اجتيازه الفحص: يملأ حقول تتبّع الدليل
 * الناقصة (question_id/question_label) دون تغيير أي محتوى فعلي.
 *
 * السبب: الـ AF أحيانًا بيسيب question_label فاضي في عنصر evidence واحد
 * وسط ردّ ضخم. نص السؤال موجود أصلاً عندنا في لقطة القالب مربوطًا بالـ id،
 * فنستنتجه بدل ما نرفض التحليل كله على فجوة تجميلية.
 */
export function backfillEvidenceLabels(
  output: DiscoveryAnalysisOutput,
  snapshot: DiscoverySnapshotItem[]
): DiscoveryAnalysisOutput {
  const labelById = new Map<string, string>();
  for (const item of snapshot) {
    // الـ AI بيرجع الـ id بعد "Q:" في الـ prompt — وهو نفسه snapshot.key
    labelById.set(item.key, item.label);
  }

  // نمشي على الكائن كله بشكل عام، ونتعرف على عناصر الـ evidence بشكلها
  // ({ quote, question_id?, question_label? }) ونصلّحها في مكانها.
  walk(output, labelById);
  return output;
}

/**
 * إصلاح ذاتي **قبل** الفحص: بعض الموديلات (خصوصًا gpt-5-mini) بتسيب
 * مصفوفة evidence فاضية في عنصر أو اتنين وسط رد ضخم سليم. رفض التحليل
 * كله على الفجوة دي كان بيضيّع دقايق شغل حقيقي — بدل كده:
 *  - أي عنصر دليل غير صالح (بلا quote نصّي) بيتشال.
 *  - لو المصفوفة فضيت/كانت فاضية أصلًا، بنحط دليل «استنتاج» صريح
 *    وبنخفّض ثقة العنصر لحد أقصى 40 عشان الواجهة تعرضه بصدق كاستنتاج.
 * بيرجع عدد المواضع اللي اتصلّحت (للتسجيل).
 */
export function backfillMissingEvidence(root: unknown): number {
  let repaired = 0;

  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const child of node) visit(child);
      return;
    }
    if (!node || typeof node !== "object") return;
    const rec = node as Record<string, unknown>;

    if ("evidence" in rec) {
      const arr = Array.isArray(rec.evidence) ? rec.evidence : [];
      const valid = arr.filter(
        (e) =>
          e !== null &&
          typeof e === "object" &&
          typeof (e as Record<string, unknown>).quote === "string" &&
          ((e as Record<string, unknown>).quote as string).trim().length > 0
      );
      if (valid.length === 0) {
        rec.evidence = [
          {
            quote: "غير مذكور نصًّا في إجابات الاكتشاف — استنتاج تحليلي من سياق النموذج ككل.",
            question_id: "",
            question_label: "استنتاج تحليلي",
          },
        ];
        repaired++;
        // خفّض الثقة عشان العنصر يظهر بصدق كاستنتاج مش كحقيقة مدعومة
        const conf = rec.confidence as Record<string, unknown> | undefined;
        if (conf && typeof conf === "object" && typeof conf.score === "number" && conf.score > 40) {
          conf.score = 40;
        }
      } else if (valid.length !== arr.length || !Array.isArray(rec.evidence)) {
        rec.evidence = valid;
        repaired++;
      }
    }

    for (const key of Object.keys(rec)) visit(rec[key]);
  };

  visit(root);
  return repaired;
}

function walk(node: unknown, labelById: Map<string, string>): void {
  if (Array.isArray(node)) {
    for (const child of node) walk(child, labelById);
    return;
  }
  if (!node || typeof node !== "object") return;

  const rec = node as Record<string, unknown>;

  // عنصر evidence = فيه quote نصّي + مفتاح تتبّع
  const isEvidenceRef =
    typeof rec.quote === "string" &&
    ("question_id" in rec || "question_label" in rec);

  if (isEvidenceRef) {
    if (typeof rec.question_id !== "string") rec.question_id = "";
    const labelEmpty =
      typeof rec.question_label !== "string" || rec.question_label.trim() === "";
    if (labelEmpty) {
      const id = rec.question_id as string;
      rec.question_label = labelById.get(id) ?? (id ? `سؤال ${id}` : "مصدر التحليل");
    }
  }

  for (const key of Object.keys(rec)) {
    walk(rec[key], labelById);
  }
}
