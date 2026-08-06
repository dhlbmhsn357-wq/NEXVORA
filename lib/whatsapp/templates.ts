import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  WhatsAppMessagePurpose,
  WhatsAppTemplate,
} from "@/lib/types/database";

/**
 * المتغيّرات المسموح بها داخل نصوص القوالب — أي مفتاح تاني بيتشال
 * من الرندر. عشان الأدمن ما يقدرش عن طريق الخطأ يستدعي متغيّرات مش
 * مضبوطة.
 */
export const ALLOWED_TEMPLATE_VARIABLES = [
  "customer_name",
  "project_name",
  "company_name",
  "discovery_link",
  "expiration_date",
  "expiration_line",
  "estimated_time_line",
] as const;

export type TemplateVariable = (typeof ALLOWED_TEMPLATE_VARIABLES)[number];
export type TemplateVars = Partial<Record<TemplateVariable, string>>;

/**
 * يستبدل {{var}} بالقيم المُمرَّرة. المفاتيح غير المعرّفة تتحوّل لنص فارغ
 * (سلوك آمن — أفضل من ترك القوس ظاهر للعميل).
 */
export function renderTemplate(body: string, vars: TemplateVars): string {
  return body.replace(/\{\{\s*([a-z_][a-z0-9_]*)\s*\}\}/gi, (_m, key: string) => {
    const k = key.trim() as TemplateVariable;
    if (!ALLOWED_TEMPLATE_VARIABLES.includes(k)) return "";
    return vars[k] ?? "";
  });
}

const TEMPLATE_COLUMNS =
  "id, key, name, purpose, body, language, variables, is_default, status, updated_at, updated_by";

/** يجيب قالب حسب المفتاح — للمعاينة والتحكم اليدوي. */
export async function getTemplateByKey(
  supabase: SupabaseClient,
  key: string
): Promise<WhatsAppTemplate | null> {
  const { data } = await supabase
    .from("whatsapp_templates")
    .select(TEMPLATE_COLUMNS)
    .eq("key", key)
    .maybeSingle();
  return (data as WhatsAppTemplate) ?? null;
}

/** يجيب القالب الافتراضي الحالي لغرض معيّن. */
export async function getDefaultTemplateForPurpose(
  supabase: SupabaseClient,
  purpose: WhatsAppMessagePurpose
): Promise<WhatsAppTemplate | null> {
  const { data } = await supabase
    .from("whatsapp_templates")
    .select(TEMPLATE_COLUMNS)
    .eq("purpose", purpose)
    .eq("status", "active")
    .order("is_default", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as WhatsAppTemplate) ?? null;
}

/** كل القوالب (للأدمن). */
export async function listAllTemplates(
  supabase: SupabaseClient
): Promise<WhatsAppTemplate[]> {
  const { data } = await supabase
    .from("whatsapp_templates")
    .select(TEMPLATE_COLUMNS)
    .order("purpose", { ascending: true })
    .order("is_default", { ascending: false });
  return (data ?? []) as WhatsAppTemplate[];
}

/** تسميات عربية للأغراض (للأدمن). */
export const PURPOSE_LABELS: Record<WhatsAppMessagePurpose, string> = {
  discovery_invitation: "دعوة تعبئة الاكتشاف",
  reminder_before_open: "تذكير قبل الفتح",
  reminder_before_completion: "تذكير قبل الإكمال",
  thank_you: "شكر بعد التسليم",
  manual: "رسالة يدوية",
};
