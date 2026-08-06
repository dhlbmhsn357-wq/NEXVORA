import { createBrowserClient } from "@supabase/ssr";

/**
 * استخدم هذا الـ client داخل Client Components فقط
 * ("use client" في أعلى الملف).
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
