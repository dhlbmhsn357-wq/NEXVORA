import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { checkSupabaseEnvConsistency } from "@/lib/supabase/env-check";
import { probeSupabaseGateway } from "@/lib/supabase/gateway-probe";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

/**
 * فحص صحة النظام — يجاوب على سؤال واحد: هل التطبيق شايف قاعدة بياناته؟
 *
 * موجود عشان التشخيص يبقى حقائق مش تخمين. لما الواجهة تقول "تعذّر
 * التحقق" أو الدخول ما يحصلش، فتح الرابط ده بيقول بالظبط: المتغيّرات
 * موجودة؟ متسقة؟ القاعدة بتردّ؟ وكام مسؤول نظام موجود فعلًا.
 *
 * **ما يُسرَّب هنا**: أسماء المتغيّرات ووجودها ومعرّف المشروع فقط.
 * المفاتيح نفسها ما بتخرجش أبدًا — معرّف المشروع علني أصلًا (جزء من
 * رابط الـ API)، لكن المفتاح سرّ.
 */
export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const env = {
    NEXT_PUBLIC_SUPABASE_URL: url ? "موجود" : "**ناقص**",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey ? "موجود" : "**ناقص**",
    SUPABASE_SERVICE_ROLE_KEY: serviceKey ? "موجود" : "**ناقص**",
  };

  const consistency = checkSupabaseEnvConsistency();

  if (!url || !serviceKey) {
    return NextResponse.json(
      {
        ok: false,
        stage: "env",
        problem: "متغيّرات البيئة الأساسية ناقصة على المنصة المستضيفة.",
        env,
        projectRefs: {
          fromUrl: consistency.urlRef,
          fromAnonKey: consistency.anonRef,
          fromServiceKey: consistency.serviceRef,
        },
      },
      { status: 503 }
    );
  }

  if (!consistency.ok) {
    return NextResponse.json(
      {
        ok: false,
        stage: "env_consistency",
        problem: consistency.message,
        env,
        projectRefs: {
          fromUrl: consistency.urlRef,
          fromAnonKey: consistency.anonRef,
          fromServiceKey: consistency.serviceRef,
        },
      },
      { status: 503 }
    );
  }

  // اتصال مباشر بمهلة: الهدف نميّز بين "القاعدة بترفض" و"القاعدة مش
  // بتردّ أصلًا" — الاتنين بيبانوا زي بعض في الواجهة لكن علاجهم مختلف.
  const started = Date.now();
  try {
    const service = createSupabaseClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const query = service
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "owner")
      .neq("status", "deleted");

    const result = await Promise.race([
      query,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("انتهت المهلة بعد 10 ثوانٍ بدون رد")), 10_000)
      ),
    ]);

    const latencyMs = Date.now() - started;

    if (result.error) {
      // الاستعلام فشل — نسأل البوّابة مباشرة عن كل مفتاح على حدة. ده اللي
      // بيفرّق بين «المفتاح مرفوض» و«القاعدة مضغوطة»: الاتنين بيوصلوا
      // كخطأ استعلام، وعلاجهم مختلف تمامًا.
      const probe = await probeSupabaseGateway();
      return NextResponse.json(
        {
          ok: false,
          stage: "query",
          problem: result.error.message || probe.summary,
          keyCheck: {
            anon: probe.anon,
            service: probe.service,
            anonStatus: probe.anonStatus,
            serviceStatus: probe.serviceStatus,
            verdict: probe.summary,
          },
          code: result.error.code ?? null,
          details: result.error.details ?? null,
          hint: result.error.hint ?? null,
          latencyMs,
          env,
          projectRef: consistency.urlRef,
          refsVerified: consistency.verified,
        },
        { status: 503 }
      );
    }

    return NextResponse.json({
      ok: true,
      stage: "ready",
      ownerCount: result.count ?? 0,
      latencyMs,
      env,
      projectRef: consistency.urlRef,
      refsVerified: consistency.verified,
    });
  } catch (err) {
    // مهم: الفحص ده لازم يشتغل على مسار المهلة كمان، مش على مسار خطأ
    // الاستعلام بس. لما القاعدة ما تردّش خالص إحنا معندناش أي معلومة عن
    // المفاتيح — وde كان بيسيب أهم سؤال بدون إجابة في أسوأ حالة ممكنة.
    //
    // لو البوّابة ردّت بسرعة والاستعلام خد مهلة كاملة، يبقى البوّابة حيّة
    // والقاعدة هي المشنوقة. ولو الاتنين ماردّوش، يبقى المشروع نفسه واقف.
    const probe = await probeSupabaseGateway();
    return NextResponse.json(
      {
        ok: false,
        stage: "connection",
        problem: err instanceof Error ? err.message : "تعذّر الاتصال بقاعدة البيانات.",
        diagnosis:
          probe.anon === "unreachable" && probe.service === "unreachable"
            ? "البوّابة نفسها مش بتردّ — المشروع غالبًا متوقف أو تحت ضغط كامل."
            : "البوّابة بتردّ لكن الاستعلام بياخد مهلة — قاعدة البيانات مشنوقة، مش المفاتيح.",
        keyCheck: {
          anon: probe.anon,
          service: probe.service,
          anonStatus: probe.anonStatus,
          serviceStatus: probe.serviceStatus,
        },
        latencyMs: Date.now() - started,
        env,
        projectRef: consistency.urlRef,
        refsVerified: consistency.verified,
      },
      { status: 503 }
    );
  }
}
