"use server";

import { requireRole } from "@/lib/auth/rbac";
import { rebuildProjectKnowledge, type RebuildOutcome } from "@/lib/project-assistant/knowledge-ingestion";

type Result<T = void> = { ok: true; data?: T } | { ok: false; message: string };

/**
 * إعادة بناء فهرس مساعد المشروع بالكامل (Phase A) — الحل الاحتياطي
 * الآمن "أصلح الفهرس من غير ما تلمس المصدر". Idempotent، وآمن يتكرّر.
 *
 * مش عملية member — إعادة الفهرسة بتستهلك نداءات embedding حقيقية،
 * فمحصورة بـ owner/admin/supervisor.
 */
export async function rebuildProjectKnowledgeAction(projectId: string): Promise<Result<RebuildOutcome>> {
  const g = await requireRole(["owner", "admin", "supervisor"]);
  if (!g.ok) return { ok: false, message: g.message ?? "غير مصرَّح" };

  try {
    const outcome = await rebuildProjectKnowledge(projectId);
    return { ok: true, data: outcome };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "فشلت إعادة بناء فهرس المعرفة." };
  }
}
