/* eslint-disable @next/next/no-img-element */

/**
 * شعار VELORA — صورة علامة حرف V الرسمية (public/velora-mark.png) +
 * الاسم «VELORA» والشعار الفرعي «Smart Business Solutions» جنبها. نفس
 * صورة العلامة هي أيقونة التطبيق (manifest → /velora-mark.png).
 *
 * الـ API: size = ارتفاع العلامة بالبكسل. showWordmark = إظهار النص جنبها
 * (افتراضيًا نعم؛ في الأماكن اللي ليها نص خاص بنمرّر false = العلامة فقط).
 */

/** صورة علامة الحرف V فقط — مربّعة، تصلح كأيقونة وكجزء من الشعار الكامل. */
export function VeloraMark({ size = 40, className = "" }: { size?: number; className?: string }) {
  return (
    <img
      src="/velora-mark.png"
      alt="VELORA"
      width={size}
      height={size}
      style={{ height: size, width: size }}
      className={`shrink-0 select-none object-cover ${className}`}
      draggable={false}
    />
  );
}

export default function Logo({
  size = 40,
  showWordmark = true,
  subtitle,
}: {
  size?: number;
  showWordmark?: boolean;
  subtitle?: string;
}) {
  if (!showWordmark) return <VeloraMark size={size} />;

  return (
    <span className="inline-flex select-none items-center gap-2.5" translate="no">
      <VeloraMark size={size} />
      <span className="flex flex-col justify-center leading-none">
        <span
          className="font-display font-medium uppercase text-[var(--v-text)]"
          style={{ fontSize: size * 0.42, letterSpacing: "0.28em", lineHeight: 1 }}
        >
          VELORA
        </span>
        <span
          className="text-[var(--v-text-muted)]"
          style={{ fontSize: Math.max(9, size * 0.15), letterSpacing: "0.12em", marginTop: size * 0.08 }}
        >
          {subtitle ?? "Smart Business Solutions"}
        </span>
      </span>
    </span>
  );
}
