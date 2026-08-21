"use client";

/**
 * NEXVORA "إعدادات القطاع" (Sector Standard Settings) — Standard Product
 * Package، المرحلة د (الأخيرة). تبويب أداة دائم، متاح لأي مشروع (زي
 * projectAssistant) — مش مقيّد بـ workflow_mode. يحوي فعل واحد فقط:
 * "تعليم هذا المشروع كـ Sector Standard" (Piece #1 — القسم الثاني من
 * المواصفة). لو المشروع مُعلَّم فعلًا كـ Standard، بيعرض ملخّصه بدل
 * النموذج.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Award } from "lucide-react";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Input from "@/components/ui/Input";
import { toast } from "@/components/ui/Toaster";
import { markAsSectorStandardAction } from "../sector-standard-actions";

export interface SectorStandardSettingsPanelProps {
  projectId: string;
  isSectorStandard: boolean;
  sectorName: string | null;
  standardVersion: string | null;
  canWrite: boolean;
}

export default function SectorStandardSettingsPanel({
  projectId, isSectorStandard, sectorName, standardVersion, canWrite,
}: SectorStandardSettingsPanelProps) {
  const router = useRouter();
  const [sector, setSector] = useState(sectorName ?? "");
  const [version, setVersion] = useState(standardVersion ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!sector.trim() || !version.trim()) {
      toast.error("اسم القطاع ورقم الإصدار مطلوبان.");
      return;
    }
    setSaving(true);
    const res = await markAsSectorStandardAction(projectId, sector, version);
    setSaving(false);
    if (!res.ok) { toast.error(res.message); return; }
    toast.success("تم تعليم المشروع كـ Sector Standard");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <Card>
        <div className="mb-4 flex items-center gap-2 border-b border-[var(--v-border)] pb-3">
          <Award size={16} className="text-[var(--v-primary)]" />
          <h3 className="text-base font-semibold text-[var(--v-text)]">Sector Standard</h3>
          {isSectorStandard && <Badge tone="success">مُعلَّم كـ Standard</Badge>}
        </div>

        {isSectorStandard ? (
          <div className="space-y-2 text-sm text-[var(--v-text)]">
            <p>هذا المشروع مُعلَّم كـ Sector Standard — يمكن استنساخه لعملاء جدد كـ Client Variant.</p>
            <div className="flex flex-wrap gap-4 text-[13px] text-[var(--v-text-secondary)]">
              <span>القطاع: <strong className="text-[var(--v-text)]">{sectorName}</strong></span>
              <span>الإصدار: <strong className="text-[var(--v-text)]">{standardVersion}</strong></span>
            </div>
            {canWrite && (
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs text-[var(--v-text-secondary)]">اسم القطاع</label>
                  <Input value={sector} onChange={(e) => setSector(e.target.value)} placeholder="مثال: عيادات" />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-[var(--v-text-secondary)]">رقم الإصدار</label>
                  <Input value={version} onChange={(e) => setVersion(e.target.value)} placeholder="مثال: 1.3" />
                </div>
                <div className="sm:col-span-2 flex justify-end">
                  <Button variant="ghost" disabled={saving} onClick={handleSave}>
                    {saving ? "جارٍ الحفظ..." : "تحديث بيانات الإصدار"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-[var(--v-text-secondary)]">
              علِّم هذا المشروع كـ Sector Standard عشان يبقى قابل للاستنساخ كـ نقطة بداية (Client Variant) لعملاء
              القطاع ده لاحقًا — كل بيانات المنتج الحالية (Personas/Flows/Requirements/Stories/...) هتُستنسخ كلقطة
              مش وراثة حيّة.
            </p>
            {canWrite ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs text-[var(--v-text-secondary)]">اسم القطاع *</label>
                  <Input value={sector} onChange={(e) => setSector(e.target.value)} placeholder="مثال: عيادات" />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-[var(--v-text-secondary)]">رقم الإصدار *</label>
                  <Input value={version} onChange={(e) => setVersion(e.target.value)} placeholder="مثال: 1.3" />
                </div>
                <div className="sm:col-span-2 flex justify-end">
                  <Button variant="primary" disabled={saving} onClick={handleSave}>
                    {saving ? "جارٍ الحفظ..." : "تعليم كـ Sector Standard"}
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-[12px] text-[var(--v-text-muted)]">تعليم المشروع كـ Sector Standard متاح فقط لأدوار الإدارة/الإشراف.</p>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
