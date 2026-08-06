/**
 * شريط تقدّم موحّد — بديل لأي "نسبة مئوية" كانت بتتعرض كنص فقط.
 * الرقم نفسه بيتحسب في مكان الاستخدام من بيانات حقيقية (مرحلة المشروع،
 * نسبة اكتمال المراجعة...)، الـ component ده بس العرض البصري.
 */
export default function Progress({
  value,
  tone = "primary",
  label,
}: {
  value: number;
  tone?: "primary" | "success" | "warning" | "danger";
  label?: string;
}) {
  const clamped = Math.max(0, Math.min(100, value));
  const toneClass = {
    primary: "bg-[var(--v-primary)]",
    success: "bg-[var(--v-green)]",
    warning: "bg-[var(--v-amber)]",
    danger: "bg-[var(--v-red)]",
  }[tone];

  return (
    <div className="w-full">
      {label && (
        <div className="mb-1 flex items-center justify-between text-[11px] text-[var(--v-text-muted)]">
          <span>{label}</span>
          <span className="tabular-nums">{Math.round(clamped)}%</span>
        </div>
      )}
      <div
        role="progressbar"
        aria-valuenow={Math.round(clamped)}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--v-surface)]"
      >
        <div
          className={`h-full rounded-full transition-[width] duration-500 ease-out ${toneClass}`}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}
