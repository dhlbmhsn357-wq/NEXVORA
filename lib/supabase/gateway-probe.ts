/**
 * فحص مباشر لمفاتيح Supabase: هل البوّابة بتقبلها ولا بترفضها؟
 *
 * الفحص ده بيجاوب على سؤال ما ينفعش يتجاوب من متغيّرات البيئة لوحدها.
 * `checkSupabaseEnvConsistency` بيقارن معرّف المشروع المستخرَج من المفاتيح
 * بالرابط — وde بيكشف الخلط بين مشروعين، لكنه **مابيقولش** إذا كان المفتاح
 * نفسه لسه صالح. مفتاح اتعطّل أو اتغيّر بيفضل حامل نفس المعرّف بالظبط،
 * فبيعدّي من فحص الاتساق وهو مرفوض من الخادم.
 *
 * الفرق ده هو اللي بيفصل بين علاجين مختلفين تمامًا: «صحّح الرابط» مقابل
 * «حدّث المفتاح».
 */

export type KeyVerdict = "accepted" | "rejected" | "missing" | "unreachable";

export interface GatewayProbeResult {
  anon: KeyVerdict;
  service: KeyVerdict;
  anonStatus: number | null;
  serviceStatus: number | null;
  summary: string;
}

/**
 * الخلاصة المقروءة — دالة نقية عشان تتغطّى بالاختبار من غير شبكة.
 *
 * الترتيب مقصود: رفض المفتاحين مع بعض ليه سبب واحد شائع (تعطيل المفاتيح
 * القديمة على مستوى المشروع)، غير رفض واحد منهم بس (مفتاح واحد قديم في
 * متغيّرات البيئة).
 */
export function summarizeProbe(anon: KeyVerdict, service: KeyVerdict): string {
  if (anon === "missing" && service === "missing") {
    return "مفاتيح Supabase مش موجودة أصلًا في متغيّرات البيئة.";
  }
  if (anon === "unreachable" || service === "unreachable") {
    return "تعذّر الوصول لخادم Supabase — مفيش رد. المشروع ممكن يكون متوقف أو مفيش اتصال.";
  }
  if (anon === "rejected" && service === "rejected") {
    return (
      "البوّابة رفضت المفتاحين الاتنين (401). المفاتيح دي مابقتش صالحة للمشروع ده — " +
      "غالبًا اتعطّلت المفاتيح القديمة في إعدادات Supabase، أو اتعمل تدوير للمفاتيح " +
      "من غير ما تتحدّث على المنصة المستضيفة. الحل: انسخ المفاتيح الحالية من " +
      "Supabase وحدّثها في متغيّرات البيئة."
    );
  }
  if (service === "rejected") {
    return (
      "مفتاح الخدمة (SUPABASE_SERVICE_ROLE_KEY) مرفوض من البوّابة. " +
      "حدّثه من إعدادات Supabase — كل العمليات الإدارية بتمرّ منه."
    );
  }
  if (anon === "rejected") {
    return (
      "المفتاح العام (NEXT_PUBLIC_SUPABASE_ANON_KEY) مرفوض من البوّابة. " +
      "حدّثه من إعدادات Supabase — تسجيل الدخول بيمرّ منه."
    );
  }
  if (anon === "missing") return "المفتاح العام (NEXT_PUBLIC_SUPABASE_ANON_KEY) ناقص.";
  if (service === "missing") return "مفتاح الخدمة (SUPABASE_SERVICE_ROLE_KEY) ناقص.";
  return "المفاتيح مقبولة من البوّابة — المشكلة مش في المصادقة.";
}

async function probeKey(
  url: string,
  key: string | undefined
): Promise<{ verdict: KeyVerdict; status: number | null }> {
  if (!key) return { verdict: "missing", status: null };
  try {
    // استعلام HEAD على جدول حقيقي: بيرجّع 200 لو المفتاح مقبول، و401 لو
    // مرفوض، و404 لو الجدول مش موجود — والتلاتة بيفرّقوا اللي محتاجينه.
    // HEAD يعني مفيش جسم رد، فالتكلفة أقل ما يمكن.
    const response = await fetch(`${url}/rest/v1/profiles?select=id&limit=1`, {
      method: "HEAD",
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(5_000),
      cache: "no-store",
    });
    const rejected = response.status === 401 || response.status === 403;
    return { verdict: rejected ? "rejected" : "accepted", status: response.status };
  } catch {
    return { verdict: "unreachable", status: null };
  }
}

/** بيفحص المفتاحين على التوازي — الاتنين مستقلين، فمفيش داعي للتسلسل. */
export async function probeSupabaseGateway(): Promise<GatewayProbeResult> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) {
    return {
      anon: "missing",
      service: "missing",
      anonStatus: null,
      serviceStatus: null,
      summary: "رابط Supabase (NEXT_PUBLIC_SUPABASE_URL) مش مضبوط.",
    };
  }

  const [anon, service] = await Promise.all([
    probeKey(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    probeKey(url, process.env.SUPABASE_SERVICE_ROLE_KEY),
  ]);

  return {
    anon: anon.verdict,
    service: service.verdict,
    anonStatus: anon.status,
    serviceStatus: service.status,
    summary: summarizeProbe(anon.verdict, service.verdict),
  };
}
