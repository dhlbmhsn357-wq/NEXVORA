"use client";

import { useMemo, useState } from "react";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import Select from "@/components/ui/Select";
import { toast } from "@/components/ui/Toaster";
import {
  parseUploadedFileAction,
  previewImportRowsAction,
  createImportBatchAction,
  createProspectsFromImportAction,
} from "./prospect-actions";
import type { ProspectColumnMapping } from "@/lib/prospecting/import-service";
import type { ImportRowInput } from "@/lib/prospecting/service";

const MAPPABLE_FIELDS: { value: keyof ProspectColumnMapping; label: string }[] = [
  { value: "organization_name", label: "اسم المنظمة/الجهة" },
  { value: "sector", label: "القطاع" },
  { value: "governorate", label: "المحافظة" },
  { value: "city_or_area", label: "المدينة/المنطقة" },
  { value: "branches_count", label: "عدد الفروع" },
  { value: "scope_notes", label: "ملاحظات النطاق" },
  { value: "primary_phone_raw", label: "رقم الهاتف" },
  { value: "email", label: "البريد الإلكتروني" },
  { value: "website_url", label: "الموقع الإلكتروني" },
  { value: "social_url", label: "رابط اجتماعي" },
  { value: "visible_size_evidence", label: "دليل الحجم" },
  { value: "activity_signal", label: "إشارة نشاط" },
  { value: "pain_hypothesis", label: "فرضية المشكلة" },
  { value: "suggested_offer", label: "العرض المقترح" },
  { value: "notes", label: "ملاحظات" },
];

const CATEGORY_LABELS: Record<string, string> = {
  valid: "صالح",
  duplicatePotential: "مكرر محتمل",
  invalidPhone: "رقم غير صالح",
  missingName: "بلا اسم",
  missingContact: "بلا وسيلة تواصل",
  needsReview: "يحتاج مراجعة",
};

const DEFAULT_ACTION_BY_CATEGORY: Record<string, ImportRowInput["action"]> = {
  valid: "import",
  needsReview: "import",
  duplicatePotential: "skip_duplicate",
  invalidPhone: "skip_invalid",
  missingName: "skip_invalid",
  missingContact: "skip_invalid",
};

type Step = 1 | 2 | 3;

