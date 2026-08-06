"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { updateTaskModel } from "./actions";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import type { AITaskType } from "@/lib/ai/types";

// المزوّدون المتاحون للتبديل من الواجهة. لكل واحد اقتراح موديل افتراضي
// يُملأ تلقائيًّا عند التبديل (يقدر المستخدم يعدّله).
const PROVIDERS: { value: string; label: string; defaultModel: string }[] = [
  { value: "gemini", label: "Gemini", defaultModel: "gemini-3.5-flash" },
  { value: "openai", label: "OpenAI", defaultModel: "gpt-5-mini" },
];

export default function TaskModelRow({
  taskType,
  label,
  initialModel,
  initialProvider = "gemini",
}: {
  taskType: AITaskType;
  label: string;
  initialModel: string;
  initialProvider?: string;
}) {
  const [provider, setProvider] = useState(initialProvider);
  const [model, setModel] = useState(initialModel);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [message, setMessage] = useState("");

  const dirty = model !== initialModel || provider !== initialProvider;

  function handleProviderChange(next: string) {
    setProvider(next);
    setStatus("idle");
    // لو الموديل الحالي هو الموديل الافتراضي لأي مزوّد تاني، نقترح
    // الموديل الافتراضي للمزوّد الجديد (يقدر المستخدم يعدّله).
    const meta = PROVIDERS.find((p) => p.value === next);
    const isSomeDefault = PROVIDERS.some((p) => p.defaultModel === model);
    if (meta && (model === initialModel || isSomeDefault)) {
      setModel(meta.defaultModel);
    }
  }

  async function handleSave() {
    setStatus("saving");
    const result = await updateTaskModel(taskType, model, provider);
    if (result.ok) {
      setStatus("saved");
    } else {
      setStatus("error");
      setMessage(result.message ?? "");
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-[var(--v-border)] py-3 last:border-b-0">
      <p className="min-w-40 flex-1 text-sm text-[var(--v-text)]">{label}</p>
      <select
        value={provider}
        onChange={(e) => handleProviderChange(e.target.value)}
        className="h-9 rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-bg)] px-2 text-sm text-[var(--v-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--v-primary)]/40"
        aria-label="المزوّد"
      >
        {PROVIDERS.map((p) => (
          <option key={p.value} value={p.value}>
            {p.label}
          </option>
        ))}
      </select>
      <div className="w-48">
        <Input
          value={model}
          onChange={(e) => {
            setModel(e.target.value);
            setStatus("idle");
          }}
        />
      </div>
      <Button variant="outline" size="sm" onClick={handleSave} disabled={!dirty} loading={status === "saving"}>
        حفظ
      </Button>
      {status === "saved" && (
        <span className="flex items-center gap-1 text-xs text-[var(--v-green)]">
          <Check size={13} /> تم
        </span>
      )}
      {status === "error" && <span className="text-xs text-[var(--v-red)]">{message}</span>}
    </div>
  );
}
