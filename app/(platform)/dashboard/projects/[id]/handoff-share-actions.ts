"use server";

import { headers } from "next/headers";
import { requireRole } from "@/lib/auth/rbac";
import { getLatestPackage } from "@/lib/handoff/service";
import { signHandoffShareToken, buildHandoffShareUrl } from "@/lib/handoff/share-token";

type Result<T> = { ok: true; data: T } | { ok: false; message: string };
const WRITE_ROLES = ["owner", "admin", "supervisor"] as const;

/**
 * ينشئ (أو يُعيد) رابط مشاركة موقّع رقميًا لآخر حزمة تسليم للمشروع.
 * لا يوجد تخزين للـ token — يُشتق حسابيًا من (projectId + packageId + secret)،
 * لذلك «الإلغاء» يعني تدوير `HANDOFF_SHARE_SECRET` على مستوى الخادم.
 */
export async function generateHandoffShareLinkAction(
  projectId: string,
): Promise<Result<{ url: string; token: string; packageId: string }>> {
  const g = await requireRole([...WRITE_ROLES]);
  if (!g.ok) return { ok: false, message: g.message ?? "غير مصرَّح" };

  const pkg = await getLatestPackage(projectId);
  if (!pkg) return { ok: false, message: "لا توجد حزمة تسليم." };

  try {
    const token = signHandoffShareToken(projectId, pkg.id);
    const h = await headers();
    const proto = h.get("x-forwarded-proto") ?? "https";
    const host = h.get("host") ?? "localhost:3000";
    const origin = `${proto}://${host}`;
    return { ok: true, data: { url: buildHandoffShareUrl(origin, token), token, packageId: pkg.id } };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "فشل توليد الرابط." };
  }
}
