/**
 * فلترة وترتيب عناصر المعرفة للمستكشف — **وحدة نقية بلا I/O**.
 *
 * المنطق هنا لا في الاستعلام: الفلترة النصّية والترتيب المركّب أسهل
 * اختبارًا وأسرع تكرارًا في الذاكرة على عيّنة محمَّلة، والاستعلام بيجيب
 * النطاق الأساسي (المشروع + الحالة) بس.
 */

export interface ExplorerItem {
  id: string;
  title: string;
  content: string;
  category: string;
  status: string;
  confidence: number;
  tags: string[];
  createdAt: string;
}

export interface ExplorerFilters {
  /** بحث نصّي في العنوان والمحتوى والوسوم. */
  search?: string;
  category?: string | null;
  status?: string | null;
  /** أقل ثقة مقبولة. */
  minConfidence?: number | null;
  /** وسم مصدر أو نوع. */
  tag?: string | null;
}

export type ExplorerSort = "recent" | "confidence" | "title";

/** يطبّع نصًّا عربيًا للبحث: تشكيل، همزات، حالة. */
function normalize(text: string): string {
  return (text ?? "")
    .toLowerCase()
    .replace(/[ً-ْ]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .trim();
}

export function filterItems(items: ExplorerItem[], filters: ExplorerFilters): ExplorerItem[] {
  const q = filters.search ? normalize(filters.search) : "";

  return items.filter((item) => {
    if (filters.category && item.category !== filters.category) return false;
    if (filters.status && item.status !== filters.status) return false;
    if (filters.minConfidence != null && item.confidence < filters.minConfidence) return false;
    if (filters.tag && !item.tags?.includes(filters.tag)) return false;
    if (q) {
      const haystack = normalize(`${item.title} ${item.content} ${(item.tags ?? []).join(" ")}`);
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}

export function sortItems(items: ExplorerItem[], sort: ExplorerSort): ExplorerItem[] {
  const copy = [...items];
  switch (sort) {
    case "confidence":
      return copy.sort((a, b) => b.confidence - a.confidence);
    case "title":
      return copy.sort((a, b) => a.title.localeCompare(b.title, "ar"));
    case "recent":
    default:
      return copy.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}

/** يستخرج قوائم التصنيفات والوسوم المتاحة — لبناء الفلاتر ديناميكيًا. */
export function facets(items: ExplorerItem[]): { categories: string[]; tags: string[]; statuses: string[] } {
  const categories = new Set<string>();
  const tags = new Set<string>();
  const statuses = new Set<string>();
  for (const item of items) {
    if (item.category) categories.add(item.category);
    if (item.status) statuses.add(item.status);
    for (const t of item.tags ?? []) tags.add(t);
  }
  return {
    categories: [...categories].sort(),
    tags: [...tags].sort(),
    statuses: [...statuses].sort(),
  };
}

/** يطبّق الفلترة ثم الترتيب — الباب الموحّد للمستكشف. */
export function applyExplorer(
  items: ExplorerItem[],
  filters: ExplorerFilters,
  sort: ExplorerSort
): ExplorerItem[] {
  return sortItems(filterItems(items, filters), sort);
}
