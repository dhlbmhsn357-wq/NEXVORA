"use client";

import { useState, useTransition } from "react";
import { Library, Boxes, Workflow, Star, FolderTree, Plus } from "lucide-react";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import { createDomainPackage, publishDomainPackage } from "./actions";
import type { DomainDashboard } from "@/lib/domain-library/dashboard";
import type { DomainPackage } from "@/lib/domain-library/package-service";

/**
 * لوحة مكتبة معرفة المجال.
 *
 * تعرض الملخّص + الحزم + إنشاء حزمة (يفشل للمستخدم غير المدير عبر
 * الإجراء، فالزرّ متاح لكن الحماية في الخادم — نفس نمط باقي المنصة).
 */

const DOMAINS = [
  "erp", "crm", "lms", "healthcare", "hospital", "accounting", "warehouse",
  "ecommerce", "restaurant", "factory", "clinic", "school", "construction", "legal", "generic",
];

const DOMAIN_LABELS: Record<string, string> = {
  erp: "ERP", crm: "CRM", lms: "تعليم إلكتروني", healthcare: "رعاية صحية", hospital: "مستشفى",
  accounting: "محاسبة", warehouse: "مخازن", ecommerce: "تجارة إلكترونية", restaurant: "مطاعم",
  factory: "مصانع", clinic: "عيادات", school: "مدارس", construction: "مقاولات", legal: "قانوني", generic: "عام",
};

function domainLabel(d: string): string {
  return DOMAIN_LABELS[d] ?? d;
}

export default function DomainLibraryClient({
  dashboard,
  packages,
}: {
  dashboard: DomainDashboard;
  packages: DomainPackage[];
}) {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("erp");

  function handleCreate() {
    if (!name.trim()) return;
    startTransition(async () => {
      const r = await createDomainPackage(domain, name);
      setMsg(r.ok ? "أُنشئت الحزمة — أضِف بنودها ثم انشرها." : r.message ?? "فشل الإنشاء.");
      if (r.ok) {
        setName("");
        setShowCreate(false);
      }
    });
  }

  function handlePublish(id: string, status: "published" | "archived") {
    startTransition(async () => {
      const r = await publishDomainPackage(id, status);
      setMsg(r.ok ? "تم التحديث." : r.message ?? "فشل التحديث.");
    });
  }

  const t = dashboard.totals;

  return (
    <div className="flex flex-col gap-4">
      {msg && (
        <div className="rounded-[var(--v-radius-sm)] border border-[var(--v-border)] bg-[var(--v-surface-2)] px-4 py-2 text-sm text-[var(--v-text)]">
          {msg}
        </div>
      )}

      {/* الملخّص */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <MiniStat icon={<Library size={16} />} label="الحزم" value={t.packages} hint={`${t.published} منشورة`} />
        <MiniStat icon={<Boxes size={16} />} label="البنود المرجعية" value={t.items} />
        <MiniStat icon={<Star size={16} />} label="أفضل الممارسات" value={t.bestPractices} />
        <MiniStat icon={<Workflow size={16} />} label="سير العمل" value={t.workflows} />
        <MiniStat icon={<FolderTree size={16} />} label="مشاريع مستفيدة" value={t.benefitingProjects} />
        <MiniStat icon={<Library size={16} />} label="مجالات مغطّاة" value={dashboard.byDomain.length} />
      </div>

      {/* إنشاء حزمة */}
      <Card padding="md">
        <div className="flex items-center justify-between">
          <h2 className="text-[0.9375rem] font-semibold text-[var(--v-text)]">الحزم القياسية</h2>
          <button
            onClick={() => setShowCreate((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-[var(--v-radius-sm)] bg-[var(--v-primary)] px-3 py-1.5 text-xs font-medium text-white"
          >
            <Plus size={14} /> حزمة جديدة
          </button>
        </div>

        {showCreate && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <select
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              className="rounded-[var(--v-radius-sm)] border border-[var(--v-border)] bg-[var(--v-bg)] px-2 py-2 text-xs text-[var(--v-text)]"
            >
              {DOMAINS.map((d) => (
                <option key={d} value={d}>{domainLabel(d)}</option>
              ))}
            </select>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="اسم الحزمة (مثال: Hospital ERP)"
              className="min-w-[200px] flex-1 rounded-[var(--v-radius-sm)] border border-[var(--v-border)] bg-[var(--v-bg)] px-3 py-2 text-sm text-[var(--v-text)]"
            />
            <button
              onClick={handleCreate}
              disabled={pending}
              className="rounded-[var(--v-radius-sm)] bg-[var(--v-primary)] px-4 py-2 text-xs font-medium text-white disabled:opacity-50"
            >
              إنشاء
            </button>
          </div>
        )}

        {/* قائمة الحزم */}
        {packages.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--v-text-muted)]">
            لا توجد حزم بعد. المدير ينشئ حزمًا قياسية لتصبح مرجعًا للذكاء.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-[var(--v-border)]">
            {packages.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-[var(--v-text)]">{p.name}</span>
                    <Badge tone="neutral">{domainLabel(p.domain)}</Badge>
                    <Badge tone={p.status === "published" ? "success" : p.status === "archived" ? "neutral" : "warning"}>
                      {p.status === "published" ? "منشورة" : p.status === "archived" ? "مؤرشفة" : "مسودّة"}
                    </Badge>
                  </div>
                  <p className="mt-0.5 font-mono-plex text-xs text-[var(--v-text-muted)]">
                    {p.item_count} بند · جودة {p.quality_score}٪ · استُخدمت {p.usage_count} مرة
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {p.status !== "published" ? (
                    <button
                      onClick={() => handlePublish(p.id, "published")}
                      disabled={pending}
                      className="rounded-[var(--v-radius-sm)] border border-[var(--v-border)] px-3 py-1.5 text-xs text-[var(--v-text)] disabled:opacity-50"
                    >
                      نشر
                    </button>
                  ) : (
                    <button
                      onClick={() => handlePublish(p.id, "archived")}
                      disabled={pending}
                      className="rounded-[var(--v-radius-sm)] border border-[var(--v-border)] px-3 py-1.5 text-xs text-[var(--v-text-muted)] disabled:opacity-50"
                    >
                      أرشفة
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* التغطية بالمجال */}
      {dashboard.byDomain.length > 0 && (
        <Card padding="md">
          <h2 className="text-[0.9375rem] font-semibold text-[var(--v-text)]">التغطية حسب المجال</h2>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {dashboard.byDomain.map((d) => (
              <div key={d.domain} className="rounded-[var(--v-radius-sm)] border border-[var(--v-border)] px-3 py-2">
                <p className="text-sm font-medium text-[var(--v-text)]">{domainLabel(d.domain)}</p>
                <p className="font-mono-plex text-xs text-[var(--v-text-muted)]">
                  {d.packages} حزمة · جودة {d.avgQuality}٪
                </p>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function MiniStat({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: number; hint?: string }) {
  return (
    <Card padding="sm">
      <div className="flex items-center gap-1.5 text-[var(--v-text-muted)]">
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <p className="mt-1 font-display text-[1.25rem] font-bold text-[var(--v-text)]">{value}</p>
      {hint && <p className="font-mono-plex text-[0.6875rem] text-[var(--v-text-muted)]">{hint}</p>}
    </Card>
  );
}
