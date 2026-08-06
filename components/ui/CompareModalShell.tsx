"use client";

import Modal from "./Modal";
import Select from "./Select";

/**
 * الهيكل المشترك لمودال "مقارنة النسخ" — نفس البنية المتطابقة حرفيًا
 * في 5 لوحات (PRD, Prototype Prompt, Prototype Review, Client
 * Presentation, Developer Handoff). منطق الـ Diff الفعلي (اللي بيختلف
 * شكل بياناته من مرحلة لتانية) بيتمرّر كـ children — صفر تغيير في
 * منطق المقارنة نفسه، بس الهيكل حواليه بقى مبني على Modal المشتركة.
 */
export default function CompareModalShell<T extends { version: number }>({
  title = "مقارنة النسخ",
  needMoreLabel = "محتاج نسختين على الأقل للمقارنة.",
  versions,
  loading,
  compareA,
  compareB,
  setCompareA,
  setCompareB,
  onClose,
  optionLabel,
  children,
}: {
  title?: string;
  needMoreLabel?: string;
  versions: T[];
  loading: boolean;
  compareA: number | null;
  compareB: number | null;
  setCompareA: (v: number) => void;
  setCompareB: (v: number) => void;
  onClose: () => void;
  optionLabel?: (v: T) => string;
  children: (versionA: T, versionB: T) => React.ReactNode;
}) {
  const versionA = versions.find((v) => v.version === compareA);
  const versionB = versions.find((v) => v.version === compareB);
  const label = optionLabel ?? ((v: T) => `نسخة ${v.version}`);

  return (
    <Modal open onClose={onClose} maxWidth="max-w-2xl">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm font-semibold text-[var(--v-text)]">{title}</p>
        <button type="button" onClick={onClose} className="text-xs text-[var(--v-text-muted)] hover:text-[var(--v-text)]">
          إغلاق
        </button>
      </div>

      {loading && <p className="text-xs text-[var(--v-text-muted)]">جاري التحميل…</p>}

      {!loading && versions.length < 2 && <p className="text-xs text-[var(--v-text-muted)]">{needMoreLabel}</p>}

      {!loading && versions.length >= 2 && (
        <>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row">
            <div className="flex-1">
              <Select value={compareA ?? ""} onChange={(e) => setCompareA(Number(e.target.value))}>
                {versions.map((v) => (
                  <option key={v.version} value={v.version}>
                    {label(v)}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex-1">
              <Select value={compareB ?? ""} onChange={(e) => setCompareB(Number(e.target.value))}>
                {versions.map((v) => (
                  <option key={v.version} value={v.version}>
                    {label(v)}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          {versionA && versionB && children(versionA, versionB)}
        </>
      )}
    </Modal>
  );
}
