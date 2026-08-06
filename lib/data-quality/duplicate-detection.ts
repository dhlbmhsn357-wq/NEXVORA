import type { Dataset } from "./dataset";
import { bestMatchScore, normalizeForMatch, phoneticKey } from "./fuzzy-match";

/**
 * محرّك كشف التكرار الذكي — **وحدة نقية بلا I/O**.
 *
 * لا يعتمد على التطابق الحرفي: يجمّع السجلات المتشابهة دلاليًا/صوتيًا
 * («Mohamed Ali / محمد علي / Mohamad Aly») في مجموعات، ويقترح إجراءً
 * (دمج/إبقاء/أرشفة/مراجعة) — بلا حذف تلقائي.
 */

export type DuplicateAction = "merge" | "keep_both" | "archive" | "manual_review";

export interface DuplicateGroup {
  keyField: string;
  members: Array<{ rowIndex: number; value: string }>;
  similarity: number; // متوسّط تشابه المجموعة
  matchMethod: "exact" | "normalized" | "fuzzy" | "phonetic";
  suggestedAction: DuplicateAction;
  confidence: number;
}

const HIGH = 92;
const MID = 80;

/** يختار أفضل حقل مفتاح للمطابقة (name/email/phone). */
export function pickKeyField(fields: string[]): string | null {
  const lower = fields.map((f) => f.toLowerCase());
  const byPriority = ["name", "full_name", "customer_name", "اسم", "email", "phone", "mobile"];
  for (const p of byPriority) {
    const idx = lower.findIndex((f) => f.includes(p));
    if (idx >= 0) return fields[idx];
  }
  return fields[0] ?? null;
}

/**
 * يكتشف مجموعات التكرار على حقل مفتاح. يستخدم فهرسًا صوتيًا لتقليل
 * المقارنات (blocking) ثم يقارن داخل كل كتلة تقريبيًا.
 */
export function detectDuplicates(ds: Dataset, keyField?: string, opts: { maxRows?: number } = {}): DuplicateGroup[] {
  const field = keyField ?? pickKeyField(ds.fields);
  if (!field) return [];
  const maxRows = opts.maxRows ?? 20000;
  const rows = ds.rows.slice(0, maxRows);

  // Blocking بمفتاح صوتي لتفادي O(n²) الكامل.
  const blocks = new Map<string, Array<{ rowIndex: number; value: string; norm: string }>>();
  rows.forEach((row, i) => {
    const value = (row[field] ?? "").trim();
    if (value === "") return;
    const norm = normalizeForMatch(value);
    const block = phoneticKey(value).slice(0, 4) || norm.slice(0, 3);
    const arr = blocks.get(block) ?? [];
    arr.push({ rowIndex: i, value, norm });
    blocks.set(block, arr);
  });

  const groups: DuplicateGroup[] = [];
  const assigned = new Set<number>();

  for (const items of blocks.values()) {
    for (let i = 0; i < items.length; i++) {
      if (assigned.has(items[i].rowIndex)) continue;
      const base = items[i];
      const members = [{ rowIndex: base.rowIndex, value: base.value }];
      let simSum = 0;
      let simCount = 0;

      for (let j = i + 1; j < items.length; j++) {
        if (assigned.has(items[j].rowIndex)) continue;
        const score = bestMatchScore(base.value, items[j].value);
        if (score >= MID) {
          members.push({ rowIndex: items[j].rowIndex, value: items[j].value });
          assigned.add(items[j].rowIndex);
          simSum += score;
          simCount++;
        }
      }

      if (members.length > 1) {
        assigned.add(base.rowIndex);
        const similarity = Math.round(simSum / Math.max(1, simCount));
        const matchMethod: DuplicateGroup["matchMethod"] =
          similarity === 100 ? "exact" : base.norm === normalizeForMatch(members[1].value) ? "normalized" : similarity >= HIGH ? "fuzzy" : "phonetic";
        groups.push({
          keyField: field,
          members,
          similarity,
          matchMethod,
          suggestedAction: suggestAction(similarity),
          confidence: similarity,
        });
      }
    }
  }

  return groups.sort((a, b) => b.similarity - a.similarity);
}

function suggestAction(similarity: number): DuplicateAction {
  if (similarity >= 98) return "merge";
  if (similarity >= HIGH) return "merge";
  if (similarity >= MID) return "manual_review";
  return "keep_both";
}
