import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * استخدم هذا الـ client داخل Server Components وRoute Handlers.
 * يجب استدعاؤه من جديد في كل request (لا تخزّنه في متغير عام).
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // setAll تُستدعى من Server Component أحيانًا — يتجاهل الخطأ
            // إذا كان middleware يتكفّل بتحديث الجلسة (موجود في middleware.ts)
          }
        },
      },
    }
  );
}
