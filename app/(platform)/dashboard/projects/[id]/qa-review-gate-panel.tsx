"use client";

import { useTransition } from "react";
import { BadgeCheck, CheckCircle2, XCircle } from "lucide-react";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import { decideEngineeringQaReview, decideProductionMonitoringReview } from "./workflow-review-actions";

/**
 * بوابة اعتماد بشرية عامة، تُستخدم لمرحلتين جديدتين في الـ Workflow
 * Engine: "Engineering QA Review" و"Production Monitoring Review" —
 * نفس المكوّن، فرق بس أي Server Action بتستدعيه (kind).
 */
export default function QaReviewGatePanel({
  kind,
  projectId,
  targetId,
  scoreLabel,
  canApprove,
  decisionStatus,
  decisionAt,
  readyToReview,
}: {
  kind: "engineering" | "production";
  projectId: string;
  targetId: string | null;
  scoreLabel: string;
  canApprove: boolean;
  decisionStatus: "approved" | "rejected" | null;
  decisionAt: string | null;
  readyToReview: boolean;
}) {
  const [isPending, startAction] = useTransition();

  function decide(decision: "approved" | "rejected") {
    if (!targetId) return;
    startAction(async () => {
      if (kind === "engineering") await decideEngineeringQaReview(targetId, projectId, decision);
      else await decideProductionMonitoringReview(targetId, projectId, decision);
    });
  }

  if (!targetId || !readyToReview) {
    return (
      <Card padding="md">
        <EmptyState
          title="لا يوجد شيء للمراجعة بعد"
          description={kind === "engineering" ? "هتظهر البوابة دي بمجرد اكتمال Engineering QA." : "هتظهر البوابة دي بمجرد وجود فحص إنتاج جاهز."}
        />
      </Card>
    );
  }

  return (
    <Card padding="md">
      <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--v-text)]">
        <BadgeCheck size={16} className="text-[var(--v-primary)]" /> بوابة الاعتماد
      </p>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--v-radius-md)] border border-[var(--v-border)] p-3">
        <div>
          <p className="text-sm text-[var(--v-text)]">{scoreLabel}</p>
          {decisionStatus && (
            <p className="mt-1 text-xs text-[var(--v-text-muted)]">
              تم {decisionStatus === "approved" ? "الاعتماد" : "الرفض"} في {decisionAt ? new Date(decisionAt).toLocaleString("ar-EG") : "—"}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {decisionStatus === "approved" && <Badge tone="success">معتمد</Badge>}
          {decisionStatus === "rejected" && <Badge tone="danger">مرفوض</Badge>}
          {canApprove && (
            <>
              <Button variant="outline" size="sm" onClick={() => decide("approved")} disabled={isPending}>
                <CheckCircle2 size={13} /> اعتماد
              </Button>
              <Button variant="outline" size="sm" onClick={() => decide("rejected")} disabled={isPending}>
                <XCircle size={13} /> رفض
              </Button>
            </>
          )}
        </div>
      </div>
    </Card>
  );
}
