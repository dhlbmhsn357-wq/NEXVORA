import { X } from "lucide-react";

/**
 * Chip فلتر نشط قابل للإزالة — بيوضّح إيه المُطبّق فعليًا بدل ما المستخدم
 * يعتمد على تذكّر إنه فتح BottomSheet واختار حاجة، خصوصًا على الموبايل
 * لما الـ Sheet يتقفل والفلتر يفضل شغّال من غير أي إشارة مرئية تانية.
 */
export default function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <button
      type="button"
      onClick={onRemove}
      aria-label={`إزالة فلتر: ${label}`}
      className="inline-flex items-center gap-1.5 rounded-[var(--v-radius-full)] border border-[var(--v-primary)]/30 bg-[var(--v-primary-tint)] py-1 pe-1 ps-3 text-xs font-medium text-[var(--v-primary)] transition hover:border-[var(--v-primary)]"
    >
      {label}
      <span className="flex h-4 w-4 items-center justify-center rounded-full hover:bg-[var(--v-primary)]/15" aria-hidden="true">
        <X size={11} />
      </span>
    </button>
  );
}
