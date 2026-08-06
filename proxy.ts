import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * طابق كل المسارات ما عدا:
     * - _next/static (ملفات ثابتة)
     * - _next/image (تحسين الصور)
     * - favicon.ico
     * - ملفات الصور الشائعة
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
