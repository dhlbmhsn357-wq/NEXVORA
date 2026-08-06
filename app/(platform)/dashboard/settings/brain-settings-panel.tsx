"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { toast } from "@/components/ui/Toaster";
import { updateBrainSettingsAction } from "./brain-settings-actions";
import type { BrainSettings } from "@/lib/brain-v2/review-types";

export default function BrainSettingsPanel({ settings }: { settings: BrainSettings }) {
  const router = useRouter();
  const [threshold, setThreshold] = useState(String(settings.confidence_threshold_percent));
  const [autoResync, setAutoResync] = useState(settings.auto_resync_downstream);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const r = await updateBrainSettingsAction({
      confidence_threshold_percent: Number(threshold) || 0,
      auto_resync_downstream: autoResync,
    });
    setSaving(false);
    if (!r.ok) {
      toast.error(r.message ?? "فشل الحفظ.");
      return;
    }
    toast.success("تم حفظ إعدادات Brain");
    router.refresh();
  }

  return (
    <Card padding="md">
      <p className="text-sm font-semibold text-[var(--v-text)]">إعدادات Project Brain</p>
      <p className="mt-1 text-xs text-[var(--v-text-muted)]">
        أي قسم confidence أقل من الحد ده هيظهر بادج تحذير أثناء المراجعة.
      </p>

      <div className="mt-4 max-w-xs">
        <Input
          label="حد الثقة (نسبة مئوية)"
          type="number"
          value={threshold}
          onChange={(e) => setThreshold(e.target.value)}
        />
      </div>

      <div className="mt-5 border-t border-[var(--v-border)] pt-4">
        <label className="flex items-start gap-2 text-sm text-[var(--v-text)]">
          <input
            type="checkbox"
            checked={autoResync}
            onChange={(e) => setAutoResync(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-[var(--v-primary)]"
          />
          <span>
            المزامنة التلقائية للمشتقات (Live Knowledge Sync)
            <p className="mt-1 text-xs font-normal text-[var(--v-text-muted)]">
              لو مفعّل: أي تغيير حقيقي في Project Brain (اعتماد نسخة، تحليل اكتشاف جديد، دمج اجتماع)
              هيعيد توليد PRD وPrototype Prompt وClient Presentation وDeveloper Handoff تلقائيًا في
              الخلفية — بس للمشاريع اللي عندها محتوى بالفعل. <strong>ده بيستهلك حصة AI حقيقية بكل
              تحديث</strong> — سيبه متعطّل لو عايز تتحكم يدويًا في التوليد وتوفّر الحصة.
            </p>
          </span>
        </label>
      </div>

      <div className="mt-4">
        <Button variant="primary" icon={<Save size={14} />} loading={saving} onClick={save}>
          حفظ
        </Button>
      </div>
    </Card>
  );
}
