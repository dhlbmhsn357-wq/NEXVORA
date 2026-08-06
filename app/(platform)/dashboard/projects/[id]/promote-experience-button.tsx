"use client";

import { useState, useTransition } from "react";
import { Brain } from "lucide-react";
import { promoteProjectExperience } from "@/app/(platform)/dashboard/organizational-memory/actions";

/**
 * زرّ «اعتماد المشروع كمصدر خبرة مؤسسية» — للمدير فقط (الجزء X).
 *
 * لا يعمل تلقائيًا: بعد الضغط يستخلص المنصة الخبرة القابلة لإعادة
 * الاستخدام (منظَّفة من بيانات العملاء) كمرشّحين ينتظرون مراجعة المدير
 * في صفحة الذاكرة المؤسسية — لا يدخلون المكتبة مباشرة.
 */
export default function PromoteExperienceButton({ projectId }: { projectId: string }) {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function handleClick() {
    if (!confirm("اعتماد المشروع كمصدر خبرة مؤسسية؟ ستُستخلَص خبرته (منظَّفة من بيانات العملاء) كمرشّحين لمراجعتك قبل إضافتهم للمكتبة العامة.")) {
      return;
    }
    startTransition(async () => {
      const r = await promoteProjectExperience(projectId);
      setMsg(
        r.ok
          ? `تم استخلاص ${r.candidateCount ?? 0} مرشّح — راجعهم في صفحة الذاكرة المؤسسية.`
          : r.message ?? "فشل الاستخلاص."
      );
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={handleClick}
        disabled={pending}
        title="اعتماد المشروع كمصدر خبرة مؤسسية"
        className="inline-flex items-center gap-1.5 rounded-[var(--v-radius-sm)] border border-[var(--v-border)] px-3 py-1.5 text-xs font-medium text-[var(--v-text)] hover:bg-[var(--v-surface-2)] disabled:opacity-50"
      >
        <Brain size={14} className="text-[var(--v-primary)]" />
        {pending ? "جارٍ الاستخلاص…" : "اعتماد كخبرة مؤسسية"}
      </button>
      {msg && <span className="max-w-[220px] text-left text-[0.6875rem] text-[var(--v-text-muted)]">{msg}</span>}
    </div>
  );
}
