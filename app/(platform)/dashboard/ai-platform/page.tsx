import Link from "next/link";
import { Activity, AlertTriangle, CheckCircle2, DollarSign, ShieldCheck } from "lucide-react";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";
import { PRIORITY_LABELS } from "@/lib/queue/priority";
import type { JobPriority } from "@/lib/queue/types";
import { getAIPlatformDashboard } from "./actions";

// تقرأ حالة حيّة — ممنوع الـ prerender وقت البناء.
export const dynamic = "force-dynamic";

/**
 * لوحة منصة الذكاء الاصطناعي — للمسؤولين فقط.
 *
 * تكشف التكلفة والأعطال عبر كل المشاريع، فهي إدارية بطبيعتها لا خاصة
 * بمشروع.
 */
export default async function AIPlatformPage() {
  const result = await getAIPlatformDashboard();

  if (!result.ok || !result.data) {
    return (
      <div className="mx-auto max-w-md rounded-[var(--v-radius-lg)] border border-[var(--v-border)] bg-[var(--v-surface)] p-6 text-center">
        <h1 className="text-[1.0625rem] font-bold text-[var(--v-text)]">منصة الذكاء الاصطناعي</h1>
        <p className="mt-2 text-sm text-[var(--v-text-secondary)]">
          {result.message ?? "تعذّر عرض اللوحة."}
        </p>
        <Link
          href="/dashboard"
          className="mt-4 inline-block text-sm font-medium text-[var(--v-primary)] underline"
        >
          الرجوع للوحة التحكّم
        </Link>
      </div>
    );
  }

  const { metrics, providers, registeredTypes } = result.data;
  const noData = metrics.totalRequests === 0;

  return (
    <div>
      <div className="mb-5">
        <h1 className="font-display text-display text-[var(--v-text)]">منصة الذكاء الاصطناعي</h1>
        <p className="mt-1 text-sm text-[var(--v-text-secondary)]">
          كل نداء ذكاء اصطناعي في المنصة بيمرّ من بوابة واحدة — وده اللي بيتقاس هنا.
        </p>
      </div>

      {/* المؤشّرات الأساسية */}
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Metric label="إجمالي الطلبات" value={String(metrics.totalRequests)} />
        <Metric label="نسبة النجاح" value={percent(metrics.successRate)} />
        <Metric label="إصابة الذاكرة" value={percent(metrics.cacheHitRate)} />
        <Metric label="متوسط الزمن" value={ms(metrics.avgLatencyMs)} />
        <Metric label="التكلفة" value={usd(metrics.totalCostUsd)} />
        <Metric label="وفّرته الذاكرة" value={usd(metrics.savedByCacheUsd)} tone="good" />
      </div>

      {noData && (
        <Card padding="md" className="mb-4">
          <EmptyState
            title="مفيش نداءات مسجّلة بعد"
            description="الأرقام هتظهر أول ما تمرّ أول مهمة ذكاء اصطناعي من البوابة. البنية جاهزة ومستنية أول نداء."
          />
        </Card>
      )}

      {/* التكلفة والرموز */}
      <Card padding="md" className="mb-4">
        <div className="mb-3 flex items-center gap-2">
          <DollarSign size={16} className="text-[var(--v-primary)]" />
          <h2 className="text-[0.9375rem] font-semibold text-[var(--v-text)]">التكلفة والرموز</h2>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="رموز الدخل" value={metrics.totalInputTokens.toLocaleString("ar-EG")} />
          <Stat label="رموز الخرج" value={metrics.totalOutputTokens.toLocaleString("ar-EG")} />
          <Stat label="متوسط الرموز للطلب" value={metrics.avgTokensPerRequest?.toLocaleString("ar-EG") ?? "—"} />
          <Stat label="حقول محجوبة" value={metrics.totalRedactions.toLocaleString("ar-EG")} />
        </div>
      </Card>

      {/* حالة المزوّدين */}
      <Card padding="md" className="mb-4">
        <div className="mb-3 flex items-center gap-2">
          <Activity size={16} className="text-[var(--v-primary)]" />
          <h2 className="text-[0.9375rem] font-semibold text-[var(--v-text)]">حالة المزوّدين</h2>
        </div>

        {providers.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-[var(--v-text-secondary)]">
            <CheckCircle2 size={14} className="text-[var(--v-green)]" />
            مفيش أي عطل مسجّل — كل الدوائر مغلقة.
          </p>
        ) : (
          <ul className="space-y-2">
            {providers.map((p) => (
              <li
                key={p.provider}
                className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--v-radius-md)] border border-[var(--v-border)] p-3"
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono-plex text-xs text-[var(--v-text)]">{p.provider}</span>
                  <Badge tone={p.state === "closed" ? "success" : p.state === "half_open" ? "warning" : "danger"}>
                    {p.state === "closed" ? "سليم" : p.state === "half_open" ? "اختبار" : "متوقّف"}
                  </Badge>
                </div>
                {p.last_error && (
                  <span className="flex items-center gap-1 text-xs text-[var(--v-text-muted)]">
                    <AlertTriangle size={12} className="text-[var(--v-amber)]" />
                    {p.last_error.slice(0, 80)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* الاستهلاك حسب النوع */}
      {metrics.byTaskType.length > 0 && (
        <Card padding="md" className="mb-4">
          <h2 className="mb-3 text-[0.9375rem] font-semibold text-[var(--v-text)]">
            الاستهلاك حسب نوع المهمة
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--v-border)] text-[11px] text-[var(--v-text-muted)]">
                  <th className="px-2 py-2 text-start">النوع</th>
                  <th className="px-2 py-2 text-start">الطلبات</th>
                  <th className="px-2 py-2 text-start">التكلفة</th>
                  <th className="px-2 py-2 text-start">متوسط الزمن</th>
                </tr>
              </thead>
              <tbody>
                {metrics.byTaskType.map((row) => (
                  <tr key={row.taskType} className="border-b border-[var(--v-border)]/50">
                    <td className="px-2 py-2 font-mono-plex text-xs">{row.taskType}</td>
                    <td className="px-2 py-2 font-mono-plex text-xs">{row.requests}</td>
                    <td className="px-2 py-2 font-mono-plex text-xs">{usd(row.costUsd)}</td>
                    <td className="px-2 py-2 font-mono-plex text-xs">{ms(row.avgLatencyMs)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* أنواع المهام المسجّلة */}
      <Card padding="md">
        <div className="mb-3 flex items-center gap-2">
          <ShieldCheck size={16} className="text-[var(--v-primary)]" />
          <h2 className="text-[0.9375rem] font-semibold text-[var(--v-text)]">
            أنواع مهام الذكاء الاصطناعي المسجّلة ({registeredTypes.length})
          </h2>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {registeredTypes.map((t) => (
            <div
              key={t.type}
              className="rounded-[var(--v-radius-md)] border border-[var(--v-border)] p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono-plex text-xs text-[var(--v-text)]">{t.type}</span>
                <Badge tone="neutral">{PRIORITY_LABELS[t.priority as JobPriority]}</Badge>
              </div>
              {t.description && (
                <p className="mt-1 text-xs text-[var(--v-text-muted)]">{t.description}</p>
              )}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "good" }) {
  return (
    <Card padding="sm">
      <p className="text-[11px] text-[var(--v-text-muted)]">{label}</p>
      <p
        className={`mt-1 font-mono-plex text-lg font-semibold ${
          tone === "good" ? "text-[var(--v-green)]" : "text-[var(--v-text)]"
        }`}
      >
        {value}
      </p>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] text-[var(--v-text-muted)]">{label}</p>
      <p className="mt-0.5 font-mono-plex text-sm font-semibold text-[var(--v-text)]">{value}</p>
    </div>
  );
}

/** `null` تعني «لا عيّنة» لا صفرًا — والفرق يظهر للمستخدم كما هو. */
function percent(value: number | null): string {
  return value === null ? "—" : `${Math.round(value * 100)}٪`;
}

function ms(value: number | null): string {
  if (value === null) return "—";
  return value < 1000 ? `${value} م.ث` : `${(value / 1000).toFixed(1)} ث`;
}

function usd(value: number): string {
  if (value === 0) return "$0";
  return value < 0.01 ? `$${value.toFixed(4)}` : `$${value.toFixed(2)}`;
}
