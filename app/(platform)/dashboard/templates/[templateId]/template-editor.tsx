"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, GripVertical, Pencil, Trash2, Check, X } from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import Input from "@/components/ui/Input";
import Badge from "@/components/ui/Badge";
import { toast } from "@/components/ui/Toaster";
import { QUESTION_TYPES, getQuestionTypeMeta, questionTypeLabel } from "@/lib/discovery-templates/field-types";
import {
  updateTemplate,
  createQuestion,
  updateQuestion,
  deleteQuestion,
  reorderQuestions,
  type QuestionInput,
} from "../actions";
import type {
  DiscoveryFormTemplate,
  DiscoveryQuestion,
  DiscoveryQuestionType,
} from "@/lib/types/database";

const inputClass =
  "w-full rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-bg)] px-3 py-2 text-sm text-[var(--v-text)] outline-none focus:border-[var(--v-primary)]";

export default function TemplateEditor({
  template,
  initialQuestions,
  isAdmin,
}: {
  template: DiscoveryFormTemplate;
  initialQuestions: DiscoveryQuestion[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [questions, setQuestions] = useState<DiscoveryQuestion[]>(initialQuestions);
  const [editingMeta, setEditingMeta] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<DiscoveryQuestion | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  // ---- تعديل بيانات القالب ----
  const [metaName, setMetaName] = useState(template.name);
  const [metaIndustry, setMetaIndustry] = useState(template.industry ?? "");
  const [metaDesc, setMetaDesc] = useState(template.description ?? "");
  const [savingMeta, setSavingMeta] = useState(false);

  async function saveMeta() {
    setSavingMeta(true);
    const result = await updateTemplate(template.id, {
      name: metaName,
      industry: metaIndustry,
      description: metaDesc,
    });
    setSavingMeta(false);
    if (!result.ok) {
      toast.error(result.message ?? "فشل الحفظ.");
      return;
    }
    toast.success("تم حفظ بيانات القالب");
    setEditingMeta(false);
    router.refresh();
  }

  // ---- حذف سؤال ----
  async function handleDelete(q: DiscoveryQuestion) {
    if (!window.confirm(`حذف السؤال «${q.question}»؟`)) return;
    const result = await deleteQuestion(template.id, q.id);
    if (!result.ok) {
      toast.error(result.message ?? "فشل الحذف.");
      return;
    }
    setQuestions((prev) => prev.filter((x) => x.id !== q.id));
    toast.success("تم حذف السؤال");
  }

  function handleSavedQuestion(saved: DiscoveryQuestion, isNew: boolean) {
    setQuestions((prev) =>
      isNew ? [...prev, saved] : prev.map((x) => (x.id === saved.id ? saved : x))
    );
    setFormOpen(false);
  }

  // ---- إعادة الترتيب بالسحب ----
  function onDrop(targetIndex: number) {
    if (dragIndex === null || dragIndex === targetIndex) {
      setDragIndex(null);
      return;
    }
    const reordered = [...questions];
    const [moved] = reordered.splice(dragIndex, 1);
    reordered.splice(targetIndex, 0, moved);
    setQuestions(reordered);
    setDragIndex(null);
    persistOrder(reordered.map((q) => q.id));
  }

  async function persistOrder(ids: string[]) {
    const result = await reorderQuestions(template.id, ids);
    if (!result.ok) {
      toast.error(result.message ?? "فشل حفظ الترتيب.");
      router.refresh();
    }
  }

  function openNew() {
    setEditingQuestion(null);
    setFormOpen(true);
  }
  function openEdit(q: DiscoveryQuestion) {
    setEditingQuestion(q);
    setFormOpen(true);
  }

  return (
    <div>
      {/* رأس القالب */}
      <Card padding="md" className="mb-5">
        {editingMeta ? (
          <div className="space-y-3">
            <Input label="اسم القالب" value={metaName} onChange={(e) => setMetaName(e.target.value)} />
            <Input
              label="المجال"
              value={metaIndustry}
              onChange={(e) => setMetaIndustry(e.target.value)}
            />
            <div>
              <label className="mb-1 block text-xs text-[var(--v-text-muted)]">الوصف</label>
              <textarea
                value={metaDesc}
                onChange={(e) => setMetaDesc(e.target.value)}
                rows={2}
                className={inputClass}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setEditingMeta(false)}>
                إلغاء
              </Button>
              <Button variant="primary" loading={savingMeta} onClick={saveMeta}>
                حفظ
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="font-display text-h2 text-[var(--v-text)]">{template.name}</h1>
              {template.industry && (
                <p className="text-xs text-[var(--v-text-subtle)]">{template.industry}</p>
              )}
              {template.description && (
                <p className="mt-1 text-sm text-[var(--v-text-secondary)]">{template.description}</p>
              )}
              <div className="mt-2 flex items-center gap-2">
                <Badge tone={template.status === "active" ? "success" : "neutral"}>
                  {template.status === "active" ? "مفعّل" : "معطّل"}
                </Badge>
                {template.is_default && <Badge tone="info">افتراضي</Badge>}
                <span className="font-mono-plex text-[11px] text-[var(--v-text-subtle)]">
                  {questions.length} سؤال
                </span>
              </div>
            </div>
            {isAdmin && (
              <Button variant="outline" size="sm" icon={<Pencil size={13} />} onClick={() => setEditingMeta(true)}>
                تعديل
              </Button>
            )}
          </div>
        )}
      </Card>

      {/* شريط الإضافة */}
      {isAdmin && (
        <div className="mb-3 flex justify-end">
          <Button variant="primary" icon={<Plus size={15} />} onClick={openNew}>
            إضافة سؤال
          </Button>
        </div>
      )}

      {/* قائمة الأسئلة */}
      {questions.length === 0 ? (
        <Card padding="lg">
          <p className="text-center text-sm text-[var(--v-text-muted)]">لا توجد أسئلة بعد.</p>
        </Card>
      ) : (
        <div className="space-y-1.5">
          {questions.map((q, index) => {
            const cat = q.category?.trim() || "بدون تصنيف";
            const prevCat =
              index > 0 ? questions[index - 1].category?.trim() || "بدون تصنيف" : null;
            const showCat = cat !== prevCat;
            return (
              <div key={q.id}>
                {showCat && (
                  <p className="mb-1 mt-3 px-1 text-[11px] font-semibold text-[var(--v-text-subtle)]">
                    {cat}
                  </p>
                )}
                <div
                  draggable={isAdmin}
                  onDragStart={() => setDragIndex(index)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => onDrop(index)}
                  className={`flex items-center gap-2 rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-bg)] px-3 py-2 ${
                    dragIndex === index ? "opacity-50" : ""
                  } ${isAdmin ? "cursor-grab active:cursor-grabbing" : ""}`}
                >
                  {isAdmin && (
                    <GripVertical size={15} className="shrink-0 text-[var(--v-text-subtle)]" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-[var(--v-text)]">
                      {q.question}
                      {q.required && <span className="text-[var(--v-red)]"> *</span>}
                    </p>
                    <p className="text-[11px] text-[var(--v-text-subtle)]">
                      {questionTypeLabel(q.type)}
                      {q.conditional && (
                        <span className="ml-1.5 rounded-full bg-[var(--v-amber)]/15 px-1.5 py-0.5 text-[10px] text-[var(--v-amber)]">
                          شرطي
                        </span>
                      )}
                    </p>
                  </div>
                  {isAdmin && (
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => openEdit(q)}
                        className="rounded-[var(--v-radius-md)] p-1.5 text-[var(--v-text-muted)] hover:text-[var(--v-primary)]"
                        aria-label="تعديل"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(q)}
                        className="rounded-[var(--v-radius-md)] p-1.5 text-[var(--v-text-muted)] hover:text-[var(--v-red)]"
                        aria-label="حذف"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {formOpen && (
        <QuestionFormModal
          templateId={template.id}
          question={editingQuestion}
          nextOrder={questions.length + 1}
          onClose={() => setFormOpen(false)}
          onSaved={handleSavedQuestion}
        />
      )}
    </div>
  );
}

// ============================================================
// نموذج إضافة/تعديل سؤال
// ============================================================

function QuestionFormModal({
  templateId,
  question,
  nextOrder,
  onClose,
  onSaved,
}: {
  templateId: string;
  question: DiscoveryQuestion | null;
  nextOrder: number;
  onClose: () => void;
  onSaved: (saved: DiscoveryQuestion, isNew: boolean) => void;
}) {
  const [text, setText] = useState(question?.question ?? "");
  const [description, setDescription] = useState(question?.description ?? "");
  const [type, setType] = useState<DiscoveryQuestionType>(question?.type ?? "short_text");
  const [category, setCategory] = useState(question?.category ?? "");
  const [required, setRequired] = useState(question?.required ?? false);
  const [placeholder, setPlaceholder] = useState(question?.placeholder ?? "");
  const [helpText, setHelpText] = useState(question?.help_text ?? "");
  const [optionsText, setOptionsText] = useState((question?.options ?? []).join("\n"));
  const [aiWeight, setAiWeight] = useState(String(question?.ai_weight ?? 1));
  const [maxLength, setMaxLength] = useState(
    question?.validation?.maxLength ? String(question.validation.maxLength) : ""
  );
  const [allowedTypes, setAllowedTypes] = useState(
    (question?.validation?.allowedFileTypes ?? []).join(", ")
  );
  const [maxFileMb, setMaxFileMb] = useState(
    question?.validation?.maxFileSizeMb ? String(question.validation.maxFileSizeMb) : ""
  );
  const [saving, setSaving] = useState(false);

  const meta = getQuestionTypeMeta(type);
  const isText = type === "short_text" || type === "long_text";

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) {
      toast.error("نص السؤال مطلوب.");
      return;
    }

    const validation: QuestionInput["validation"] = {};
    if (isText && maxLength.trim()) validation.maxLength = Number(maxLength);
    if (meta.isUpload) {
      const types = allowedTypes
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
      if (types.length) validation.allowedFileTypes = types;
      if (maxFileMb.trim()) validation.maxFileSizeMb = Number(maxFileMb);
    }

    const input: QuestionInput = {
      question: text,
      description: description || null,
      type,
      required,
      placeholder: placeholder || null,
      help_text: helpText || null,
      category: category || null,
      ai_weight: Number(aiWeight) || 1,
      options: meta.hasOptions
        ? optionsText.split("\n").map((s) => s.trim()).filter(Boolean)
        : [],
      validation,
    };

    setSaving(true);
    const result = question
      ? await updateQuestion(templateId, question.id, input)
      : await createQuestion(templateId, input);
    setSaving(false);

    if (!result.ok) {
      toast.error(result.message ?? "فشل الحفظ.");
      return;
    }

    const saved: DiscoveryQuestion = {
      id: question?.id ?? result.id ?? crypto.randomUUID(),
      template_id: templateId,
      question: input.question,
      description: input.description ?? null,
      type: input.type,
      required: input.required ?? false,
      placeholder: input.placeholder ?? null,
      options: input.options ?? [],
      help_text: input.help_text ?? null,
      sort_order: question?.sort_order ?? nextOrder,
      ai_weight: input.ai_weight ?? 1,
      category: input.category ?? null,
      validation: input.validation ?? {},
      conditional: question?.conditional ?? null,
      created_at: question?.created_at ?? new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    toast.success(question ? "تم تعديل السؤال" : "تمت إضافة السؤال");
    onSaved(saved, !question);
  }

  return (
    <Modal open onClose={onClose} maxWidth="max-w-lg">
      <form onSubmit={handleSave} className="max-h-[75vh] space-y-3 overflow-y-auto pl-1">
        <p className="text-sm font-semibold text-[var(--v-text)]">
          {question ? "تعديل سؤال" : "سؤال جديد"}
        </p>

        <div>
          <label className="mb-1 block text-xs text-[var(--v-text-muted)]">نص السؤال *</label>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} className={inputClass} />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs text-[var(--v-text-muted)]">النوع</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as DiscoveryQuestionType)}
              className={inputClass}
            >
              {QUESTION_TYPES.map((t) => (
                <option key={t.type} value={t.type}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <Input
            label="التصنيف (خطوة)"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="مثلاً: عن نشاطك"
          />
        </div>

        <Input
          label="وصف مختصر (اختياري)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />

        {meta.hasOptions && (
          <div>
            <label className="mb-1 block text-xs text-[var(--v-text-muted)]">
              الخيارات (خيار في كل سطر)
            </label>
            <textarea
              value={optionsText}
              onChange={(e) => setOptionsText(e.target.value)}
              rows={3}
              className={inputClass}
              placeholder={"الخيار الأول\nالخيار الثاني"}
            />
          </div>
        )}

        {!meta.isUpload && !meta.hasOptions && type !== "yes_no" && type !== "rating" && (
          <Input
            label="نص إرشادي (Placeholder)"
            value={placeholder}
            onChange={(e) => setPlaceholder(e.target.value)}
          />
        )}

        <Input
          label="نص مساعدة أسفل السؤال (اختياري)"
          value={helpText}
          onChange={(e) => setHelpText(e.target.value)}
        />

        {isText && (
          <Input
            label="الحد الأقصى لعدد الحروف (اختياري)"
            type="number"
            value={maxLength}
            onChange={(e) => setMaxLength(e.target.value)}
          />
        )}

        {meta.isUpload && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input
              label="الامتدادات المسموحة"
              value={allowedTypes}
              onChange={(e) => setAllowedTypes(e.target.value)}
              placeholder="pdf, png, docx"
            />
            <Input
              label="أقصى حجم (ميجا)"
              type="number"
              value={maxFileMb}
              onChange={(e) => setMaxFileMb(e.target.value)}
            />
          </div>
        )}

        <div className="grid grid-cols-1 items-center gap-3 sm:grid-cols-2">
          <label className="flex items-center gap-2 text-sm text-[var(--v-text)]">
            <input
              type="checkbox"
              checked={required}
              onChange={(e) => setRequired(e.target.checked)}
              className="h-4 w-4 accent-[var(--v-primary)]"
            />
            سؤال مطلوب
          </label>
          <Input
            label="وزن الـ AI"
            type="number"
            step="0.1"
            value={aiWeight}
            onChange={(e) => setAiWeight(e.target.value)}
          />
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" icon={<X size={14} />} onClick={onClose}>
            إلغاء
          </Button>
          <Button type="submit" variant="primary" icon={<Check size={14} />} loading={saving}>
            حفظ
          </Button>
        </div>
      </form>
    </Modal>
  );
}
