import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProjectDomain } from "@/lib/types/database";

/**
 * يجمع معرفة تنظيمية مُعتمَدة خاصة بمجال المشروع (Phase 6 Organizational
 * Intelligence) لإثراء توليد الفورم — أساس حلقة التعلّم: مع الوقت، كل ما
 * تراكمت معرفة أكتر عن مجال معيّن، بقى المولّد أذكى فيه. بيرجع نصًا
 * موجزًا (أو null لو مفيش) — والمولّد بيسترشد بيه بدون ما ينسخه حرفيًا.
 */
export async function buildDiscoveryKnowledgeContext(
  supabase: SupabaseClient,
  domain: ProjectDomain
): Promise<string | null> {
  const { data } = await supabase
    .from("organizational_knowledge")
    .select("title, content, category, learned_weight, domain")
    .eq("status", "validated")
    .or(`domain.eq.${domain},domain.is.null`)
    .order("learned_weight", { ascending: false })
    .limit(12);

  const rows = (data ?? []) as Array<{
    title: string | null;
    content: string | null;
    category: string | null;
    domain: string | null;
  }>;

  // نعطي أولوية للمعرفة الخاصة بالمجال بالضبط على العامة
  const relevant = rows
    .filter((r) => (r.title && r.title.trim()) || (r.content && r.content.trim()))
    .sort((a, b) => Number(b.domain === domain) - Number(a.domain === domain))
    .slice(0, 8);

  if (relevant.length === 0) return null;

  const lines = relevant.map((r) => {
    const title = (r.title ?? "").trim();
    const content = (r.content ?? "").trim();
    const trimmed = content.length > 220 ? `${content.slice(0, 220)}…` : content;
    const cat = r.category ? ` [${r.category}]` : "";
    return `- ${title}${cat}${trimmed ? `: ${trimmed}` : ""}`;
  });

  return lines.join("\n");
}
