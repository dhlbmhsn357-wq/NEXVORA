import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import {
  DEFAULT_FLAGS,
  MIGRATABLE_SERVICES,
  envOverride,
  type FlagRow,
  type FlagState,
  type MigratableService,
} from "./flags";

/**
 * قراءة وكتابة أعلام الترحيل.
 *
 * ## لماذا ذاكرة قصيرة على مستوى العملية
 *
 * العلم يُقرأ **مع كل نداء ذكاء اصطناعي**. قراءة من قاعدة البيانات في
 * كل مرة تضيف رحلة شبكة لكل عملية — وهذا بالضبط النمط الذي أسقط
 * المنصة في تدقيق المرحلة الأولى.
 *
 * عشر ثوانٍ هي الموازنة: إطفاء علم عند عطل ينتشر خلال عشر ثوانٍ على
 * كل النسخ، وهو زمن مقبول لحالة طوارئ. وأي أطول من ذلك يجعل «مفتاح
 * الرجوع الفوري» غير فوري.
 */

const CACHE_TTL_MS = 10_000;

let cache: { flags: Record<MigratableService, FlagRow>; at: number } | null = null;

export function invalidateFlagCache(): void {
  cache = null;
}

export async function loadFlags(
  client?: SupabaseClient
): Promise<Record<MigratableService, FlagRow>> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.flags;

  const flags: Record<MigratableService, FlagRow> = structuredClone(DEFAULT_FLAGS);

  try {
    const db = client ?? createServiceClient();
    const { data } = await db
      .from("migration_flags")
      .select("service, state, rollout_percent, updated_at, updated_by, note");

    for (const row of (data ?? []) as Array<Record<string, unknown>>) {
      const service = row.service as MigratableService;
      if (!MIGRATABLE_SERVICES.includes(service)) continue;
      flags[service] = {
        service,
        state: row.state as FlagState,
        rolloutPercent: Number(row.rollout_percent ?? 0),
        updatedAt: new Date(row.updated_at as string),
        updatedBy: (row.updated_by as string) ?? null,
        note: (row.note as string) ?? null,
      };
    }
  } catch (err) {
    // تعذّر القراءة = المسار القديم. الأعلام تبدأ مطفأة في النسخة
    // الافتراضية، فالفشل هنا يعطي السلوك الآمن تلقائيًا — لا يفتح
    // مسارًا جديدًا على منصة حيّة بسبب عطل في قراءة إعداد.
    console.error("[migration] تعذّر قراءة الأعلام — المسار القديم:", err);
  }

  // تجاوز البيئة يغلب القاعدة: عند الطوارئ، متغيّر بيئة أسرع من كتابة
  // في قاعدة قد تكون هي نفسها مصدر العطل.
  for (const service of MIGRATABLE_SERVICES) {
    const override = envOverride(service);
    if (override) {
      flags[service] = {
        ...flags[service],
        state: override,
        rolloutPercent: override === "on" ? 100 : 0,
        note: "تجاوز من متغيّرات البيئة.",
      };
    }
  }

  cache = { flags, at: Date.now() };
  return flags;
}

export async function setFlag(
  input: {
    service: MigratableService;
    state: FlagState;
    rolloutPercent?: number;
    updatedBy: string;
    note?: string;
  },
  client?: SupabaseClient
): Promise<void> {
  const db = client ?? createServiceClient();

  await db.from("migration_flags").upsert(
    {
      service: input.service,
      state: input.state,
      rollout_percent: input.rolloutPercent ?? (input.state === "on" ? 100 : 0),
      updated_by: input.updatedBy,
      note: input.note ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "service" }
  );

  // سجل غير قابل للتعديل: من غيّر ماذا ومتى ولماذا. عند عطل بعد تغيير
  // علم، هذا السجل هو أول ما يُقرأ.
  await db.from("migration_flag_events").insert({
    service: input.service,
    state: input.state,
    rollout_percent: input.rolloutPercent ?? (input.state === "on" ? 100 : 0),
    actor_id: input.updatedBy,
    note: input.note ?? null,
  });

  invalidateFlagCache();
}

/** إطفاء كل الأعلام دفعة واحدة — إجراء الطوارئ. */
export async function rollbackAll(
  actorId: string,
  reason: string,
  client?: SupabaseClient
): Promise<number> {
  const db = client ?? createServiceClient();
  let count = 0;

  for (const service of MIGRATABLE_SERVICES) {
    await setFlag(
      { service, state: "off", rolloutPercent: 0, updatedBy: actorId, note: `رجوع شامل: ${reason}` },
      db
    );
    count += 1;
  }

  invalidateFlagCache();
  return count;
}
