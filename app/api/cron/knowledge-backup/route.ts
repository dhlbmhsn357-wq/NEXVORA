import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { exportKnowledgePackage } from "@/lib/knowledge-hub/package/export-service";

/**
 * نسخ احتياطي مجدوَل لمعرفة المشاريع (الجزء الثامن).
 *
 * نفس نمط الحماية بالضبط اللي في باقي الـ Cron Routes (Bearer أو
 * ?token=). كل تشغيل بيصدّر حزمة `backup` لكل مشروع فيه معرفة نشطة —
 * الحزمة تُسجَّل في `knowledge_packages` كسجلّ نسخ احتياطي.
 *
 * **بلا إخفاء PII**: النسخة الاحتياطية داخلية وكاملة؛ الإخفاء للمشاركة
 * الخارجية لا للأرشفة.
 *
 * **حدّ التشغيل**: نعالج حتى ٥٠ مشروعًا في التشغيل الواحد عشان نفضل
 * جوّه حدّ وقت دالة Vercel — الجدولة اليومية بتغطّي الباقي بالتناوب.
 */

export async function POST(request: NextRequest) {
  return handle(request);
}
export async function GET(request: NextRequest) {
  return handle(request);
}

async function handle(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: "CRON_SECRET غير مضبوط في متغيّرات البيئة." }, { status: 500 });
  }

  const authz = request.headers.get("authorization");
  const bearer = authz?.startsWith("Bearer ") ? authz.slice(7) : null;
  const qs = new URL(request.url).searchParams.get("token");
  if (bearer !== secret && qs !== secret) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const db = createServiceClient();

  // المشاريع اللي فيها معرفة نشطة — نتفادى نسخ مشاريع فارغة.
  const { data, error } = await db
    .from("knowledge_items")
    .select("project_id")
    .eq("status", "active")
    .limit(5000);

  if (error) {
    // جداول المعرفة غير مطبَّقة → لا شيء لنسخه، نجاح صامت.
    if (error.code === "42P01") return NextResponse.json({ ok: true, backedUp: 0, note: "no knowledge tables" });
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const projectIds = [...new Set(((data ?? []) as Array<{ project_id: string }>).map((r) => r.project_id))].slice(0, 50);
  const generatedAt = new Date().toISOString();

  let backedUp = 0;
  let failed = 0;
  for (const projectId of projectIds) {
    try {
      const result = await exportKnowledgePackage(projectId, generatedAt, { kind: "backup", maskPii: false }, db);
      if (result.status === "ok") backedUp += 1;
      else failed += 1;
    } catch (err) {
      failed += 1;
      console.error(`[knowledge-backup] فشل نسخ المشروع ${projectId}:`, err instanceof Error ? err.message : err);
    }
  }

  return NextResponse.json({ ok: true, projects: projectIds.length, backedUp, failed });
}
