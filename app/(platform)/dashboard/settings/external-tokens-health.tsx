"use client";

import { useState } from "react";
import { Check, X } from "lucide-react";
import { checkExternalToken } from "./external-tokens-action";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";

type Status = "idle" | "checking" | "ok" | "error";

interface Row {
  key: "github" | "telegram_bot" | "telegram_support_chat";
  label: string;
  description: string;
}

const rows: Row[] = [
  {
    key: "github",
    label: "GitHub Token",
    description: "مطلوب لـ Prototype Review وDeveloper Handoff (قراءة الكود من Repositories).",
  },
  {
    key: "telegram_bot",
    label: "Telegram Bot Token",
    description: "مطلوب لاستقبال تسجيلات الاجتماعات وتنبيهات الدعم.",
  },
  {
    key: "telegram_support_chat",
    label: "Telegram Support Chat",
    description: "المحادثة/الجروب اللي بيوصله تنبيه تصعيد طلبات الدعم.",
  },
];

export default function ExternalTokensHealth() {
  const [state, setState] = useState<Record<Row["key"], { status: Status; message?: string }>>({
    github: { status: "idle" },
    telegram_bot: { status: "idle" },
    telegram_support_chat: { status: "idle" },
  });

  async function check(key: Row["key"]) {
    setState((prev) => ({ ...prev, [key]: { status: "checking" } }));
    const result = await checkExternalToken(key);
    setState((prev) => ({
      ...prev,
      [key]: { status: result.ok ? "ok" : "error", message: result.message },
    }));
  }

  async function checkAll() {
    await Promise.all(rows.map((r) => check(r.key)));
  }

  return (
    <Card padding="md">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-semibold text-[var(--v-text)]">صحة التوكنات الخارجية</p>
        <Button variant="outline" size="sm" onClick={checkAll}>
          فحص الكل
        </Button>
      </div>
      <div className="space-y-3">
        {rows.map((row) => {
          const s = state[row.key];
          return (
            <div key={row.key} className="flex items-start justify-between gap-3 border-b border-[var(--v-border)] pb-3 last:border-b-0 last:pb-0">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-[var(--v-text)]">{row.label}</p>
                <p className="mt-0.5 text-xs text-[var(--v-text-muted)]">{row.description}</p>
                {s.message && (
                  <p
                    className={`mt-1 flex items-center gap-1 text-xs ${
                      s.status === "ok" ? "text-[var(--v-green)]" : "text-[var(--v-red)]"
                    }`}
                  >
                    {s.status === "ok" ? <Check size={12} /> : <X size={12} />}
                    {s.message}
                  </p>
                )}
              </div>
              <Button variant="outline" size="sm" onClick={() => check(row.key)} loading={s.status === "checking"}>
                فحص
              </Button>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