export default function ImportWizardModal({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported: () => void;
}) {
  const [step, setStep] = useState<Step>(1);
  const [busy, setBusy] = useState(false);

  const [filename, setFilename] = useState("");
  const [fileType, setFileType] = useState<"xlsx" | "csv">("xlsx");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);

  const [headerToField, setHeaderToField] = useState<Record<string, string>>({});

  const [rowCategory, setRowCategory] = useState<Map<number, string>>(new Map());
  const [rowAction, setRowAction] = useState<Map<number, ImportRowInput["action"]>>(new Map());
  const [summary, setSummary] = useState<{ total: number; counts: Record<string, number> } | null>(null);

  const columnMapping: ProspectColumnMapping = useMemo(() => {
    const mapping: Record<string, string> = {};
    for (const [header, field] of Object.entries(headerToField)) {
      if (field) mapping[field] = header;
    }
    return mapping as ProspectColumnMapping;
  }, [headerToField]);

  async function handleFileChange(file: File) {
    setBusy(true);
    const formData = new FormData();
    formData.append("file", file);
    const result = await parseUploadedFileAction(formData);
    setBusy(false);
    if (!result.ok) return toast.error(result.message ?? "فشل قراءة الملف.");
    setFilename(file.name);
    setFileType(result.data.fileType);
    setHeaders(result.data.headers);
    setRows(result.data.rows);

    // تخمين أولي بسيط بمطابقة أسماء الأعمدة لأسماء الحقول.
    const guessed: Record<string, string> = {};
    for (const h of result.data.headers) {
      const norm = h.trim().toLowerCase().replace(/\s+/g, "_");
      const match = MAPPABLE_FIELDS.find((f) => f.value === norm);
      if (match) guessed[h] = match.value;
    }
    setHeaderToField(guessed);
    setStep(2);
  }

  async function handleGoToStep3() {
    if (!columnMapping.organization_name) {
      toast.error("لازم تحدد عمود اسم المنظمة/الجهة قبل المتابعة.");
      return;
    }
    setBusy(true);
    const result = await previewImportRowsAction(rows, columnMapping);
    setBusy(false);
    if (!result.ok) return toast.error(result.message ?? "فشل تحليل الصفوف.");

    const cat = new Map<number, string>();
    const act = new Map<number, ImportRowInput["action"]>();
    const counts: Record<string, number> = {};
    (["valid", "duplicatePotential", "invalidPhone", "missingName", "missingContact", "needsReview"] as const).forEach((key) => {
      const list = result.data[key];
      counts[key] = list.length;
      for (const item of list) {
        cat.set(item.rowIndex, key);
        act.set(item.rowIndex, DEFAULT_ACTION_BY_CATEGORY[key]);
      }
    });
    setRowCategory(cat);
    setRowAction(act);
    setSummary({ total: result.data.totalRows, counts });
    setStep(3);
  }

  async function handleConfirmImport() {
    setBusy(true);
    const batchResult = await createImportBatchAction({ originalFilename: filename, fileType, columnMapping });
    if (!batchResult.ok) {
      setBusy(false);
      toast.error(batchResult.message ?? "فشل إنشاء دفعة الاستيراد.");
      return;
    }
    const importRows: ImportRowInput[] = rows.map((raw, i) => ({
      raw,
      action: rowAction.get(i) ?? "import",
    }));
    const result = await createProspectsFromImportAction(batchResult.data.batchId, importRows, columnMapping);
    setBusy(false);
    if (!result.ok) return toast.error(result.message ?? "فشل الاستيراد.");
    toast.success(`تم استيراد ${result.data.insertedCount} جهة (${result.data.duplicateSkippedCount} مكرر متجاهَل، ${result.data.rejectedCount} مرفوض).`);
    onImported();
  }

  function toggleRowAction(rowIndex: number, action: ImportRowInput["action"]) {
    setRowAction((prev) => new Map(prev).set(rowIndex, action));
  }

  const questionableRowIndices = useMemo(
    () => Array.from(rowCategory.entries()).filter(([, cat]) => cat !== "valid").map(([idx]) => idx).sort((a, b) => a - b),
    [rowCategory]
  );

  return (
    <Modal open onClose={onClose} maxWidth="max-w-3xl">
      <div className="max-h-[80vh] space-y-4 overflow-y-auto">
        <h3 className="text-base font-semibold text-[var(--v-text)]">استيراد ملف — خطوة {step} من 3</h3>

        {step === 1 && (
          <div className="space-y-3">
            <p className="text-sm text-[var(--v-text-secondary)]">ارفع ملف Excel (.xlsx) أو CSV (.csv) — الحد الأقصى 5MB.</p>
            <input
              type="file"
              accept=".xlsx,.csv"
              disabled={busy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileChange(file);
              }}
              className="block w-full text-sm text-[var(--v-text-secondary)] file:mr-3 file:rounded-[var(--v-radius-md)] file:border-0 file:bg-[var(--v-primary-tint)] file:px-3 file:py-2 file:text-[var(--v-primary)]"
            />
            <div className="flex justify-end">
              <Button variant="ghost" onClick={onClose}>إلغاء</Button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <p className="text-sm text-[var(--v-text-secondary)]">اعرض أول 10 صفوف وحدّد لكل عمود الحقل المطابق في قاعدة الاستهداف.</p>

            <div className="overflow-x-auto rounded-[var(--v-radius-md)] border border-[var(--v-border)]">
              <table className="w-full min-w-[600px] text-xs">
                <thead className="bg-[var(--v-surface)]">
                  <tr>
                    {headers.map((h) => (
                      <th key={h} className="px-2 py-2 text-start font-medium text-[var(--v-text-muted)]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 10).map((row, i) => (
                    <tr key={i} className="border-t border-[var(--v-border)]">
                      {headers.map((h) => (
                        <td key={h} className="px-2 py-1.5 text-[var(--v-text-secondary)]">{String(row[h] ?? "")}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {headers.map((h) => (
                <div key={h} className="flex items-center gap-2">
                  <span className="w-32 shrink-0 truncate text-xs text-[var(--v-text-secondary)]" title={h}>{h}</span>
                  <Select
                    value={headerToField[h] ?? ""}
                    onChange={(e) => setHeaderToField((prev) => ({ ...prev, [h]: e.target.value }))}
                  >
                    <option value="">— تجاهل —</option>
                    {MAPPABLE_FIELDS.map((f) => (
                      <option key={f.value} value={f.value}>{f.label}</option>
                    ))}
                  </Select>
                </div>
              ))}
            </div>

            <div className="flex justify-between gap-2">
              <Button variant="ghost" onClick={() => setStep(1)}>رجوع</Button>
              <Button variant="primary" loading={busy} onClick={handleGoToStep3}>متابعة</Button>
            </div>
          </div>
        )}

        {step === 3 && summary && (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2 text-center sm:grid-cols-6">
              <SummaryTile label="إجمالي" value={summary.total} />
              <SummaryTile label="صالح" value={summary.counts.valid ?? 0} />
              <SummaryTile label="مكرر محتمل" value={summary.counts.duplicatePotential ?? 0} />
              <SummaryTile label="رقم غير صالح" value={summary.counts.invalidPhone ?? 0} />
              <SummaryTile label="بلا اسم" value={summary.counts.missingName ?? 0} />
              <SummaryTile label="بلا وسيلة تواصل" value={summary.counts.missingContact ?? 0} />
            </div>
            {(summary.counts.needsReview ?? 0) > 0 && (
              <p className="text-xs text-[var(--v-amber)]">{summary.counts.needsReview} صف يحتاج مراجعة (بلا قطاع ولا محافظة).</p>
            )}

            {questionableRowIndices.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-semibold text-[var(--v-text)]">صفوف تحتاج قرارك:</p>
                <div className="max-h-64 space-y-1.5 overflow-y-auto rounded-[var(--v-radius-md)] border border-[var(--v-border)] p-2">
                  {questionableRowIndices.map((idx) => {
                    const cat = rowCategory.get(idx)!;
                    const nameHeader = columnMapping.organization_name;
                    const name = nameHeader ? String(rows[idx][nameHeader] ?? "") : "";
                    return (
                      <div key={idx} className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--v-radius-sm)] border border-[var(--v-border)] px-2 py-1.5 text-xs">
                        <div>
                          <span className="font-medium text-[var(--v-text)]">{name || `صف ${idx + 1}`}</span>
                          <span className="ms-2 text-[var(--v-text-muted)]">
                            {cat === "duplicatePotential" ? "هذا الصف مكرر محتمل بسبب تطابق رقم الهاتف." : CATEGORY_LABELS[cat]}
                          </span>
                        </div>
                        <select
                          value={rowAction.get(idx) ?? "skip_invalid"}
                          onChange={(e) => toggleRowAction(idx, e.target.value as ImportRowInput["action"])}
                          className="rounded-[var(--v-radius-sm)] border border-[var(--v-border)] bg-[var(--v-bg)] px-1.5 py-1 text-[11px]"
                        >
                          <option value="import">استيراد</option>
                          <option value="skip_duplicate">تجاهل (مكرر)</option>
                          <option value="skip_invalid">تجاهل (غير صالح)</option>
                        </select>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex justify-between gap-2">
              <Button variant="ghost" onClick={() => setStep(2)}>رجوع</Button>
              <Button variant="primary" loading={busy} onClick={handleConfirmImport}>تأكيد الاستيراد</Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

function SummaryTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[var(--v-radius-md)] border border-[var(--v-border)] p-2">
      <p className="text-sm font-bold tabular-nums text-[var(--v-text)]">{value}</p>
      <p className="text-[10px] text-[var(--v-text-muted)]">{label}</p>
    </div>
  );
}
