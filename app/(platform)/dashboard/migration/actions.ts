"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/rbac";
import { createServiceClient } from "@/lib/supabase/service";
import { MIGRATABLE_SERVICES, type FlagState, type MigratableService } from "@/lib/migration/flags";
import { loadFlags, rollbackAll, setFlag } from "@/lib/migration/flag-store";
import {
  assessMigration,
  collectComparisons,
  type MigrationVerdict,
  type ServiceComparison,
} from "@/lib/migration/comparison";

/**
 * إجراءات لوحة الترحيل — للمسؤولين فقط.
 *
 * تغيير علم يحوّل مسار تنفيذ منصة حيّة، فهو قرار تشغيلي لا يُترك لأي
 * دور أدنى. الصلاحية تُفحص هنا **وفي سياسات قاعدة البيانات** معًا.
 */

const ADMIN_ONLY = ["owner", "admin"] as const;

export interface ServiceRow {
  service: MigratableService;
  state: FlagState;
  rolloutPercent: number;
  updatedAt: string;
  note: string | null;
  comparison: ServiceComparison | null;
  verdict: MigrationVerdict | null;
  /** هل يوجد عامل حيّ يخدم هذه الخدمة الآن؟ */
  workerAlive: boolean;
}

export interface MigrationDashboardData {
  services: ServiceRow[];
  killSwitch: boolean;
  totalNewCalls: number;
  totalFallbacks: number;
}

const JOB_TYPE_BY_SERVICE: Record<MigratableService, string> = {
  meeting: "ai.meeting",
  discovery: "ai.discovery",
  brain: "ai.brain",
  prd: "ai.prd",
  prototype: "ai.prototype",
  qa: "ai.qa",
  prompt: "ai.prompt",
  monitoring: "ai.monitoring",
  recommendations: "ai.knowledge",
  architecture: "ai.architecture",
  support: "ai.support",
  knowledge: "ai.knowledge",
};

export async function getMigrationDashboard(): Promise<{
  ok: boolean;
  message?: string;
  data?: MigrationDashboardData;
}> {
  const auth = await requireRole([...ADMIN_ONLY]);
  if (!auth.ok) return { ok: false, message: auth.message };

  const supabase = createServiceClient();

  const [flags, comparisons, workers] = await Promise.all([
    loadFlags(supabase),
    collectComparisons({ sinceMs: 7 * 24 * 60 * 60 * 1000 }, supabase),
    supabase
      .from("queue_workers")
      .select("handled_types")
      .neq("status", "stopped")
      .gte("heartbeat_at", new Date(Date.now() - 180_000).toISOString()),
  ]);

  const liveTypes = new Set<string>();
  for (const row of (workers.data ?? []) as Array<{ handled_types: string[] }>) {
    for (const type of row.handled_types ?? []) liveTypes.add(type);
  }

  const byService = new Map(comparisons.map((c) => [c.service, c]));

  const services: ServiceRow[] = MIGRATABLE_SERVICES.map((service) => {
    const comparison = byService.get(service) ?? null;
    return {
      service,
      state: flags[service].state,
      rolloutPercent: flags[service].rolloutPercent,
      updatedAt: flags[service].updatedAt.toISOString(),
      note: flags[service].note,
      comparison,
      verdict: comparison ? assessMigration(comparison) : null,
      workerAlive: liveTypes.has(JOB_TYPE_BY_SERVICE[service]),
    };
  });

  return {
    ok: true,
    data: {
      services,
      killSwitch: process.env.MIGRATION_KILL_SWITCH?.toLowerCase() === "on",
      totalNewCalls: comparisons.reduce((sum, c) => sum + c.newCalls, 0),
      totalFallbacks: comparisons.reduce((sum, c) => sum + c.fallbacks, 0),
    },
  };
}

export async function setMigrationFlagAction(input: {
  service: MigratableService;
  state: FlagState;
  rolloutPercent: number;
  note?: string;
}): Promise<{ ok: boolean; message?: string }> {
  const auth = await requireRole([...ADMIN_ONLY]);
  if (!auth.ok || !auth.userId) return { ok: false, message: auth.message ?? "غير مصرّح." };

  if (!MIGRATABLE_SERVICES.includes(input.service)) {
    return { ok: false, message: "خدمة غير معروفة." };
  }
  if (input.rolloutPercent < 0 || input.rolloutPercent > 100) {
    return { ok: false, message: "النسبة لازم تكون بين صفر ومئة." };
  }

  // حارس صريح: فتح علم بلا عامل يخدمه يعني إدراج مهام لا يسحبها أحد.
  // المحوّل بيتعامل مع ده بالرجوع الآمن، لكن السماح بالفتح من اللوحة
  // كان بيخلّي المسؤول يفتكر إن الترحيل شغّال وهو مش شغّال.
  if (input.state === "on" && input.rolloutPercent > 0) {
    const supabase = createServiceClient();
    const { data } = await supabase
      .from("queue_workers")
      .select("handled_types")
      .neq("status", "stopped")
      .gte("heartbeat_at", new Date(Date.now() - 180_000).toISOString());

    const live = new Set(
      ((data ?? []) as Array<{ handled_types: string[] }>).flatMap((r) => r.handled_types ?? [])
    );
    if (!live.has(JOB_TYPE_BY_SERVICE[input.service])) {
      return {
        ok: false,
        message: `مفيش عامل حيّ لخدمة «${input.service}». شغّل العامل الأول، وإلا كل طلب هيرجع للمسار القديم بلا فايدة.`,
      };
    }
  }

  await setFlag({
    service: input.service,
    state: input.state,
    rolloutPercent: input.rolloutPercent,
    updatedBy: auth.userId,
    note: input.note,
  });

  revalidatePath("/dashboard/migration");
  return { ok: true };
}

/** الرجوع الشامل — إطفاء كل الأعلام دفعة واحدة. */
export async function rollbackAllAction(reason: string): Promise<{ ok: boolean; message?: string }> {
  const auth = await requireRole([...ADMIN_ONLY]);
  if (!auth.ok || !auth.userId) return { ok: false, message: auth.message ?? "غير مصرّح." };

  const count = await rollbackAll(auth.userId, reason || "رجوع يدوي من اللوحة");
  revalidatePath("/dashboard/migration");
  return { ok: true, message: `تمّ إطفاء ${count} علمًا.` };
}
