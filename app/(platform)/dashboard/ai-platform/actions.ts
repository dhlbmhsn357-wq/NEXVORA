"use server";

import { requireRole } from "@/lib/auth/rbac";
import { collectAIMetrics, collectProviderHealth, type AIMetrics } from "@/lib/ai-platform/metrics/collector";
import { listJobHandlers } from "@/lib/queue/registry";
import "@/lib/queue/handlers";

/**
 * إجراءات لوحة منصة الذكاء الاصطناعي — للمسؤولين فقط.
 *
 * اللوحة بتكشف التكلفة والأعطال عبر كل المشاريع، فهي إدارية بطبيعتها.
 */

export interface AIPlatformData {
  metrics: AIMetrics;
  providers: Array<{
    provider: string;
    state: string;
    consecutive_errors: number;
    next_probe_at: string | null;
    last_error: string | null;
  }>;
  registeredTypes: Array<{ type: string; priority: string; concurrency: number; description?: string }>;
}

export async function getAIPlatformDashboard(): Promise<{
  ok: boolean;
  message?: string;
  data?: AIPlatformData;
}> {
  const auth = await requireRole(["owner", "admin"]);
  if (!auth.ok) return { ok: false, message: auth.message };

  const [metrics, providers] = await Promise.all([collectAIMetrics(), collectProviderHealth()]);

  const registeredTypes = listJobHandlers()
    .filter((h) => h.workerType === "ai")
    .map((h) => ({
      type: h.type,
      priority: h.defaultPriority,
      concurrency: h.concurrency,
      description: h.description,
    }));

  return { ok: true, data: { metrics, providers, registeredTypes } };
}
