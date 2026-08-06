"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { testConnection } from "./actions";
import { AIProviderName } from "@/lib/ai/types";

export default function TestConnectionButton({
  provider,
}: {
  provider: AIProviderName;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "testing">("idle");
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  async function handleTest() {
    setStatus("testing");
    setResult(null);
    const res = await testConnection(provider);
    setResult(res);
    setStatus("idle");
    router.refresh();
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleTest}
        disabled={status === "testing"}
        className="rounded-[var(--v-radius-md)] bg-[var(--v-primary)] px-4 py-2 text-sm font-bold text-white transition hover:bg-[var(--v-primary-hover)] disabled:opacity-50"
      >
        {status === "testing" ? "جاري الاختبار…" : "Test Connection"}
      </button>
      {result && (
        <p
          className={`mt-2 text-xs ${result.ok ? "text-[var(--v-green)]" : "text-[var(--v-red)]"}`}
        >
          {result.message}
        </p>
      )}
    </div>
  );
}
