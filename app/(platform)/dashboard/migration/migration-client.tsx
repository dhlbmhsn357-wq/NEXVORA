"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, CircleSlash, Power, ServerCrash, TrendingUp } from "lucide-react";
import Card from "@/components/ui/Card";
import Badge, { type BadgeTone } from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import {
  rollbackAllAction,
  setMigrationFlagAction,
  type MigrationDashboardData,
  type ServiceRow,
} from "./actions";
import type { MigratableService } from "@/lib/migration/flags";

/**
 * لوحة الترحيل — القديم مقابل الجديد.
 *
 * الغرض منها قرار واحد: هل نكمّل النقل ولا نرجع؟ فكل رقم معروض هنا
 * **مقاس من تنفيذ حقيقي**، لا مشتقّ ولا مقدَّر.
 */

const SERVICE_LABELS: Record<MigratableService, string> = {
  meeting: "الاجتماعات",
  discovery: "الاكتشاف",
  brain: "عقل المشروع",
  prd: "وثيقة المتطلّبات",
  prototype: "النموذج الأوّلي",
  qa: "المراجعة الهندسية",
  prompt: "البرومبت",
  monitoring: "مراقبة الإنتاج",
  recommendations: "التوصيات",
  architecture: "الذكاء المعماري",
  support: "الدعم",
  knowledge: "مركز المعرفة",
};

const VERDICT_TONES: Record<string, BadgeTone> = {
  healthy: "success",
  degraded: "danger",
  insufficient_data: "neutral",
};

const VERDICT_LABELS: Record<string, string> = {
  healthy: "سليم",
  degraded: "متدهور",
  insufficient_data: "عيّنة غير كافية",
};

export default function MigrationClient({ data }: { data: MigrationDashboardData }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [confirmingRollback, setConfirmingRollback] = useState(false);

  function run(action: () => Promise<{ ok: boolean; message?: string }>) {
    startTransition(async () => {
      const result = await action();
      setMessage(result.message ?? (result.ok ? "تمّ." : "فشل الإجراء."));
      router.refresh();
    });
  }

  const migratedCount = data.services.filter((s) => s.state === "on" && s.rolloutPercent > 0).length;

  // الترتيب بالقابلية للتصرّف لا بترتيب ثابت في الكود: الخدمة اللي ليها
  // عامل حيّ هي الوحيدة اللي ينفع تتفتح دلوقتي، ودفنها في آخر اثنتي عشرة
  // بطاقة بيخفي الإجراء الوحيد المتاح.
  const ordered = [...data.services].sort((a, b) => {
    const rank = (s: ServiceRow) =>
      (s.state === "on" && s.rolloutPercent > 0 ? 0 : 2) + (s.workerAlive ? 0 : 1);
    return rank(a) - rank(b);
  });

  return (
    <div className="space-y-5">
      {data.killSwitch && (
        <Card padding="md">
          <div className="flex items-center gap-2 text-[var(--v-danger)]">
            <Power size={18} />
            <p className="text-sm font-semibold">
              مفتاح الإيقاف العام مفعّل — كل الطلبات على المسار القديم مهما كانت الأعلام.
            </p>
          </div>
        </Card>
      )}

      <Card padding="md">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <TrendingUp size={18} className="text-[var(--v-primary)]" />
            <h2 className="text-[0.9375rem] font-semibold text-[var(--v-text)]">حالة النقل</h2>
            <Badge tone={migratedCount > 0 ? "info" : "neutral"}>
              {migratedCount} من {data.services.length} خدمة
            </Badge>
          </div>
          <p className="font-mono-plex text-xs text-[var(--v-text-muted)]">
            {data.totalNewCalls} تنفيذ على المسار الجديد · {data.totalFallbacks} رجوع للقديم
          </p>
        </div>

        {/* إجراء يمسّ اثني عشر علمًا دفعة واحدة — دوسة غلط عليه تُلغي
            النقل كله. الخطوتان مقصودتان: التأكيد هنا أرخص من الاستعادة. */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {confirmingRollback ? (
            <>
              <span className="text-xs font-medium text-[var(--v-text)]">
                هيتطفي {migratedCount === 0 ? "كل الأعلام" : `${migratedCount} علمًا مفعّلًا`} وترجع
                المنصة كلها للمسار القديم. متأكّد؟
              </span>
              <Button
                variant="danger"
                size="sm"
                disabled={pending}
                onClick={() => {
                  setConfirmingRollback(false);
                  run(() => rollbackAllAction("رجوع شامل من اللوحة"));
                }}
              >
                أيوه، أطفي الكل
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setConfirmingRollback(false)}>
                رجوع
              </Button>
            </>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              disabled={pending || migratedCount === 0}
              onClick={() => setConfirmingRollback(true)}
            >
              <CircleSlash size={14} className="ms-1" />
              رجوع شامل — إطفاء كل الأعلام
            </Button>
          )}
          {message && <span className="text-xs text-[var(--v-text-secondary)]">{message}</span>}
        </div>

        {migratedCount === 0 && !confirmingRollback && (
          <p className="mt-2 text-xs text-[var(--v-text-muted)]">
            كل الأعلام مطفأة أصلًا — مفيش حاجة ترجع منها.
          </p>
        )}
      </Card>

      <div className="grid gap-3 md:grid-cols-2">
        {ordered.map((row) => (
          <ServiceCard
            key={row.service}
            row={row}
            pending={pending}
            onSet={(state, percent) =>
              run(() =>
                setMigrationFlagAction({
                  service: row.service,
                  state,
                  rolloutPercent: percent,
                  note: "تغيير من لوحة الترحيل",
                })
              )
            }
          />
        ))}
      </div>
    </div>
  );
}

