"use client";

import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Boxes,
  CheckCircle2,
  Clock,
  Copy,
  FileStack,
  GitBranch,
  Layers,
  ShieldQuestion,
  TrendingUp,
} from "lucide-react";
import Card from "@/components/ui/Card";
import Badge, { type BadgeTone } from "@/components/ui/Badge";
import { categoryLabel } from "@/lib/knowledge-hub/model";
import { QUALITY_LEVEL_LABELS, type QualityLevel } from "@/lib/knowledge-hub/quality";
import { EVENT_LABELS, type KnowledgeEventType } from "@/lib/knowledge-hub/events";
import type { KnowledgeDashboardData } from "./actions";

/**
 * لوحة مركز المعرفة.
 *
 * ## مبدأ العرض: كل رقم يقود لفعل
 *
 * لوحة بتعرض أرقامًا بلا سياق بتتحوّل لزينة. كل بطاقة هنا إما بتقول
 * «كل حاجة تمام» أو بتقول **إيه الناقص وإيه المطلوب** — والجودة
 * بالذات بتيجي بنقاط ضعفها مرتَّبة بالأسوأ.
 */

const QUALITY_TONES: Record<QualityLevel, BadgeTone> = {
  critical: "danger",
  weak: "danger",
  fair: "warning",
  good: "success",
  excellent: "success",
};

