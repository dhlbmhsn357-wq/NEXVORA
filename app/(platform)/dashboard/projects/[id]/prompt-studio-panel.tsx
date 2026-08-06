"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Gauge, Sparkles, Copy, Check, History, Loader2 } from "lucide-react";
import Button from "@/components/ui/Button";
import { toast } from "@/components/ui/Toaster";
import {
  getPromptStudioHistory,
  improvePromptStudio,
  getPromptStudioText,
} from "./prompt-studio-actions";
import type { PromptGenerationRow } from "@/lib/ai/prompt-framework";

function scoreTone(score: number | null): string {
  if (score === null) return "var(--v-text-muted)";
  if (score >= 80) return "var(--v-green)";
  if (score >= 50) return "var(--v-amber)";
  return "var(--v-red)";
}

/**
 * Prompt Studio — واجهة موحّدة تُعرض في أي شاشة توليد Prompt: Prompt
 * Readiness Score + أسباب الخصم + Improve (تحسين حي بقفل Scope) + سجل
 * الإصدارات + نسخ. مبنية على الـ Prompt Framework المشترك.
 */
export default function PromptStudioPanel({
  projectId,
  stage,
  title,
}: {
  projectId: string;
  stage: string;
  title: string;
}) {
  const router = useRouter();
  const [history, setHistory] = useState<PromptGenerationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [improving, setImproving] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getPromptStudioHistory(projectId, stage).then((r) => {
      if (cancelled) return;
      if (r.ok) setHistory(r.history);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, stage]);

  const latest = history[0] ?? null;

  async function handleImprove() {
    setImproving(true);
    const r = await improvePromptStudio(projectId, stage);
    setImproving(false);
    if (!r.ok) return toast.error(r.message ?? "فشل التحسين.");
    toast.success(`تم تحسين البرومبت — نسخة ${r.version}.`);
    router.refresh();
    const refreshed = await getPromptStudioHistory(projectId, stage);
    if (refreshed.ok) setHistory(refreshed.history);
  }

  async function handleCopy(row: PromptGenerationRow) {
    const r = await getPromptStudioText(row.id);
    if (!r.ok || !r.text) return toast.error(r.message ?? "تعذّر جلب النص.");
    await navigator.clipboard.writeText(r.text);
    setCopiedId(row.id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  if (loading) {
    return (
      <div className="rounded-[var(--v-radius-md)] border border-[var(--v-border)] p-3 text-xs text-[var(--v-text-muted)]">
        <Loader2 size={13} className="inline animate-spin" /> جاري تحميل Prompt Studio…
      </div>
    );
  }

  if (!latest) return null;

  return (
    <div className="rounded-[var(--v-radius-md)] border border-[var(--v-border)] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-xs font-semibold text-[var(--v-text)]">
          <Gauge size={14} className="text-[var(--v-primary)]" /> Prompt Studio — {title}
        </p>
        <div className="flex items-center gap-3">
          <span className="font-display text-lg" style={{ color: scoreTone(latest.readiness_score) }}>
            {latest.readiness_score ?? "—"}%
          </span>
          <span className="text-[10px] text-[var(--v-text-muted)]">جاهزية · v{latest.version} · {latest.profile}</span>
        </div>
      </div>

      {latest.readiness_deductions.length > 0 && (
        <ul className="mt-2 space-y-0.5">
          {latest.readiness_deductions.map((d) => (
            <li key={d.key} className="text-[11px] text-[var(--v-amber)]">− {d.points}%: {d.reason}</li>
          ))}
        </ul>
      )}

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <Button variant="outline" size="sm" icon={improving ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />} onClick={handleImprove} disabled={improving}>
          {improving ? "جاري التحسين…" : "Improve Prompt"}
        </Button>
        <button type="button" onClick={() => handleCopy(latest)} className="inline-flex items-center gap-1 rounded-[var(--v-radius-md)] border border-[var(--v-border)] px-2 py-1 text-[11px] text-[var(--v-text)] hover:border-[var(--v-primary)]">
          {copiedId === latest.id ? <Check size={12} className="text-[var(--v-green)]" /> : <Copy size={12} />} نسخ البرومبت
        </button>
        {history.length > 1 && (
          <button type="button" onClick={() => setShowHistory((v) => !v)} className="inline-flex items-center gap-1 rounded-[var(--v-radius-md)] border border-[var(--v-border)] px-2 py-1 text-[11px] text-[var(--v-text)] hover:border-[var(--v-primary)]">
            <History size={12} /> السجل ({history.length})
          </button>
        )}
      </div>

      {showHistory && (
        <div className="mt-2 space-y-1 border-t border-[var(--v-border)] pt-2">
          {history.map((row) => (
            <div key={row.id} className="flex items-center justify-between gap-2 text-[11px]">
              <span className="text-[var(--v-text-secondary)]">
                v{row.version}{row.improved_from_id ? " · محسّن" : ""} · <span style={{ color: scoreTone(row.readiness_score) }}>{row.readiness_score ?? "—"}%</span> · {new Date(row.created_at).toLocaleString("ar-EG")}
              </span>
              <button type="button" onClick={() => handleCopy(row)} className="text-[var(--v-text-muted)] hover:text-[var(--v-primary)]">
                {copiedId === row.id ? <Check size={11} className="text-[var(--v-green)]" /> : <Copy size={11} />}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
