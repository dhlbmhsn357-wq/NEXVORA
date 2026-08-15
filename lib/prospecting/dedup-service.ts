/**
 * كشف التكرار (Dedup) — Pure functions، بدون I/O ولا حذف تلقائي.
 * ====================================================================
 * ترتيب أولوية matchType: phone > email > name (الهاتف أعلى ثقة).
 * يرجّع قائمة مرشّحين فقط — القرار (تجاهل/استيراد منفصل/دمج) في UI (Part 2).
 */

export type DedupMatchType = "phone" | "email" | "name";

/** الحد الأدنى لسحب صفوف من نفس المحافظة/المنطقة قبل اعتبارها تطابق اسم. */
const NAME_SIMILARITY_THRESHOLD = 0.82;

export interface DedupCandidateRow {
  organizationName: string;
  primaryPhoneNormalized: string | null;
  email: string | null;
  governorate: string | null;
}

export interface ExistingProspectForDedup {
  id: string;
  organizationName: string;
  primaryPhoneNormalized: string | null;
  email: string | null;
  governorate: string | null;
}

export interface DedupMatch {
  newRow: DedupCandidateRow;
  matchedExistingProspectId: string;
  matchType: DedupMatchType;
  /** 0..1 — ثقة التطابق. الهاتف/البريد دائمًا 1 (تطابق حرفي)، الاسم بحسب التشابه. */
  confidence: number;
}

/** تطبيع البريد لأغراض المقارنة فقط (lowercase + trim). لا يُستخدم للتخزين. */
export function normalizeEmailForCompare(email: string | null | undefined): string | null {
  if (!email) return null;
  const trimmed = email.trim().toLowerCase();
  return trimmed === "" ? null : trimmed;
}

/** تطبيع اسم المنظمة لأغراض المقارنة فقط (lowercase + trim + مسافات مفردة). */
export function normalizeNameForCompare(name: string | null | undefined): string {
  if (!name) return "";
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/** مسافة Levenshtein البسيطة (dynamic programming) — بدون مكتبات خارجية. */
export function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let prevRow = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const currRow = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      currRow.push(Math.min(prevRow[j] + 1, currRow[j - 1] + 1, prevRow[j - 1] + cost));
    }
    prevRow = currRow;
  }
  return prevRow[b.length];
}

/** تشابه نصي 0..1 مبني على Levenshtein (1 = تطابق تام، 0 = مختلف تمامًا). */
export function nameSimilarity(a: string, b: string): number {
  const na = normalizeNameForCompare(a);
  const nb = normalizeNameForCompare(b);
  if (na === "" && nb === "") return 1;
  if (na === "" || nb === "") return 0;
  const maxLen = Math.max(na.length, nb.length);
  const dist = levenshteinDistance(na, nb);
  return 1 - dist / maxLen;
}

/**
 * يفحص صفوف جديدة (من استيراد Excel/CSV أو إدخال يدوي) مقابل جهات موجودة
 * فعلًا، ويرجّع مرشّحي تكرار محتمل فقط — لا حذف ولا دمج تلقائي.
 * لكل صف جديد: أول تطابق أعلى أولوية فقط (phone > email > name).
 */
export function detectDuplicates(
  newRows: DedupCandidateRow[],
  existing: ExistingProspectForDedup[]
): DedupMatch[] {
  const matches: DedupMatch[] = [];

  for (const row of newRows) {
    const phoneMatch = row.primaryPhoneNormalized
      ? existing.find((e) => e.primaryPhoneNormalized === row.primaryPhoneNormalized)
      : undefined;
    if (phoneMatch) {
      matches.push({ newRow: row, matchedExistingProspectId: phoneMatch.id, matchType: "phone", confidence: 1 });
      continue;
    }

    const newEmail = normalizeEmailForCompare(row.email);
    const emailMatch = newEmail
      ? existing.find((e) => normalizeEmailForCompare(e.email) === newEmail)
      : undefined;
    if (emailMatch) {
      matches.push({ newRow: row, matchedExistingProspectId: emailMatch.id, matchType: "email", confidence: 1 });
      continue;
    }

    // تطابق اسم متقارب جدًا — فقط داخل نفس المحافظة/المنطقة (لو محددة على الطرفين).
    let bestNameMatch: { id: string; score: number } | null = null;
    for (const e of existing) {
      if (row.governorate && e.governorate && row.governorate !== e.governorate) continue;
      const score = nameSimilarity(row.organizationName, e.organizationName);
      if (score >= NAME_SIMILARITY_THRESHOLD && (!bestNameMatch || score > bestNameMatch.score)) {
        bestNameMatch = { id: e.id, score };
      }
    }
    if (bestNameMatch) {
      matches.push({
        newRow: row,
        matchedExistingProspectId: bestNameMatch.id,
        matchType: "name",
        confidence: bestNameMatch.score,
      });
    }
  }

  return matches;
}