function ServiceCard({
  row,
  pending,
  onSet,
}: {
  row: ServiceRow;
  pending: boolean;
  onSet: (state: "off" | "on", percent: number) => void;
}) {
  const active = row.state === "on" && row.rolloutPercent > 0;
  const c = row.comparison;

  return (
    <Card padding="md">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-[var(--v-text)]">
            {SERVICE_LABELS[row.service]}
          </h3>
          <p className="mt-0.5 font-mono-plex text-[0.6875rem] text-[var(--v-text-muted)]">
            {row.service}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Badge tone={active ? "success" : "neutral"}>
            {active ? `مفعّل ${row.rolloutPercent}٪` : "مطفأ"}
          </Badge>
          {!row.workerAlive && (
            <span className="flex items-center gap-1 text-[0.6875rem] text-[var(--v-warning)]">
              <ServerCrash size={12} />
              مفيش عامل حيّ
            </span>
          )}
        </div>
      </div>

      {/* المقارنة — الأرقام دي هي أساس قرار الاستمرار أو الرجوع. */}
      {c ? (
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
          <Metric label="القديم" value={c.legacyAvgMs === null ? "لا عيّنة" : `${c.legacyAvgMs} م.ث`} />
          <Metric label="الجديد" value={c.newAvgMs === null ? "لا عيّنة" : `${c.newAvgMs} م.ث`} />
          <Metric label="نجاح القديم" value={pct(c.legacySuccessRate)} />
          <Metric label="نجاح الجديد" value={pct(c.newSuccessRate)} />
          <Metric label="عدد التنفيذ" value={`${c.legacyCalls} / ${c.newCalls}`} />
          <Metric label="الرجوع للقديم" value={String(c.fallbacks)} />
        </dl>
      ) : (
        <p className="mt-3 text-xs text-[var(--v-text-muted)]">
          مفيش أي تنفيذ مسجَّل في آخر سبعة أيام لهذه الخدمة.
        </p>
      )}

      {row.verdict && (
        <div className="mt-3 flex items-start gap-2">
          <Badge tone={VERDICT_TONES[row.verdict.verdict] ?? "neutral"}>
            {VERDICT_LABELS[row.verdict.verdict] ?? row.verdict.verdict}
          </Badge>
          <p className="text-[0.6875rem] leading-relaxed text-[var(--v-text-secondary)]">
            {row.verdict.reason}
          </p>
        </div>
      )}

      {row.verdict?.verdict === "degraded" && row.verdict.recommendRollback && (
        <p className="mt-2 flex items-center gap-1.5 text-[0.6875rem] font-medium text-[var(--v-danger)]">
          <AlertTriangle size={12} />
          التوصية: أطفئ العلم دلوقتي وشخّص السبب قبل إعادة الفتح.
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="text-[0.6875rem] text-[var(--v-text-muted)]">نسبة النقل</span>
        {[0, 10, 50, 100].map((percent) => (
          <Button
            key={percent}
            variant={row.rolloutPercent === percent && (percent === 0 || active) ? "primary" : "ghost"}
            size="sm"
            // فتح علم بلا عامل بيرجع خطأ من الخادم على أي حال. تعطيله
            // هنا بيقول السبب قبل المحاولة بدل ما يقوله بعدها.
            disabled={pending || (percent > 0 && !row.workerAlive)}
            onClick={() => onSet(percent === 0 ? "off" : "on", percent)}
          >
            {percent === 0 ? "إطفاء" : `${percent}٪`}
          </Button>
        ))}
        {active && row.verdict?.verdict === "healthy" && (
          <CheckCircle2 size={16} className="self-center text-[var(--v-success)]" />
        )}
      </div>

      {!row.workerAlive && (
        <p className="mt-2 text-[0.6875rem] text-[var(--v-text-muted)]">
          شغّل عامل الخدمة الأول — النقل بلا عامل بيرجع للمسار القديم بلا أي أثر.
        </p>
      )}
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-[var(--v-text-muted)]">{label}</dt>
      <dd className="font-mono-plex text-[var(--v-text)]">{value}</dd>
    </div>
  );
}

/** غياب العيّنة يُعرَض كغياب — عرضه صفرًا يقرأ كفشل كامل وهو كذب. */
function pct(value: number | null): string {
  return value === null ? "لا عيّنة" : `${Math.round(value * 100)}٪`;
}