export default function KnowledgeClient({ data }: { data: KnowledgeDashboardData }) {
  const router = useRouter();
  const { projects, selectedProjectId, monitoring } = data;

  if (!selectedProjectId || !monitoring) {
    return (
      <Card padding="md">
        <p className="text-sm text-[var(--v-text-secondary)]">
          مافيش مشاريع لعرض معرفتها. أنشئ مشروعًا وارفع أول مستند.
        </p>
      </Card>
    );
  }

  const { counts, quality } = monitoring;
  const growthTotal = monitoring.growth.reduce((sum, p) => sum + p.added, 0);

  return (
    <div className="space-y-5">
      {projects.length > 1 && (
        <Card padding="md">
          <label className="block text-xs text-[var(--v-text-muted)]">المشروع</label>
          <select
            className="mt-1.5 w-full max-w-md rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-surface)] px-3 py-2 text-sm text-[var(--v-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--v-primary)]"
            value={selectedProjectId}
            onChange={(e) => router.push(`/dashboard/knowledge?project=${e.target.value}`)}
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Card>
      )}

      {!monitoring.ready && (
        <Card padding="md">
          <p className="flex items-center gap-2 text-sm text-[var(--v-warning)]">
            <AlertTriangle size={16} />
            دالة الصحة مش متاحة — طبّق ترحيل ٠٠٧٦ عشان الأرقام تبقى كاملة.
          </p>
        </Card>
      )}

      {/* ---------- الجودة ---------- */}
      <Card padding="md">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ShieldQuestion size={18} className="text-[var(--v-primary)]" />
            <h2 className="text-[0.9375rem] font-semibold text-[var(--v-text)]">جودة المعرفة</h2>
            <Badge tone={QUALITY_TONES[monitoring.qualityLevel]}>
              {quality.overall}٪ · {QUALITY_LEVEL_LABELS[monitoring.qualityLevel]}
            </Badge>
          </div>
          <p className="font-mono-plex text-xs text-[var(--v-text-muted)]">
            {quality.itemCount} عنصر صالح للاستخدام
          </p>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Dimension label="التناسق" value={quality.consistency} />
          <Dimension label="الاكتمال" value={quality.completeness} />
          <Dimension label="التغطية" value={quality.coverage} />
          <Dimension label="الثقة" value={quality.confidence} />
          <Dimension label="الحداثة" value={quality.freshness} />
        </div>

        {quality.weaknesses.length > 0 ? (
          <ul className="mt-4 space-y-2">
            {quality.weaknesses.map((w) => (
              <li
                key={w.dimension}
                className="rounded-[var(--v-radius-md)] border border-[var(--v-border)] p-3"
              >
                <div className="flex items-center gap-2">
                  <Badge tone={w.score < 40 ? "danger" : "warning"}>{w.score}٪</Badge>
                  <span className="text-xs font-medium text-[var(--v-text)]">{w.message}</span>
                </div>
                <p className="mt-1.5 text-[0.6875rem] leading-relaxed text-[var(--v-text-secondary)]">
                  {w.action}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 flex items-center gap-2 text-xs text-[var(--v-success)]">
            <CheckCircle2 size={14} />
            مافيش نقاط ضعف — المعرفة متماسكة ومغطّية.
          </p>
        )}
      </Card>

      {/* ---------- الأعداد ---------- */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={<FileStack size={16} />} label="المصادر" value={counts.sources}
          hint={`${counts.readySources} جاهز${counts.failedSources ? ` · ${counts.failedSources} فاشل` : ""}`} />
        <Stat icon={<Boxes size={16} />} label="عناصر المعرفة" value={counts.items}
          hint={monitoring.avgConfidence !== null ? `متوسّط الثقة ${monitoring.avgConfidence}٪` : "لا عيّنة"} />
        <Stat icon={<GitBranch size={16} />} label="الإصدارات" value={counts.versions}
          hint={counts.versions === 0 ? "مافيش إصدارات متسجّلة بعد" : "تاريخ كامل محفوظ"} />
        <Stat icon={<Layers size={16} />} label="العلاقات" value={counts.relations} hint="شبكة المعرفة" />
        <Stat icon={<Copy size={16} />} label="التكرار" value={quality.duplicateCount}
          hint={quality.duplicateCount === 0 ? "مافيش تكرار" : "يستحق الدمج"} tone={quality.duplicateCount > 0 ? "warning" : undefined} />
        <Stat icon={<AlertTriangle size={16} />} label="التعارضات" value={counts.conflicts}
          hint={counts.conflicts === 0 ? "مافيش تعارض" : "يحتاج حسمًا"} tone={counts.conflicts > 0 ? "danger" : undefined} />
        <Stat icon={<ShieldQuestion size={16} />} label="الفجوات" value={counts.gaps} hint="أسئلة بلا إجابة" />
        <Stat icon={<Clock size={16} />} label="مراجعات معلّقة" value={counts.pendingReviews}
          hint={counts.pendingReviews === 0 ? "الكل مُراجَع" : "تحتاج عينًا بشرية"} tone={counts.pendingReviews > 0 ? "warning" : undefined} />
      </div>

      {/* ---------- النمو ---------- */}
      <Card padding="md">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <TrendingUp size={18} className="text-[var(--v-primary)]" />
            <h2 className="text-[0.9375rem] font-semibold text-[var(--v-text)]">
              النمو — آخر ثلاثين يومًا
            </h2>
          </div>
          <p className="font-mono-plex text-xs text-[var(--v-text-muted)]">
            {growthTotal} عنصر جديد
          </p>
        </div>

        {growthTotal === 0 ? (
          <p className="mt-3 text-xs text-[var(--v-text-muted)]">
            مافيش معرفة جديدة في آخر ثلاثين يومًا.
          </p>
        ) : (
          <GrowthBars points={monitoring.growth} />
        )}
      </Card>

      {/* ---------- ذكاء الأعمال المهيكل (الجزء الثالث) ---------- */}
      {monitoring.processing && (
        <Card padding="md">
          <div className="flex items-center gap-2">
            <Layers size={18} className="text-[var(--v-primary)]" />
            <h2 className="text-[0.9375rem] font-semibold text-[var(--v-text)]">
              ذكاء الأعمال المهيكل
            </h2>
          </div>
          <p className="mt-1 text-xs text-[var(--v-text-muted)]">
            كائنات مستخرَجة من المعرفة — قابلة للاستعلام والربط وتحليل الأثر.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            <Stat icon={<Boxes size={16} />} label="الكيانات" value={monitoring.processing.entities} hint="أشياء معرّفة" />
            <Stat icon={<GitBranch size={16} />} label="العلاقات" value={monitoring.processing.relations} hint="بين الكيانات" />
            <Stat icon={<ShieldQuestion size={16} />} label="قواعد العمل" value={monitoring.processing.rules} hint="شرط ← نتيجة" />
            <Stat icon={<Layers size={16} />} label="سير العمل" value={monitoring.processing.workflows} hint="خطوات مرتّبة" />
            <Stat icon={<FileStack size={16} />} label="المتطلبات" value={monitoring.processing.requirements} hint="مصنّفة بالنوع" />
            <Stat icon={<Clock size={16} />} label="القرارات" value={monitoring.processing.decisions} hint="بأسبابها" />
            <Stat icon={<AlertTriangle size={16} />} label="المخاطر" value={monitoring.processing.risks}
              hint="احتمال × شدّة" tone={monitoring.processing.risks > 0 ? "warning" : undefined} />
          </div>
        </Card>
      )}

      {/* ---------- الطبقة الاستشارية (الجزء الخامس) ---------- */}
      {monitoring.intelligence && (
        <Card padding="md">
          <div className="flex items-center gap-2">
            <TrendingUp size={18} className="text-[var(--v-primary)]" />
            <h2 className="text-[0.9375rem] font-semibold text-[var(--v-text)]">
              الطبقة الاستشارية — درجات ورؤى
            </h2>
          </div>
          <p className="mt-1 text-xs text-[var(--v-text-muted)]">
            المستشار الذكي: نضج المشروع وجاهزيته ورؤى قابلة للفعل.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <Stat icon={<TrendingUp size={16} />} label="نضج المعرفة"
              value={monitoring.intelligence.maturity ?? 0}
              hint={monitoring.intelligence.maturity === null ? "لم يُحسب بعد" : "٪ فهم المشروع"} />
            <Stat icon={<TrendingUp size={16} />} label="جاهزية المشروع"
              value={monitoring.intelligence.readiness ?? 0}
              hint={monitoring.intelligence.readiness === null ? "لم تُحسب بعد" : "٪ للتنفيذ"} />
            <Stat icon={<Boxes size={16} />} label="رؤى مفتوحة" value={monitoring.intelligence.openInsights}
              hint={monitoring.intelligence.openInsights === 0 ? "لا رؤى" : "تحتاج مراجعة"} />
            <Stat icon={<AlertTriangle size={16} />} label="رؤى حرجة" value={monitoring.intelligence.criticalInsights}
              hint={monitoring.intelligence.criticalInsights === 0 ? "لا شيء حرج" : "أولوية قصوى"}
              tone={monitoring.intelligence.criticalInsights > 0 ? "danger" : undefined} />
            <Stat icon={<Boxes size={16} />} label="رؤى مقبولة" value={monitoring.intelligence.acceptedInsights}
              hint="اعتمدها الفريق" />
          </div>
        </Card>
      )}

      {/* ---------- الحوكمة والجودة (الجزء الثامن) ---------- */}
      {monitoring.governance && (
        <Card padding="md">
          <div className="flex items-center gap-2">
            <ShieldQuestion size={18} className="text-[var(--v-primary)]" />
            <h2 className="text-[0.9375rem] font-semibold text-[var(--v-text)]">
              الحوكمة والجودة
            </h2>
          </div>
          <p className="mt-1 text-xs text-[var(--v-text-muted)]">
            دورة حياة المعرفة وجودتها الموحّدة والحزم القابلة للنقل.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat icon={<ShieldQuestion size={16} />} label="جودة موحّدة"
              value={monitoring.governance.qaScore ?? 0}
              hint={monitoring.governance.qaScore === null ? "لم تُحسب بعد" : "٪ تقرير QA"} />
            <Stat icon={<AlertTriangle size={16} />} label="مشاكل الجودة"
              value={monitoring.governance.qaIssues ?? 0}
              hint={monitoring.governance.qaIssues ? "تحتاج معالجة" : "لا مشاكل"}
              tone={(monitoring.governance.qaIssues ?? 0) > 0 ? "warning" : undefined} />
            <Stat icon={<GitBranch size={16} />} label="سياسات نشطة" value={monitoring.governance.activePolicies}
              hint="حوكمة دورة الحياة" />
            <Stat icon={<FileStack size={16} />} label="الحزم" value={monitoring.governance.packages}
              hint="تصدير · نسخ احتياطي" />
          </div>
        </Card>
      )}

      {/* ---------- التوزيعات ---------- */}
      <div className="grid gap-3 md:grid-cols-2">
        <Distribution title="حسب التصنيف" rows={monitoring.byCategory.slice(0, 10)} label={categoryLabel} />
        <Distribution title="حسب المصدر" rows={monitoring.bySourceType.slice(0, 10)} label={(k) => k} />
      </div>

      {/* ---------- الخط الزمني ---------- */}
      <Card padding="md">
        <h2 className="text-[0.9375rem] font-semibold text-[var(--v-text)]">الخط الزمني</h2>
        {monitoring.timeline.length === 0 ? (
          <p className="mt-3 text-xs text-[var(--v-text-muted)]">
            مافيش أحداث مسجّلة بعد. الخط الزمني بيمتلي مع أول استيراد بعد تطبيق ترحيل ٠٠٧٦.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {monitoring.timeline.map((entry) => (
              <li key={entry.id} className="flex items-start gap-3 text-xs">
                <Badge tone="neutral">
                  {EVENT_LABELS[entry.eventType as KnowledgeEventType] ?? entry.eventType}
                </Badge>
                <span className="flex-1 text-[var(--v-text)]">{entry.summary}</span>
                <span className="font-mono-plex whitespace-nowrap text-[0.6875rem] text-[var(--v-text-muted)]">
                  {entry.createdAt.toLocaleDateString("ar-EG")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Dimension({ label, value }: { label: string; value: number }) {
  const tone = value < 40 ? "var(--v-danger)" : value < 70 ? "var(--v-warning)" : "var(--v-success)";
  return (
    <div className="rounded-[var(--v-radius-md)] border border-[var(--v-border)] p-3">
      <p className="text-[0.6875rem] text-[var(--v-text-muted)]">{label}</p>
      <p className="mt-1 font-mono-plex text-lg font-semibold" style={{ color: tone }}>
        {value}٪
      </p>
      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-[var(--v-border)]">
        <div className="h-full rounded-full" style={{ width: `${value}%`, background: tone }} />
      </div>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  hint: string;
  tone?: "warning" | "danger";
}) {
  const color =
    tone === "danger" ? "var(--v-danger)" : tone === "warning" ? "var(--v-warning)" : "var(--v-text)";
  return (
    <Card padding="md">
      <div className="flex items-center gap-2 text-[var(--v-text-muted)]">
        {icon}
        <span className="text-[0.6875rem]">{label}</span>
      </div>
      <p className="mt-1 font-mono-plex text-xl font-semibold" style={{ color }}>
        {value}
      </p>
      <p className="mt-0.5 text-[0.6875rem] text-[var(--v-text-secondary)]">{hint}</p>
    </Card>
  );
}

/**
 * أعمدة النمو.
 *
 * الارتفاع نسبي لأعلى يوم لا لرقم ثابت: مشروع بيضيف عنصرين في اليوم
 * كان هيبان مسطّحًا تمامًا لو المقياس مطلق.
 */
function GrowthBars({ points }: { points: Array<{ date: string; added: number }> }) {
  const max = Math.max(...points.map((p) => p.added), 1);

  return (
    <div className="mt-4 flex h-24 items-end gap-1 overflow-x-auto">
      {points.map((point) => (
        <div
          key={point.date}
          className="flex min-w-[8px] flex-1 flex-col items-center justify-end"
          title={`${point.date} — ${point.added}`}
        >
          <div
            className="w-full rounded-t-sm bg-[var(--v-primary)]"
            style={{
              height: `${(point.added / max) * 100}%`,
              minHeight: point.added > 0 ? 3 : 1,
              opacity: point.added > 0 ? 1 : 0.15,
            }}
          />
        </div>
      ))}
    </div>
  );
}

function Distribution({
  title,
  rows,
  label,
}: {
  title: string;
  rows: Array<{ key: string; count: number }>;
  label: (key: string) => string;
}) {
  const max = Math.max(...rows.map((r) => r.count), 1);

  return (
    <Card padding="md">
      <h2 className="text-[0.9375rem] font-semibold text-[var(--v-text)]">{title}</h2>
      {rows.length === 0 ? (
        <p className="mt-3 text-xs text-[var(--v-text-muted)]">مافيش بيانات.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {rows.map((row) => (
            <li key={row.key} className="text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[var(--v-text)]">{label(row.key)}</span>
                <span className="font-mono-plex text-[var(--v-text-muted)]">{row.count}</span>
              </div>
              <div className="mt-1 h-1 overflow-hidden rounded-full bg-[var(--v-border)]">
                <div
                  className="h-full rounded-full bg-[var(--v-primary)]"
                  style={{ width: `${(row.count / max) * 100}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
