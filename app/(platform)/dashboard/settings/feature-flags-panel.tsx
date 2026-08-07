"use client";

import { useState, useTransition } from "react";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { toast } from "@/components/ui/Toaster";
import { updateFeatureFlagAction } from "./feature-flags-actions";
import type { FeatureFlagRow } from "@/lib/feature-flags";

/**
 * لوحة إدارة Feature Flags — مسؤول النظام فقط.
 * تعرض كل flag موجود في الجدول مع toggle مبسّط لتفعيله/تعطيله.
 * تعديل قائمة enabled_per_user مؤجّل لواجهة متقدّمة (P3+).
 */
export default function FeatureFlagsPanel({ initialFlags }: { initialFlags: FeatureFlagRow[] }) {
  const [flags, setFlags] = useState<FeatureFlagRow[]>(initialFlags);
  const [pending, startTransition] = useTransition();
  const [activeName, setActiveName] = useState<string | null>(null);

  function toggle(name: string, currentValue: boolean) {
    setActiveName(name);
    startTransition(async () => {
      const result = await updateFeatureFlagAction(name, !currentValue);
      setActiveName(null);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      setFlags((prev) =>
        prev.map((f) => (f.name === name ? { ...f, enabled_globally: !currentValue } : f))
      );
      toast.success(`تم ${!currentValue ? "تفعيل" : "تعطيل"} ${name}`);
    });
  }

  return (
    <Card padding="md">
      <div className="mb-3">
        <p className="text-sm font-semibold text-[var(--v-text)]">Feature Flags</p>
        <p className="mt-1 text-xs text-[var(--v-text-muted)]">
          مصدر مركزي لتوجيه ميزات NEXVORA. أي تفعيل/تعطيل هنا يؤثر على المنصّة كلها فورًا.
        </p>
      </div>

      <div className="space-y-2">
        {flags.length === 0 && (
          <p className="text-xs text-[var(--v-text-muted)]">لا توجد flags حاليًا.</p>
        )}
        {flags.map((flag) => {
          const isBusy = pending && activeName === flag.name;
          return (
            <div
              key={flag.name}
              className="flex items-start justify-between gap-3 rounded-[var(--v-radius-md)] border border-[var(--v-border)] p-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <code className="font-mono-plex text-xs font-semibold text-[var(--v-text)]">
                    {flag.name}
                  </code>
                  <Badge tone={flag.enabled_globally ? "success" : "neutral"}>
                    {flag.enabled_globally ? "مفعّل" : "معطّل"}
                  </Badge>
                </div>
                {flag.description && (
                  <p className="mt-1 text-xs text-[var(--v-text-muted)]">{flag.description}</p>
                )}
                {flag.enabled_per_user.length > 0 && (
                  <p className="mt-1 text-[11px] text-[var(--v-text-subtle)]">
                    عليها {flag.enabled_per_user.length} استثناء مستخدم
                  </p>
                )}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => toggle(flag.name, flag.enabled_globally)}
                disabled={isBusy}
              >
                {isBusy ? "..." : flag.enabled_globally ? "تعطيل" : "تفعيل"}
              </Button>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
