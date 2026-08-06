"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Copy, Trash2, Power, Pencil, Search, Star, Download, Sparkles } from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import Input from "@/components/ui/Input";
import Badge from "@/components/ui/Badge";
import { toast } from "@/components/ui/Toaster";
import { getTemplateIcon, TEMPLATE_ICON_NAMES } from "@/lib/discovery-templates/icons";
import {
  createTemplate,
  setTemplateStatus,
  duplicateTemplate,
  deleteTemplate,
  toggleTemplateFavorite,
  exportTemplateJson,
} from "./actions";
import type { DiscoveryFormTemplate } from "@/lib/types/database";

type SourceFilter = "all" | "ai_generated" | "manual";

export default function TemplatesManager({
  templates,
  questionCounts,
  isAdmin,
}: {
  templates: DiscoveryFormTemplate[];
  questionCounts: Record<string, number>;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  // بحث + فلترة + مفضلة
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [favoritesOnly, setFavoritesOnly] = useState(false);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return templates.filter((t) => {
      if (favoritesOnly && !t.is_favorite) return false;
      if (sourceFilter !== "all" && t.source !== sourceFilter) return false;
      if (!term) return true;
      const haystack = [t.name, t.industry ?? "", t.description ?? "", (t.tags ?? []).join(" ")].join(" ").toLowerCase();
      return haystack.includes(term);
    });
  }, [templates, search, sourceFilter, favoritesOnly]);

  async function handleFavorite(t: DiscoveryFormTemplate) {
    setBusyId(t.id);
    const result = await toggleTemplateFavorite(t.id, !t.is_favorite);
    setBusyId(null);
    if (!result.ok) {
      toast.error(result.message ?? "فشلت العملية.");
      return;
    }
    router.refresh();
  }

  async function handleExport(t: DiscoveryFormTemplate) {
    setBusyId(t.id);
    const result = await exportTemplateJson(t.id);
    setBusyId(null);
    if (!result.ok || !result.json) {
      toast.error(result.message ?? "فشل التصدير.");
      return;
    }
    const blob = new Blob([result.json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(result.name ?? "template").replace(/[^\w؀-ۿ-]+/g, "_")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // نموذج إنشاء قالب
  const [name, setName] = useState("");
  const [industry, setIndustry] = useState("");
  const [icon, setIcon] = useState("Sparkles");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const result = await createTemplate({ name, industry, icon, description });
    setSaving(false);
    if (!result.ok) {
      toast.error(result.message ?? "فشل الإنشاء.");
      return;
    }
    toast.success("تم إنشاء القالب");
    setCreating(false);
    setName("");
    setIndustry("");
    setDescription("");
    setIcon("Sparkles");
    if (result.id) router.push(`/dashboard/templates/${result.id}`);
    else router.refresh();
  }

  async function handleToggle(t: DiscoveryFormTemplate) {
    setBusyId(t.id);
    const result = await setTemplateStatus(t.id, t.status === "active" ? "inactive" : "active");
    setBusyId(null);
    if (!result.ok) {
      toast.error(result.message ?? "فشلت العملية.");
      return;
    }
    toast.success(t.status === "active" ? "تم التعطيل" : "تم التفعيل");
    router.refresh();
  }

  async function handleDuplicate(t: DiscoveryFormTemplate) {
    setBusyId(t.id);
    const result = await duplicateTemplate(t.id);
    setBusyId(null);
    if (!result.ok) {
      toast.error(result.message ?? "فشل النسخ.");
      return;
    }
    toast.success("تم نسخ القالب");
    if (result.id) router.push(`/dashboard/templates/${result.id}`);
    else router.refresh();
  }

  async function handleDelete(t: DiscoveryFormTemplate) {
    if (!window.confirm(`حذف القالب «${t.name}» وكل أسئلته؟ لا يمكن التراجع.`)) return;
    setBusyId(t.id);
    const result = await deleteTemplate(t.id);
    setBusyId(null);
    if (!result.ok) {
      toast.error(result.message ?? "فشل الحذف.");
      return;
    }
    toast.success("تم حذف القالب");
    router.refresh();
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[var(--v-text-muted)]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ابحث بالاسم أو المجال أو الوسوم…"
            className="w-full rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-bg)] py-2 pr-9 pl-3 text-sm text-[var(--v-text)] outline-none focus:border-[var(--v-primary)]"
          />
        </div>
        <select
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value as SourceFilter)}
          className="rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-bg)] px-3 py-2 text-sm text-[var(--v-text)] outline-none focus:border-[var(--v-primary)]"
        >
          <option value="all">كل المصادر</option>
          <option value="ai_generated">مُولَّد بالـ AI</option>
          <option value="manual">يدوي</option>
        </select>
        <button
          type="button"
          onClick={() => setFavoritesOnly((v) => !v)}
          className={`inline-flex items-center gap-1.5 rounded-[var(--v-radius-md)] border px-3 py-2 text-sm transition ${
            favoritesOnly
              ? "border-[var(--v-amber)] text-[var(--v-amber)]"
              : "border-[var(--v-border)] text-[var(--v-text-secondary)] hover:border-[var(--v-primary)]"
          }`}
        >
          <Star size={14} className={favoritesOnly ? "fill-[var(--v-amber)]" : ""} /> المفضّلة
        </button>
        {isAdmin && (
          <Button variant="primary" icon={<Plus size={15} />} onClick={() => setCreating(true)}>
            قالب جديد
          </Button>
        )}
      </div>

      {filtered.length === 0 && (
        <p className="rounded-[var(--v-radius-md)] border border-dashed border-[var(--v-border)] p-6 text-center text-sm text-[var(--v-text-muted)]">
          مفيش قوالب مطابقة. غيّر البحث أو الفلاتر، أو ولّد نموذجًا جديدًا من تبويب Discovery في أي مشروع.
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((t) => {
          const Icon = getTemplateIcon(t.icon);
          const count = questionCounts[t.id] ?? 0;
          const busy = busyId === t.id;
          return (
            <Card key={t.id} padding="md" className="flex flex-col">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="flex h-9 w-9 items-center justify-center rounded-[var(--v-radius-md)] bg-[var(--v-primary-tint)] text-[var(--v-primary)]">
                    <Icon size={18} />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-[var(--v-text)]">{t.name}</p>
                    {t.industry && (
                      <p className="text-[11px] text-[var(--v-text-subtle)]">{t.industry}</p>
                    )}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleFavorite(t)}
                      disabled={busy}
                      title={t.is_favorite ? "إزالة من المفضّلة" : "إضافة للمفضّلة"}
                      className="text-[var(--v-text-muted)] hover:text-[var(--v-amber)] disabled:opacity-50"
                    >
                      <Star size={14} className={t.is_favorite ? "fill-[var(--v-amber)] text-[var(--v-amber)]" : ""} />
                    </button>
                    <Badge tone={t.status === "active" ? "success" : "neutral"}>
                      {t.status === "active" ? "مفعّل" : "معطّل"}
                    </Badge>
                  </div>
                  {t.source === "ai_generated" && (
                    <Badge tone="primary">
                      <span className="inline-flex items-center gap-1"><Sparkles size={10} /> AI</span>
                    </Badge>
                  )}
                  {t.is_default && <Badge tone="info">افتراضي</Badge>}
                </div>
              </div>

              {t.description && (
                <p className="mt-2 line-clamp-2 text-xs text-[var(--v-text-muted)]">
                  {t.description}
                </p>
              )}

              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono-plex text-[11px] text-[var(--v-text-subtle)]">
                <span>{count} سؤال</span>
                {t.usage_count > 0 && <span>· استُخدم {t.usage_count}×</span>}
                {t.source === "ai_generated" && (
                  <span>· {new Date(t.created_at).toLocaleDateString("ar-EG")}</span>
                )}
              </div>
              {t.tags && t.tags.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {t.tags.slice(0, 4).map((tag) => (
                    <span key={tag} className="rounded-full bg-[var(--v-surface)] px-2 py-0.5 text-[10px] text-[var(--v-text-muted)]">
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              <div className="mt-3 flex items-center gap-1.5 border-t border-[var(--v-border)] pt-3">
                <Link
                  href={`/dashboard/templates/${t.id}`}
                  className="inline-flex items-center gap-1 rounded-[var(--v-radius-md)] border border-[var(--v-border)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--v-text)] hover:border-[var(--v-primary)]"
                >
                  <Pencil size={13} /> {isAdmin ? "تعديل" : "عرض"}
                </Link>
                <button
                  type="button"
                  onClick={() => handleExport(t)}
                  disabled={busy}
                  title="تصدير JSON"
                  className="rounded-[var(--v-radius-md)] border border-[var(--v-border)] p-1.5 text-[var(--v-text-muted)] hover:border-[var(--v-primary)] disabled:opacity-50"
                >
                  <Download size={13} />
                </button>
                {isAdmin && (
                  <>
                    <button
                      type="button"
                      onClick={() => handleToggle(t)}
                      disabled={busy}
                      title={t.status === "active" ? "تعطيل" : "تفعيل"}
                      className="rounded-[var(--v-radius-md)] border border-[var(--v-border)] p-1.5 text-[var(--v-text-muted)] hover:border-[var(--v-primary)] disabled:opacity-50"
                    >
                      <Power size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDuplicate(t)}
                      disabled={busy}
                      title="نسخ"
                      className="rounded-[var(--v-radius-md)] border border-[var(--v-border)] p-1.5 text-[var(--v-text-muted)] hover:border-[var(--v-primary)] disabled:opacity-50"
                    >
                      <Copy size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(t)}
                      disabled={busy}
                      title="حذف"
                      className="rounded-[var(--v-radius-md)] border border-[var(--v-border)] p-1.5 text-[var(--v-text-muted)] hover:border-[var(--v-red)] hover:text-[var(--v-red)] disabled:opacity-50"
                    >
                      <Trash2 size={13} />
                    </button>
                  </>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      <Modal open={creating} onClose={() => setCreating(false)}>
        <form onSubmit={handleCreate} className="space-y-3">
          <p className="text-sm font-semibold text-[var(--v-text)]">قالب اكتشاف جديد</p>
          <Input
            label="اسم القالب"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="مثلاً: منصة تعليمية"
            required
          />
          <Input
            label="المجال (اختياري)"
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
            placeholder="مثلاً: التعليم"
          />
          <div>
            <label className="mb-1 block text-xs text-[var(--v-text-muted)]">الأيقونة</label>
            <select
              value={icon}
              onChange={(e) => setIcon(e.target.value)}
              className="w-full rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-bg)] px-3 py-2 text-sm text-[var(--v-text)] outline-none focus:border-[var(--v-primary)]"
            >
              {TEMPLATE_ICON_NAMES.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-[var(--v-text-muted)]">الوصف (اختياري)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-bg)] px-3 py-2 text-sm text-[var(--v-text)] outline-none focus:border-[var(--v-primary)]"
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={() => setCreating(false)}>
              إلغاء
            </Button>
            <Button type="submit" variant="primary" loading={saving}>
              إنشاء
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
