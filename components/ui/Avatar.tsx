/**
 * Avatar بالأحرف الأولى — بدون عمود صورة في DB (مشتق من الاسم/الإيميل).
 * لون ثابت مستنتج من النص عشان نفس المستخدم ياخد نفس اللون دايمًا.
 */
const PALETTE = [
  "var(--v-primary)",
  "var(--v-green)",
  "var(--v-amber)",
  "var(--v-red)",
  "#6366f1",
  "#0ea5e9",
  "#ec4899",
  "#14b8a6",
];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "؟";
  if (parts.length === 1) return parts[0].slice(0, 2);
  return (parts[0][0] ?? "") + (parts[1][0] ?? "");
}

function colorFor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

export default function Avatar({ name, size = 32 }: { name: string | null; size?: number }) {
  const label = name || "مستخدم";
  return (
    <span
      aria-hidden="true"
      className="inline-flex shrink-0 items-center justify-center rounded-full font-medium text-white"
      style={{ width: size, height: size, fontSize: size * 0.4, backgroundColor: colorFor(label) }}
      title={label}
    >
      {initials(label)}
    </span>
  );
}
