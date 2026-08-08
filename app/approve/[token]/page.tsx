/**
 * NEXVORA Client Approval Portal — Public Page (P11)
 * =================================================
 * صفحة عامة (بدون تسجيل دخول) — العميل يفتحها بالرابط اللي وصله ويقرر:
 * موافقة/رفض/طلب تعديلات.
 *
 * تدفق الأمان:
 *  - القراءة عبر service client (يتخطى RLS) — الأمان في الـ token الطويل.
 *  - عند الفتح، يُسجَّل حدث 'viewed' في الـ audit log.
 *  - القرار يمرّ بـ server action تتحقق من الحالة الفعّالة قبل الحفظ.
 */
import { headers } from "next/headers";
import { getApprovalByToken, logAudit } from "@/lib/client-approval/service";
import {
  APPROVAL_TARGET_LABELS, APPROVAL_DECISION_LABELS,
} from "@/lib/client-approval/types";
import { effectiveStatus } from "@/lib/client-approval/derive";
import ApproveDecisionForm from "./decision-form";

export const dynamic = "force-dynamic";

export default async function ApprovePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const approval = await getApprovalByToken(token);

  if (!approval) {
    return (
      <main className="mx-auto max-w-2xl p-8 text-center">
        <h1 className="mb-2 text-2xl font-bold">رابط غير صالح</h1>
        <p className="text-sm text-gray-600">لم يتم العثور على طلب اعتماد بهذا الرمز.</p>
      </main>
    );
  }

  const now = new Date().toISOString();
  const eff = effectiveStatus(approval, now);

  // نسجّل مشاهدة (best-effort — لا نفشل الصفحة لو الـ audit فشل)
  // 0106: نلتقط IP + UA للـ audit trail.
  try {
    const h = await headers();
    const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
    const ua = h.get("user-agent") || null;
    await logAudit(approval.id, approval.projectId, "viewed", { ip, ua }, approval.clientName || "client");
  } catch { /* ignore */ }

  return (
    <main className="mx-auto max-w-2xl p-6">
      <header className="mb-6 border-b border-gray-200 pb-4">
        <p className="mb-1 text-xs uppercase tracking-wide text-gray-500">{APPROVAL_TARGET_LABELS[approval.targetType]}</p>
        <h1 className="text-2xl font-bold text-gray-900">{approval.title}</h1>
        {approval.summary && <p className="mt-2 text-sm text-gray-700">{approval.summary}</p>}
        <p className="mt-3 text-xs text-gray-500">
          موجّه إلى: <b>{approval.clientName || "—"}</b> · {approval.clientEmail || ""} ·
          {" "}تنتهي: {new Date(approval.expiresAt).toLocaleDateString("ar-EG")}
        </p>
      </header>

      {eff === "pending" ? (
        <ApproveDecisionForm token={token} defaultActor={approval.clientName} />
      ) : (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-6 text-center">
          {eff === "decided" && approval.decision ? (
            <>
              <p className="text-lg font-semibold text-gray-900">تم اتخاذ القرار</p>
              <p className="mt-2 text-sm text-gray-700">
                القرار: <b>{APPROVAL_DECISION_LABELS[approval.decision]}</b>
              </p>
              {approval.decisionNote && <p className="mt-2 text-xs text-gray-600">ملاحظة: {approval.decisionNote}</p>}
              <p className="mt-1 text-xs text-gray-500">
                {approval.decidedAt && new Date(approval.decidedAt).toLocaleString("ar-EG")}
              </p>
            </>
          ) : eff === "expired" ? (
            <p className="text-lg font-semibold text-gray-900">انتهت صلاحية هذا الرابط.</p>
          ) : (
            <p className="text-lg font-semibold text-gray-900">هذا الرابط ملغى.</p>
          )}
        </div>
      )}
    </main>
  );
}
