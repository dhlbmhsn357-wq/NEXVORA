/**
 * حارس اتساق بيئة Supabase (Enterprise IAM — Critical).
 *
 * سبب جذري محتمل لمشكلة «كلمة المرور تعمل مرة واحدة ثم تفشل»: لو مفتاح
 * الـ service-role (SUPABASE_SERVICE_ROLE_KEY) بتاع مشروع، ومفتاح الـ anon
 * (NEXT_PUBLIC_SUPABASE_ANON_KEY) أو رابط المشروع بتاع مشروع تاني — يبقى
 * إنشاء المستخدم/تغيير كلمة المرور (بيتم بالـ service client) بيتكتب في
 * مشروع A، بينما تسجيل الدخول (signInWithPassword بالـ anon client)
 * بيتحقق من مشروع B. النتيجة: الحساب «يتعمل» بس الدخول بيفشل.
 *
 * الوحدة دي بتفكّ الـ project ref من كل مفتاح (JWT فيه claim اسمه ref)
 * ومن الرابط، وتتأكد إنهم كلهم لنفس المشروع. أي تعارض = خطأ واضح فورًا
 * بدل فشل صامت.
 */

/** يفكّ الـ payload من JWT (الجزء الأوسط، base64url) ويرجّع claim ref لو موجود. */
export function extractProjectRefFromJwt(jwt: string | undefined | null): string | null {
  if (!jwt) return null;
  const parts = jwt.split(".");
  if (parts.length < 2) return null;
  try {
    const payloadB64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const json =
      typeof atob === "function"
        ? atob(payloadB64)
        : Buffer.from(payloadB64, "base64").toString("utf-8");
    const payload = JSON.parse(json) as { ref?: unknown };
    return typeof payload.ref === "string" ? payload.ref : null;
  } catch {
    return null;
  }
}

/** يستخرج project ref من رابط مثل https://abcd.supabase.co */
export function extractProjectRefFromUrl(url: string | undefined | null): string | null {
  if (!url) return null;
  const m = url.match(/^https?:\/\/([a-z0-9-]+)\.supabase\.(co|in|net)/i);
  return m ? m[1].toLowerCase() : null;
}

export interface SupabaseEnvCheck {
  ok: boolean;
  /**
   * هل الفحص قارن حاجة فعلًا؟
   *
   * `ok: true` لوحدها مضلِّلة: لو أقل من قيمتين اتفكّ منها معرّف المشروع
   * (زي المفاتيح بالصيغة الجديدة اللي مش JWT)، الدالة بترجّع نجاح من غير
   * ما تكون قارنت أي حاجة. الفرق بين «اتأكدنا إنهم متطابقين» و«مقدرناش
   * نتأكد» لازم يبان للي بيقرا النتيجة، مش يتخفي وراء نجاح شكلي.
   */
  verified: boolean;
  urlRef: string | null;
  anonRef: string | null;
  serviceRef: string | null;
  message?: string;
}

/**
 * يتحقق أن رابط المشروع + مفتاح anon + مفتاح service-role كلهم لنفس
 * المشروع. يتجاهل أي قيمة غير قابلة للتحليل (مثلاً مفاتيح بصيغة جديدة
 * مش JWT) عشان مايكسرش البيئات السليمة — بيقارن المتاح فقط.
 */
export function checkSupabaseEnvConsistency(env?: {
  url?: string;
  anonKey?: string;
  serviceKey?: string;
}): SupabaseEnvCheck {
  const url = env?.url ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = env?.anonKey ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = env?.serviceKey ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

  const urlRef = extractProjectRefFromUrl(url);
  const anonRef = extractProjectRefFromJwt(anonKey);
  const serviceRef = extractProjectRefFromJwt(serviceKey);

  const refs = [
    { name: "NEXT_PUBLIC_SUPABASE_URL", ref: urlRef },
    { name: "NEXT_PUBLIC_SUPABASE_ANON_KEY", ref: anonRef },
    { name: "SUPABASE_SERVICE_ROLE_KEY", ref: serviceRef },
  ].filter((r) => r.ref !== null) as { name: string; ref: string }[];

  // أقل من قيمتين قابلة للتحليل = مفيش مقارنة ممكنة. بنرجّع نجاح عشان
  // مانكسرش البيئات السليمة اللي بتستخدم الصيغة الجديدة، بس `verified`
  // بيقول الحقيقة: إحنا معدّيناش المفاتيح، إحنا ماقدرناش نفحصها.
  if (refs.length < 2) return { ok: true, verified: false, urlRef, anonRef, serviceRef };

  const distinct = Array.from(new Set(refs.map((r) => r.ref)));
  if (distinct.length > 1) {
    const detail = refs.map((r) => `${r.name}=${r.ref}`).join(" ، ");
    return {
      ok: false,
      verified: true,
      urlRef,
      anonRef,
      serviceRef,
      message:
        "إعدادات Supabase غير متسقة: المفاتيح/الرابط بتشير لمشاريع مختلفة، " +
        "وده بيخلّي إنشاء الحساب/تغيير كلمة المرور يتكتب في مشروع والدخول " +
        `يتحقق من مشروع تاني. صحّح متغيّرات البيئة عشان تبقى لنفس المشروع (${detail}).`,
    };
  }

  return { ok: true, verified: true, urlRef, anonRef, serviceRef };
}

/** يرمي خطأ واضح لو البيئة غير متسقة — يُستدعى من service client. */
export function assertSupabaseEnvConsistency(): void {
  const check = checkSupabaseEnvConsistency();
  if (!check.ok) throw new Error(check.message);
}
