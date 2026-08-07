"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { recordDecisionAction } from "@/app/(platform)/dashboard/projects/[id]/client-approval-actions";
import type { ApprovalDecision } from "@/lib/client-approval/types";
import { APPROVAL_DECISION_LABELS } from "@/lib/client-approval/types";

export default function ApproveDecisionForm({ token, defaultActor }: { token: string; defaultActor: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [decision, setDecision] = useState<ApprovalDecision>("approved");
  const [note, setNote] = useState("");
  const [actor, setActor] = useState(defaultActor || "");
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await recordDecisionAction(token, { decision, note, actor });
      if (res.ok) router.refresh();
      else setError(res.message);
    });
  }

  return (
    <div className="space-y-4 rounded-lg border border-gray-200 bg-white p-6">
      <p className="text-sm text-gray-700">اختر قرارك بعد الاطلاع على المستند:</p>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {(["approved", "rejected", "changes_requested"] as const).map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setDecision(d)}
            className={`rounded-lg border p-3 text-sm font-medium transition ${
              decision === d
                ? d === "approved" ? "border-green-500 bg-green-50 text-green-800"
                  : d === "rejected" ? "border-red-500 bg-red-50 text-red-800"
                  : "border-amber-500 bg-amber-50 text-amber-800"
                : "border-gray-200 bg-white text-gray-700 hover:border-gray-400"
            }`}
          >
            {APPROVAL_DECISION_LABELS[d]}
          </button>
        ))}
      </div>

      <div>
        <label className="mb-1 block text-xs text-gray-600">اسمك (سيُسجَّل في السجل)</label>
        <input
          className="w-full rounded border border-gray-300 p-2 text-sm"
          value={actor} onChange={(e) => setActor(e.target.value)} placeholder="الاسم الكامل"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs text-gray-600">ملاحظة (اختياري)</label>
        <textarea
          className="w-full rounded border border-gray-300 p-2 text-sm" rows={4}
          value={note} onChange={(e) => setNote(e.target.value)}
          placeholder={decision === "changes_requested" ? "ما التعديلات المطلوبة؟" : "أضف أي ملاحظة..."}
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="button" disabled={pending} onClick={submit}
        className="w-full rounded-lg bg-gray-900 px-4 py-3 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-50"
      >
        {pending ? "جارٍ الإرسال..." : "إرسال القرار"}
      </button>
    </div>
  );
}
