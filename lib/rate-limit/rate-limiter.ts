import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Rate Limiter بسيط قائم على Supabase — بلا Redis وبلا اعتماد خارجي.
 * فكرة العمل: عدّ الطلبات في نافذة زمنية سابقة على مستوى (scope, identifier)،
 * فإن تجاوزت الحد، ارفض؛ وإلا سجّل ضربة جديدة.
 *
 * الأداء مقبول لحجم VELORA (فريق داخلي + عملاء محدودين) — الفهرس على
 * (scope, identifier, created_at desc) بيخلي العد رخيص.
 */
export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  windowSeconds: number;
  limit: number;
}

export interface RateLimitConfig {
  scope: string;
  identifier: string;
  limit: number;
  windowSeconds: number;
}

export async function checkRateLimit(
  supabase: SupabaseClient,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  const since = new Date(Date.now() - config.windowSeconds * 1000).toISOString();

  const { count } = await supabase
    .from("rate_limit_hits")
    .select("*", { count: "exact", head: true })
    .eq("scope", config.scope)
    .eq("identifier", config.identifier)
    .gte("created_at", since);

  const currentCount = count ?? 0;

  if (currentCount >= config.limit) {
    return {
      allowed: false,
      remaining: 0,
      windowSeconds: config.windowSeconds,
      limit: config.limit,
    };
  }

  await supabase.from("rate_limit_hits").insert({
    scope: config.scope,
    identifier: config.identifier,
  });

  return {
    allowed: true,
    remaining: config.limit - currentCount - 1,
    windowSeconds: config.windowSeconds,
    limit: config.limit,
  };
}

/**
 * يستخرج IP العميل من Next.js request headers — بيدور على أشهر الترويسات
 * اللي Vercel/Reverse Proxies بيبعتوها. لو مفيش، بيرجّع "unknown"
 * (لسه بيشتغل، بس بحماية أضعف — التصعيد بيبقى شامل عبر IP الواحد).
 */
export function extractClientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  const real = headers.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}
