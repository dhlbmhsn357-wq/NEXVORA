"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Wand2, Copy, Check } from "lucide-react";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import { toast } from "@/components/ui/Toaster";
import { generateFixPromptsAction } from "./production-monitoring-actions";
import PromptStudioPanel from "./prompt-studio-panel";
import type { MonitoringFixPrompt, MonitoringIncident } from "@/lib/types/database";

const SEVERITY_TONE: Record<string, "danger" | "warning" | "info" | "neutral"> = {
  critical: "danger",
  high: "danger",
  medium: "warning",
  low: "info",
  info: "neutral",
};

const AREA_LABELS: Record<string, string> = {
  database: "قاعدة بيانات",
  frontend: "واجهة أمامية",
  api: "API",
  worker: "Background Worker",
  tests: "اختبارات",
  deployment: "نشر",
  other: "أخرى",
};

/**
 * "Production Monitoring Prompt" — Claude Architect (Phase 6): بيحوّل
 * كل حادثة مفتوحة لمجموعة Prompts جاهزة للمطوّر، مقسّمة حسب المحور
 * التقني لو المشكلة كبيرة، بدل عرض root_cause/patch_proposal الخام بس.
 */
export default function ProductionMonitoringPromptPanel({
  projectId,
  incidents,
  fixPrompts,
}: {
  projectId: string;
  incidents: MonitoringIncident[];
  fixPrompts: MonitoringFixPrompt[];
}) {
  const openIncidents = incidents.filter((i) => i.status !== "resolved");

  if (openIncidents.length === 0) {
    return (
      <Card padding="md">
        <EmptyState title="لا توجد حوادث مفتوحة" description="بمجرد اكتشاف حادثة، تقدر تولّد Prompts إصلاح جاهزة للمطوّر هنا." />
      </Card>
    );
  }

  return (
    <Card padding="md">
      <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--v-text)]">
        <AlertTriangle size={16} className="text-[var(--v-warning)]" /> Prompts إصلاح الحوادث المفتوحة
      </p>
      <div className="mb-3">
        <PromptStudioPanel projectId={projectId} stage="production_fix_prompt" title="Fix Prompt" />
      </div>
      <div className="space-y-3">
        {openIncidents.map((incident) => (
          <IncidentPromptCard key={incident.id} projectId={projectId} incident={incident} prompts={fixPrompts.filter((p) => p.incident_id === incident.id)} />
        ))}
      </div>
    </Card>
  );
}

function IncidentPromptCard({ projectId, incident, prompts }: { projectId: string; incident: MonitoringIncident; prompts: MonitoringFixPrompt[] }) {
  const router = useRouter();
  const [generating, setGenerating] = useState(false);

  async function handleGenerate() {
    setGenerating(true);
    const result = await generateFixPromptsAction(projectId, incident.id);
    setGenerating(false);
    if (result.status === "error") {
      toast.error(result.message);
      return;
    }
    toast.success("جاري توليد Prompts الإصلاح — هتظهر بعد لحظات.");
    router.refresh();
  }

  return (
    <div className="rounded-[var(--v-radius-md)] border border-[var(--v-border)] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-[var(--v-text)]">{incident.title}</p>
        <div className="flex items-center gap-2">
          <Badge tone={SEVERITY_TONE[incident.severity] ?? "neutral"}>{incident.severity}</Badge>
          <Button variant="outline" size="sm" icon={<Wand2 size={13} />} onClick={handleGenerate} disabled={generating}>
            {generating ? "جاري التوليد..." : prompts.length > 0 ? "إعادة توليد" : "توليد Prompts"}
          </Button>
        </div>
      </div>
      {incident.root_cause && <p className="mt-2 text-xs text-[var(--v-text-secondary)]">السبب الجذري: {incident.root_cause}</p>}

      {prompts.length > 0 && (
        <div className="mt-3 space-y-2">
          {prompts.map((p, i) => (
            <FixPromptCard key={p.id} prompt={p} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}

function FixPromptCard({ prompt, index }: { prompt: MonitoringFixPrompt; index: number }) {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);

  async function handleCopy() {
    const text = `${prompt.content.title}\n\nالسياق: ${prompt.content.context}\n\nالمشكلة: ${prompt.content.problem}\n\nالنتيجة المتوقعة: ${prompt.content.expected_result}\n\nمعايير القبول:\n${prompt.content.acceptance_criteria.map((c) => `- ${c}`).join("\n")}\n\nملفات محتملة: ${prompt.content.files.join("، ")}\n\nخطة الاختبار: ${prompt.content.testing_plan}\n\nخطة التراجع: ${prompt.content.rollback}`;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-surface)] p-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <span className="font-mono-plex text-[10px] text-[var(--v-text-subtle)]">#{index + 1}</span>
          <Badge tone="primary">{AREA_LABELS[prompt.area] ?? prompt.area}</Badge>
          <span className="text-xs font-medium text-[var(--v-text)]">{prompt.content.title}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={() => setExpanded((v) => !v)} className="text-[11px] text-[var(--v-primary)] hover:underline">
            {expanded ? "إخفاء" : "التفاصيل"}
          </button>
          <Button variant="ghost" size="sm" onClick={handleCopy}>
            {copied ? <Check size={13} /> : <Copy size={13} />}
          </Button>
        </div>
      </div>
      {expanded && (
        <div className="mt-2 space-y-1.5 text-xs text-[var(--v-text)]">
          <p><span className="font-bold">السياق:</span> {prompt.content.context}</p>
          <p><span className="font-bold">المشكلة:</span> {prompt.content.problem}</p>
          <p><span className="font-bold">النتيجة المتوقعة:</span> {prompt.content.expected_result}</p>
          {prompt.content.acceptance_criteria.length > 0 && (
            <div>
              <span className="font-bold">معايير القبول:</span>
              <ul className="mt-1 list-inside list-disc">
                {prompt.content.acceptance_criteria.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </div>
          )}
          {prompt.content.files.length > 0 && <p><span className="font-bold">ملفات محتملة:</span> {prompt.content.files.join("، ")}</p>}
          {prompt.content.dependencies.length > 0 && <p><span className="font-bold">يعتمد على:</span> {prompt.content.dependencies.join("، ")}</p>}
          {prompt.content.risks && <p><span className="font-bold">مخاطر:</span> {prompt.content.risks}</p>}
          {prompt.content.testing_plan && <p><span className="font-bold">خطة الاختبار:</span> {prompt.content.testing_plan}</p>}
          {prompt.content.rollback && <p><span className="font-bold">خطة التراجع:</span> {prompt.content.rollback}</p>}
        </div>
      )}
    </div>
  );
}
