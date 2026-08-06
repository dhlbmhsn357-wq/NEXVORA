import type { SupabaseClient } from "@supabase/supabase-js";
import type { InfraServiceName, InfraServiceStatusValue } from "@/lib/types/database";

export interface InfraSignalResult {
  service: InfraServiceName;
  configured: boolean;
  status: InfraServiceStatusValue;
  detail: Record<string, unknown>;
}

/**
 * إشارات Supabase — حقيقية بالكامل، صفر Token جديد. بتستخدم نفس
 * Service Role Client الموجود بالفعل: حجم قاعدة البيانات (RPC
 * get_database_size_stats المُضافة في 0054)، استخدام التخزين (Storage
 * API)، وعدد المستخدمين النشطين (Auth Admin API).
 */
export async function getSupabaseSignals(supabase: SupabaseClient): Promise<InfraSignalResult> {
  try {
    const [{ data: dbStats, error: dbError }, bucketsResult, usersResult] = await Promise.all([
      supabase.rpc("get_database_size_stats").maybeSingle(),
      supabase.storage.listBuckets(),
      supabase.auth.admin.listUsers({ perPage: 1 }),
    ]);

    if (dbError) {
      return { service: "supabase", configured: true, status: "unknown", detail: { error: dbError.message } };
    }

    const stats = dbStats as { database_size_bytes: number; table_count: number; total_row_estimate: number } | null;

    let totalStorageBuckets = 0;
    const storageErrors: string[] = [];
    if (bucketsResult.data) totalStorageBuckets = bucketsResult.data.length;
    if (bucketsResult.error) storageErrors.push(bucketsResult.error.message);

    const activeUserCount = usersResult.data && "total" in usersResult.data ? usersResult.data.total : (usersResult.data?.users.length ?? null);

    return {
      service: "supabase",
      configured: true,
      status: "healthy",
      detail: {
        database_size_bytes: stats?.database_size_bytes ?? null,
        table_count: stats?.table_count ?? null,
        total_row_estimate: stats?.total_row_estimate ?? null,
        storage_bucket_count: totalStorageBuckets,
        storage_errors: storageErrors,
        active_user_count: activeUserCount,
      },
    };
  } catch (err) {
    return { service: "supabase", configured: true, status: "unknown", detail: { error: err instanceof Error ? err.message : "خطأ غير متوقع" } };
  }
}

/**
 * Railway/Vercel — بلا Token في هذه البيئة، فبيرجعوا "غير مُهيَّأ"
 * بوضوح بدل أي رقم ملفّق. منطق الجلب الحقيقي جاهز ومكتوب — بيتفعّل
 * تلقائيًا بمجرد إضافة الـ Token المناسب لمتغيرات البيئة.
 */
export async function getRailwaySignal(): Promise<InfraSignalResult> {
  const token = process.env.RAILWAY_API_TOKEN;
  if (!token) {
    return { service: "railway", configured: false, status: "not_configured", detail: { message: "أضف RAILWAY_API_TOKEN لتفعيل المراقبة الحقيقية." } };
  }
  try {
    const response = await fetch("https://backboard.railway.app/graphql/v2", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: "query { me { id } }" }),
    });
    if (!response.ok) {
      return { service: "railway", configured: true, status: "unknown", detail: { http_status: response.status } };
    }
    return { service: "railway", configured: true, status: "healthy", detail: {} };
  } catch (err) {
    return { service: "railway", configured: true, status: "unknown", detail: { error: err instanceof Error ? err.message : "خطأ غير متوقع" } };
  }
}

export async function getVercelSignal(): Promise<InfraSignalResult> {
  const token = process.env.VERCEL_API_TOKEN;
  if (!token) {
    return { service: "vercel", configured: false, status: "not_configured", detail: { message: "أضف VERCEL_API_TOKEN لتفعيل المراقبة الحقيقية." } };
  }
  try {
    const response = await fetch("https://api.vercel.com/v2/user", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      return { service: "vercel", configured: true, status: "unknown", detail: { http_status: response.status } };
    }
    return { service: "vercel", configured: true, status: "healthy", detail: {} };
  } catch (err) {
    return { service: "vercel", configured: true, status: "unknown", detail: { error: err instanceof Error ? err.message : "خطأ غير متوقع" } };
  }
}

/** يجمع إشارات الخدمات الثلاثة ويكتبها في infra_service_status — يُستدعى مع كل تشغيلة مراقبة. */
export async function refreshInfraServiceStatus(supabase: SupabaseClient, projectId: string): Promise<InfraSignalResult[]> {
  const [supabaseSignal, railwaySignal, vercelSignal] = await Promise.all([
    getSupabaseSignals(supabase),
    getRailwaySignal(),
    getVercelSignal(),
  ]);
  const signals = [supabaseSignal, railwaySignal, vercelSignal];

  await Promise.all(
    signals.map((s) =>
      supabase.from("infra_service_status").upsert(
        {
          project_id: projectId,
          service: s.service,
          configured: s.configured,
          status: s.status,
          detail: s.detail,
          checked_at: new Date().toISOString(),
        },
        { onConflict: "project_id,service" }
      )
    )
  );

  return signals;
}
