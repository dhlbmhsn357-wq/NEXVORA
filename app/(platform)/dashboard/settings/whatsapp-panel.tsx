"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Save, Play, Pencil, X, Check } from "lucide-react";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Modal from "@/components/ui/Modal";
import { toast } from "@/components/ui/Toaster";
import {
  updateWhatsAppSettings,
  updateWhatsAppTemplate,
  testWhatsAppProvider,
} from "./whatsapp-actions";
import { PURPOSE_LABELS, renderTemplate } from "@/lib/whatsapp/templates";
import type {
  WhatsAppSettings,
  WhatsAppTemplate,
  WhatsAppProviderStatus,
  WhatsAppProviderName,
} from "@/lib/types/database";

const PROVIDERS: { value: WhatsAppProviderName; label: string }[] = [
  { value: "noop", label: "NoOp (تسجيل بدون إرسال)" },
  { value: "meta_cloud", label: "Meta WhatsApp Cloud API" },
  { value: "twilio", label: "Twilio" },
];

const inputClass =
  "w-full rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-bg)] px-3 py-2 text-sm text-[var(--v-text)] outline-none focus:border-[var(--v-primary)]";

export default function WhatsAppPanel({
  settings,
  templates,
  status,
}: {
  settings: WhatsAppSettings;
  templates: WhatsAppTemplate[];
  status: WhatsAppProviderStatus | null;
}) {
  const router = useRouter();

  // إعدادات
  const [provider, setProvider] = useState<WhatsAppProviderName>(settings.provider);
  const [country, setCountry] = useState(settings.default_country);
  const [expDays, setExpDays] = useState(
    settings.default_link_expiration_days === null
      ? ""
      : String(settings.default_link_expiration_days)
  );
  const [remindersEnabled, setRemindersEnabled] = useState(settings.reminders_enabled);
  const [maxCount, setMaxCount] = useState(String(settings.reminder_max_count));
  const [intervalHours, setIntervalHours] = useState(String(settings.reminder_interval_hours));
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const [editing, setEditing] = useState<WhatsAppTemplate | null>(null);

  async function save() {
    setSaving(true);
    const result = await updateWhatsAppSettings({
      provider,
      default_country: country.trim().toUpperCase(),
      default_link_expiration_days: expDays.trim() === "" ? null : Number(expDays),
      reminders_enabled: remindersEnabled,
      reminder_max_count: Number(maxCount) || 0,
      reminder_interval_hours: Number(intervalHours) || 0,
    });
    setSaving(false);
    if (!result.ok) {
      toast.error(result.message ?? "فشل الحفظ.");
      return;
    }
    toast.success("تم حفظ الإعدادات");
    router.refresh();
  }

  async function test() {
    setTesting(true);
    const result = await testWhatsAppProvider(provider);
    setTesting(false);
    if (result.ok) toast.success(result.message ?? "متصل تمام");
    else toast.error(result.message ?? "فشل الاتصال");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <Card padding="md">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-[var(--v-text)]">مزوّد الواتساب</p>
          {status && (
            <Badge tone={status.last_check_ok ? "success" : "danger"}>
              {status.last_check_ok ? "متصل" : "غير متصل"}
            </Badge>
          )}
        </div>
        <p className="mt-1 text-xs text-[var(--v-text-subtle)]">
          زر «إرسال على واتساب» في صفحة المشروع بيفتح واتساب مباشرة برسالة جاهزة (بدون أي مزوّد) — تضغط
          إرسال بنفسك. الإعداد هنا بيتحكم بس في التذكيرات التلقائية اللي بتتبعت في الخلفية.
        </p>
        {status?.last_message && (
          <p className="mt-1 text-xs text-[var(--v-text-muted)]">
            {status.last_check_at
              ? `آخر فحص: ${new Date(status.last_check_at).toLocaleString("ar-EG")}`
              : ""}
            {" — "}
            {status.last_message}
          </p>
        )}

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs text-[var(--v-text-muted)]">المزوّد</label>
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value as WhatsAppProviderName)}
              className={inputClass}
            >
              {PROVIDERS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <Input
            label="الدولة الافتراضية (ISO)"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            placeholder="EG"
          />
          <Input
            label="مدة صلاحية الرابط الافتراضية (أيام)"
            type="number"
            value={expDays}
            onChange={(e) => setExpDays(e.target.value)}
            placeholder="اترك فاضي = بلا انتهاء"
          />
        </div>

        <div className="mt-3 flex items-center gap-2">
          <Button variant="primary" icon={<Save size={14} />} loading={saving} onClick={save}>
            حفظ
          </Button>
          <Button variant="outline" icon={<Play size={14} />} loading={testing} onClick={test}>
            اختبار الاتصال
          </Button>
        </div>
      </Card>

      <Card padding="md">
        <p className="text-sm font-semibold text-[var(--v-text)]">التذكيرات</p>
        <p className="mt-1 text-xs text-[var(--v-text-muted)]">
          إرسال تذكيرات تلقائية للعملاء اللي لسه ما فتحوش أو ما كمّلوش النموذج.
        </p>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="flex items-center gap-2 self-end pb-2 text-sm text-[var(--v-text)]">
            <input
              type="checkbox"
              checked={remindersEnabled}
              onChange={(e) => setRemindersEnabled(e.target.checked)}
              className="h-4 w-4 accent-[var(--v-primary)]"
            />
            التذكيرات مُفعّلة
          </label>
          <Input
            label="الحد الأقصى لعدد التذكيرات"
            type="number"
            value={maxCount}
            onChange={(e) => setMaxCount(e.target.value)}
          />
          <Input
            label="الفاصل بين التذكيرات (ساعة)"
            type="number"
            value={intervalHours}
            onChange={(e) => setIntervalHours(e.target.value)}
          />
        </div>
      </Card>

      <Card padding="md">
        <p className="text-sm font-semibold text-[var(--v-text)]">قوالب الرسائل</p>
        <p className="mt-1 text-xs text-[var(--v-text-muted)]">
          استخدم متغيّرات زي <code className="rounded bg-[var(--v-surface)] px-1 py-0.5 text-[10px]">{"{{customer_name}}"}</code> و
          <code className="rounded bg-[var(--v-surface)] px-1 py-0.5 text-[10px]">{"{{discovery_link}}"}</code> — بيتم استبدالها لحظة الإرسال.
        </p>

        <div className="mt-4 space-y-2">
          {templates.map((t) => (
            <div
              key={t.id}
              className="flex items-start justify-between gap-2 rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-bg)] px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-[var(--v-text)]">{t.name}</p>
                  {t.is_default && <Badge tone="info">افتراضي</Badge>}
                  <Badge tone={t.status === "active" ? "success" : "neutral"}>
                    {t.status === "active" ? "مفعّل" : "معطّل"}
                  </Badge>
                </div>
                <p className="mt-0.5 text-[11px] text-[var(--v-text-subtle)]">
                  {PURPOSE_LABELS[t.purpose] ?? t.purpose}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditing(t)}
                className="shrink-0 rounded-[var(--v-radius-md)] border border-[var(--v-border)] p-1.5 text-[var(--v-text-muted)] hover:border-[var(--v-primary)] hover:text-[var(--v-primary)]"
                aria-label="تعديل"
              >
                <Pencil size={13} />
              </button>
            </div>
          ))}
        </div>
      </Card>

      {editing && (
        <TemplateEditorModal template={editing} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}

function TemplateEditorModal({
  template,
  onClose,
}: {
  template: WhatsAppTemplate;
  onClose: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(template.name);
  const [body, setBody] = useState(template.body);
  const [status, setStatus] = useState(template.status);
  const [saving, setSaving] = useState(false);

  const preview = renderTemplate(body, {
    customer_name: "أحمد",
    project_name: "مشروع مثال",
    company_name: "شركة العميل",
    discovery_link: "https://example.com/discovery/xxxx",
    expiration_date: "1 أغسطس 2026",
    expiration_line: "الرابط صالح حتى 1 أغسطس 2026.",
    estimated_time_line: "بيستغرق تقريباً 8 إلى 12 دقيقة",
  });

  async function save() {
    setSaving(true);
    const result = await updateWhatsAppTemplate(template.id, { name, body, status });
    setSaving(false);
    if (!result.ok) {
      toast.error(result.message ?? "فشل الحفظ.");
      return;
    }
    toast.success("تم حفظ القالب");
    onClose();
    router.refresh();
  }

  return (
    <Modal open onClose={onClose} maxWidth="max-w-2xl">
      <div className="max-h-[80vh] space-y-3 overflow-y-auto pl-1">
        <p className="text-sm font-semibold text-[var(--v-text)]">تعديل قالب: {PURPOSE_LABELS[template.purpose] ?? template.purpose}</p>

        <Input label="الاسم" value={name} onChange={(e) => setName(e.target.value)} />
        <div>
          <label className="mb-1 block text-xs text-[var(--v-text-muted)]">النص</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={10}
            className={inputClass + " font-mono-plex text-[13px] leading-relaxed"}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-[var(--v-text-muted)]">الحالة</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as "active" | "inactive")}
            className={inputClass}
          >
            <option value="active">مفعّل</option>
            <option value="inactive">معطّل</option>
          </select>
        </div>

        <div>
          <p className="mb-1 text-xs font-semibold text-[var(--v-text-muted)]">معاينة</p>
          <div className="rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-surface)] p-3 text-sm leading-relaxed text-[var(--v-text)] whitespace-pre-wrap">
            {preview}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" icon={<X size={14} />} onClick={onClose}>
            إلغاء
          </Button>
          <Button type="button" variant="primary" icon={<Check size={14} />} loading={saving} onClick={save}>
            حفظ
          </Button>
        </div>
      </div>
    </Modal>
  );
}
