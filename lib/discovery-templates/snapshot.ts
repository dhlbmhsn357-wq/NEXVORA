import type {
  DiscoveryQuestion,
  DiscoverySnapshotItem,
} from "@/lib/types/database";
import { formatAnswerValue } from "./field-types";

/**
 * يبني لقطة ثابتة من الأسئلة تُحفظ مع الفورم وقت التسليم. الهدف: عرض
 * الإجابات وتلخيص الـ AI يفضلوا صحيحين حتى لو القالب اتعدّل/اتحذف بعدين.
 */
export function buildQuestionsSnapshot(
  questions: DiscoveryQuestion[]
): DiscoverySnapshotItem[] {
  return questions.map((q) => ({
    key: q.id,
    label: q.question,
    type: q.type,
    category: q.category,
    order: q.sort_order,
  }));
}

export interface DiscoveryPair {
  label: string;
  value: string;
}

/**
 * يحوّل (answers + snapshot) إلى أزواج (label: value) جاهزة للعرض أو للـ AI،
 * متخطّيًا الإجابات الفاضية ومحافظًا على ترتيب اللقطة.
 */
export function buildDiscoveryPairs(
  answers: Record<string, unknown>,
  snapshot: DiscoverySnapshotItem[] | null | undefined
): DiscoveryPair[] {
  if (!snapshot || snapshot.length === 0) return [];
  const ordered = [...snapshot].sort((a, b) => a.order - b.order);
  const pairs: DiscoveryPair[] = [];
  for (const item of ordered) {
    const formatted = formatAnswerValue(answers[item.key], item.type);
    if (formatted === null) continue;
    pairs.push({ label: item.label, value: formatted });
  }
  return pairs;
}
