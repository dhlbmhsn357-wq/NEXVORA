import { AIService } from "@/lib/ai/service";
import { AITaskType } from "@/lib/ai/types";
import { createServiceClient } from "@/lib/supabase/service";
import type { Message, Profile } from "@/lib/types/database";

/**
 * تلخيص/استخراج معرفة من محادثة عبر AI Provider Layer (ممنوع نداء
 * المزوّد مباشرة). بيرجّع ملخص + قرارات + مخاطر + متطلبات + مهام +
 * أسئلة متابعة، مع كشف النقاشات غير المحسومة.
 */

export interface CollaborationExtraction {
  summary: string;
  decisions: string[];
  risks: string[];
  requirements: string[];
  action_items: string[];
  follow_up_questions: string[];
  unresolved: string[];
}

const EMPTY: CollaborationExtraction = {
  summary: "",
  decisions: [],
  risks: [],
  requirements: [],
  action_items: [],
  follow_up_questions: [],
  unresolved: [],
};

function buildPrompt(transcript: string): string {
  return `أنت محلل أعمال خبير. دي محادثة داخلية بين فريق شركة برمجيات. لخّصها واستخرج المعرفة المؤسسية منها.

المحادثة:
${transcript}

أعد **JSON فقط** بالشكل ده بالظبط (بدون أي نص خارج الـ JSON):
{
  "summary": "ملخص موجز للمحادثة (2-4 جمل)",
  "decisions": ["قرار واضح تم الاتفاق عليه"],
  "risks": ["مخاطرة أو قلق ظهر"],
  "requirements": ["متطلب أو طلب وظيفي"],
  "action_items": ["مهمة أو إجراء مطلوب تنفيذه"],
  "follow_up_questions": ["سؤال متابعة يحتاج إجابة"],
  "unresolved": ["نقاش مفتوح لم يُحسم"]
}
قواعد صارمة: لو مفيش عناصر لفئة، رجّع مصفوفة فاضية []. لا تخترع معلومات غير موجودة في المحادثة. اكتب بالعربي.`;
}

function safeParse(output: string): CollaborationExtraction {
  try {
    const jsonMatch = output.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { ...EMPTY };
    const parsed = JSON.parse(jsonMatch[0]) as Partial<CollaborationExtraction>;
    const arr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.trim()).map(String) : []);
    return {
      summary: typeof parsed.summary === "string" ? parsed.summary : "",
      decisions: arr(parsed.decisions),
      risks: arr(parsed.risks),
      requirements: arr(parsed.requirements),
      action_items: arr(parsed.action_items),
      follow_up_questions: arr(parsed.follow_up_questions),
      unresolved: arr(parsed.unresolved),
    };
  } catch {
    return { ...EMPTY };
  }
}

/** يجهّز نص المحادثة (آخر 200 رسالة) ويشغّل الاستخراج. */
export async function summarizeConversation(
  conversationId: string,
  actorId?: string,
  projectId?: string | null
): Promise<{ ok: boolean; extraction?: CollaborationExtraction; message?: string }> {
  const supabase = createServiceClient();
  const { data: msgs } = await supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(200);
  const messages = (msgs ?? []) as Message[];
  if (messages.length === 0) return { ok: false, message: "المحادثة فاضية." };

  const authorIds = [...new Set(messages.map((m) => m.author_id).filter(Boolean) as string[])];
  const { data: authors } = await supabase.from("profiles").select("id, full_name, email").in("id", authorIds.length ? authorIds : ["00000000-0000-0000-0000-000000000000"]);
  const nameById = new Map<string, string>();
  for (const a of (authors ?? []) as Pick<Profile, "id" | "full_name" | "email">[]) nameById.set(a.id, a.full_name || a.email || "مستخدم");

  const transcript = messages
    .map((m) => `${m.author_id ? nameById.get(m.author_id) ?? "مستخدم" : "النظام"}: ${m.body}`)
    .join("\n");

  const response = await AIService.execute(AITaskType.COLLABORATION_SUMMARY, buildPrompt(transcript), { actorId, projectId: projectId ?? undefined });
  if (!response.success) return { ok: false, message: response.error?.message ?? "فشل التلخيص." };

  return { ok: true, extraction: safeParse(response.output ?? "") };
}
