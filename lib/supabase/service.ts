import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { assertSupabaseEnvConsistency } from "./env-check";

/**
 * Client بصلاحيات Service Role — يتخطى RLS بالكامل.
 * استخدمه فقط في سياقات موثوقة بدون جلسة مستخدم (زي Telegram Webhook)،
 * وأبدًا في أي كود بيوصله للمتصفح مباشرة.
 */
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY أو NEXT_PUBLIC_SUPABASE_URL غير مُعدّين");
  }

  // حارس اتساق البيئة: لو المفاتيح/الرابط لمشاريع مختلفة، بيرمي خطأ واضح
  // بدل الفشل الصامت اللي بيسبّب «كلمة المرور تعمل مرة واحدة ثم تفشل».
  assertSupabaseEnvConsistency();

  return createSupabaseClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
