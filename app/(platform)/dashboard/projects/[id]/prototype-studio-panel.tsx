"use client";

/**
 * Prototype Studio Panel (Phase A)
 * ================================
 * 5-step stepper — Phase A implements Config + Design Direction + Context Pack.
 * Discuss/Build tabs show "coming in Phase B" placeholder.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import Textarea from "@/components/ui/Textarea";
import Badge from "@/components/ui/Badge";
import PrintButton from "@/components/ui/PrintButton";
import { toast } from "@/components/ui/Toaster";
import { downloadMarkdown, copyToClipboard } from "@/lib/prototype-studio/export";
import {
  saveStudioConfigAction, generateContextPackAction,
} from "./prototype-studio-actions";
import {
  DEFAULT_DESIGN_DIRECTION,
  PROTOTYPE_TYPES, PROTOTYPE_PLATFORMS, PROTOTYPE_FIDELITIES,
  PROTOTYPE_BACKEND_REQUIREMENTS, PROTOTYPE_DATA_STRATEGIES, UI_DENSITIES,
  type PrototypeStudioArtifactRow, type PrototypeStudioConfigRow,
  type DesignReference, type DesignDirection,
  type PrototypeType, type Platform, type Fidelity,
  type BackendRequirement, type DataStrategy, type UiDensity,
} from "@/lib/prototype-studio/types";

const STEPS = [
  { key: "config", label: "1) الإعداد" },
  { key: "scope", label: "2) النطاق" },
  { key: "design", label: "3) الاتجاه البصري" },
  { key: "discuss", label: "4) نقاش ChatGPT" },
  { key: "build", label: "5) بناء Codex" },
] as const;
type StepKey = (typeof STEPS)[number]["key"];

interface Props {
  projectId: string;
  projectName: string;
  initialConfig: PrototypeStudioConfigRow;
  latestContextPack: PrototypeStudioArtifactRow | null;
}

export default function PrototypeStudioPanel(props: Props) {
  const router = useRouter();
  const [step, setStep] = useState<StepKey>("config");
  const [cfg, setCfg] = useState<PrototypeStudioConfigRow>(props.initialConfig);
  const [pack, setPack] = useState<PrototypeStudioArtifactRow | null>(props.latestContextPack);
  const [missing, setMissing] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();

  function updateCfg<K extends keyof PrototypeStudioConfigRow>(k: K, v: PrototypeStudioConfigRow[K]) {
    setCfg((c) => ({ ...c, [k]: v }));
  }

  async function save() {
    const patch = {
      prototypeType: cfg.prototypeType,
      prototypeGoal: cfg.prototypeGoal,
      primaryPersonas: cfg.primaryPersonas,
      coreFlows: cfg.coreFlows,
      platform: cfg.platform,
      fidelity: cfg.fidelity,
      language: cfg.language,
      isRtl: cfg.isRtl,
      backendRequirement: cfg.backendRequirement,
      dataStrategy: cfg.dataStrategy,
      inScopeItems: cfg.inScopeItems,
      outOfScopeItems: cfg.outOfScopeItems,
      designDirection: cfg.designDirection,
      designReferences: cfg.designReferences,
    };
    startTransition(async () => {
      const res = await saveStudioConfigAction(props.projectId, patch);
      if (res.ok) { toast.success("تم الحفظ"); router.refresh(); }
      else toast.error(res.message);
    });
  }

  async function generatePack() {
    startTransition(async () => {
      const res = await generateContextPackAction(props.projectId);
      if (res.ok && res.data) {
        setMissing(res.data.missing);
        toast.success(`تم توليد Context Pack v${res.data.version}`);
        router.refresh();
      } else if (!res.ok) toast.error(res.message);
    });
  }

  return (
    <div className="flex flex-col gap-[var(--v-space-6)]">
      <header className="rounded-xl border border-[var(--v-border)] bg-[var(--v-surface)] p-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold">Prototype Studio</h2>
            <p className="text-xs text-[var(--v-text-secondary)]">
              خمس خطوات: إعداد → نطاق → اتجاه بصري → نقاش ChatGPT → بناء Codex. لا استدعاءات AI. الرفع لـ ChatGPT/Codex يدوي.
            </p>
          </div>
          <Badge>Studio · بدون AI</Badge>
        </div>
        <nav className="mt-4 flex flex-wrap gap-2">
          {STEPS.map((s) => (
            <button key={s.key} type="button" onClick={() => setStep(s.key)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                step === s.key
                  ? "bg-[var(--v-primary)] text-white"
                  : "bg-[var(--v-surface-2)] text-[var(--v-text-secondary)] hover:text-[var(--v-text)]"
              }`}>
              {s.label}
            </button>
          ))}
        </nav>
      </header>

      {step === "config" && <ConfigForm cfg={cfg} updateCfg={updateCfg} onSave={save} pending={pending} />}
      {step === "scope" && <ScopeForm cfg={cfg} updateCfg={updateCfg} onSave={save} pending={pending} />}
      {step === "design" && <DesignForm cfg={cfg} updateCfg={updateCfg} onSave={save} pending={pending} />}
      {step === "discuss" && (
        <ContextPackViewer
          projectName={props.projectName}
          pack={pack} setPack={setPack} missing={missing}
          onGenerate={generatePack} pending={pending}
        />
      )}
      {step === "build" && (
        <Placeholder text="خطوة «بناء Codex» ستُفعّل في Phase B — بعد اعتماد Build Brief من ChatGPT." />
      )}
    </div>
  );
}

function Placeholder({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-[var(--v-border)] bg-[var(--v-surface)] p-8 text-center text-sm text-[var(--v-text-secondary)]">
      {text}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Config Form (Step 1)
// ---------------------------------------------------------------------------
interface FormProps {
  cfg: PrototypeStudioConfigRow;
  updateCfg: <K extends keyof PrototypeStudioConfigRow>(k: K, v: PrototypeStudioConfigRow[K]) => void;
  onSave: () => void;
  pending: boolean;
}

function ConfigForm({ cfg, updateCfg, onSave, pending }: FormProps) {
  return (
    <section className="rounded-xl border border-[var(--v-border)] bg-[var(--v-surface)] p-4 flex flex-col gap-4">
      <h3 className="font-bold">إعدادات النموذج</h3>

      <SelectField label="نوع النموذج" value={cfg.prototypeType}
        options={PROTOTYPE_TYPES}
        onChange={(v) => updateCfg("prototypeType", v as PrototypeType)}
        hint="clickable = نموذج قابل للنقر بدون منطق. functional = منطق أساسي. poc = إثبات مفهوم تقني." />

      <Textarea label="هدف النموذج" value={cfg.prototypeGoal}
        onChange={(e) => updateCfg("prototypeGoal", e.target.value)}
        helperText="ما الذي نريد أن يتحقق من هذا النموذج؟ (مثال: اختبار قابلية استخدام تدفّق التسجيل)" />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <SelectField label="المنصّة" value={cfg.platform} options={PROTOTYPE_PLATFORMS}
          onChange={(v) => updateCfg("platform", v as Platform)} />
        <SelectField label="مستوى الدقّة" value={cfg.fidelity} options={PROTOTYPE_FIDELITIES}
          onChange={(v) => updateCfg("fidelity", v as Fidelity)} />
        <SelectField label="متطلّبات الـ Backend" value={cfg.backendRequirement}
          options={PROTOTYPE_BACKEND_REQUIREMENTS}
          onChange={(v) => updateCfg("backendRequirement", v as BackendRequirement)} />
        <SelectField label="استراتيجية البيانات" value={cfg.dataStrategy}
          options={PROTOTYPE_DATA_STRATEGIES}
          onChange={(v) => updateCfg("dataStrategy", v as DataStrategy)} />
      </div>

      <ListField label="Personas أساسية" items={cfg.primaryPersonas}
        onChange={(v) => updateCfg("primaryPersonas", v)} placeholder="اسم الـ persona" />
      <ListField label="Core flows" items={cfg.coreFlows}
        onChange={(v) => updateCfg("coreFlows", v)} placeholder="اسم/وصف الـ flow" />

      <SaveBar onSave={onSave} pending={pending} />
    </section>
  );
}

// ---------------------------------------------------------------------------
// Scope Form (Step 2)
// ---------------------------------------------------------------------------
function ScopeForm({ cfg, updateCfg, onSave, pending }: FormProps) {
  return (
    <section className="rounded-xl border border-[var(--v-border)] bg-[var(--v-surface)] p-4 flex flex-col gap-4">
      <h3 className="font-bold">تحديد النطاق</h3>
      <ListField label="داخل النطاق (In-Scope)" items={cfg.inScopeItems}
        onChange={(v) => updateCfg("inScopeItems", v)} placeholder="ميزة داخل النطاق" />
      <ListField label="خارج النطاق (Out-of-Scope)" items={cfg.outOfScopeItems}
        onChange={(v) => updateCfg("outOfScopeItems", v)} placeholder="ميزة خارج النطاق" />
      <SaveBar onSave={onSave} pending={pending} />
    </section>
  );
}

// ---------------------------------------------------------------------------
// Design Direction Form (Step 3)
// ---------------------------------------------------------------------------
function DesignForm({ cfg, updateCfg, onSave, pending }: FormProps) {
  const dd = cfg.designDirection ?? DEFAULT_DESIGN_DIRECTION;
  const setDd = (patch: Partial<DesignDirection>) =>
    updateCfg("designDirection", { ...dd, ...patch });

  return (
    <section className="rounded-xl border border-[var(--v-border)] bg-[var(--v-surface)] p-4 flex flex-col gap-4">
      <h3 className="font-bold">الاتجاه البصري</h3>
      {cfg.designReferences.length === 0 && (
        <div className="rounded-lg border border-yellow-500/40 bg-yellow-500/10 p-3 text-xs">
          لم يتم تحديد مرجع بصري بعد؛ جودة الاتجاه البصري قد تستفيد من إضافة مراجع.
        </div>
      )}

      <Textarea label="الأسلوب البصري" value={dd.visual_style}
        onChange={(e) => setDd({ visual_style: e.target.value })} />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <SelectField label="كثافة الواجهة" value={dd.ui_density}
          options={UI_DENSITIES} onChange={(v) => setDd({ ui_density: v as UiDensity })} />
        <TextField label="التخطيط المفضّل" value={dd.layout_preference}
          onChange={(v) => setDd({ layout_preference: v })} />
        <TextField label="أسلوب التنقّل" value={dd.navigation_preference}
          onChange={(v) => setDd({ navigation_preference: v })} />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <TextField label="خطّ العناوين" value={dd.typography.heading}
          onChange={(v) => setDd({ typography: { ...dd.typography, heading: v } })} />
        <TextField label="خطّ النص" value={dd.typography.body}
          onChange={(v) => setDd({ typography: { ...dd.typography, body: v } })} />
        <TextField label="مقاسات الخط" value={dd.typography.sizes}
          onChange={(v) => setDd({ typography: { ...dd.typography, sizes: v } })} />
      </div>

      <Textarea label="ملاحظات إمكانية الوصول (a11y)" value={dd.accessibility_notes}
        onChange={(e) => setDd({ accessibility_notes: e.target.value })} />

      <ColorsEditor colors={dd.brand_colors}
        onChange={(brand_colors) => setDd({ brand_colors })} />

      <ReferencesEditor refs={cfg.designReferences}
        onChange={(v) => updateCfg("designReferences", v)} />

      <SaveBar onSave={onSave} pending={pending} />
    </section>
  );
}

// ---------------------------------------------------------------------------
// Context Pack Viewer (Step 4 read-only in Phase A)
// ---------------------------------------------------------------------------
interface ContextPackProps {
  projectName: string;
  pack: PrototypeStudioArtifactRow | null;
  setPack: (p: PrototypeStudioArtifactRow | null) => void;
  missing: string[];
  onGenerate: () => void;
  pending: boolean;
}
function ContextPackViewer({ projectName, pack, missing, onGenerate, pending }: ContextPackProps) {
  const content = pack?.contentMd ?? "";
  return (
    <section className="rounded-xl border border-[var(--v-border)] bg-[var(--v-surface)] p-4 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="font-bold">Context Pack</h3>
        <div className="flex gap-2 items-center">
          {pack && <Badge>v{pack.version} · {pack.status}</Badge>}
          <Button variant="primary" size="sm" onClick={onGenerate} disabled={pending}>
            توليد Context Pack
          </Button>
        </div>
      </div>

      {missing.length > 0 && (
        <div className="rounded-lg border border-yellow-500/40 bg-yellow-500/10 p-3 text-xs">
          <div className="font-bold mb-1">معلومات ناقصة (ستظهر في المخرج كـ [معلومات ناقصة]):</div>
          <ul className="list-disc pr-4">
            {missing.map((m) => <li key={m}>{m}</li>)}
          </ul>
        </div>
      )}

      {!content ? (
        <div className="rounded-lg border border-dashed border-[var(--v-border)] p-6 text-center text-sm text-[var(--v-text-secondary)]">
          لم يتم توليد Context Pack بعد. اضغط «توليد Context Pack» ليتم تجميعه من مصادر NEXVORA.
        </div>
      ) : (
        <>
          <pre className="prototype-studio-context max-h-[500px] overflow-auto rounded-lg border border-[var(--v-border)] bg-[var(--v-surface-2)] p-3 text-xs whitespace-pre-wrap">
            {content}
          </pre>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={async () => {
              const ok = await copyToClipboard(content);
              if (ok) toast.success("تم النسخ"); else toast.error("تعذّر النسخ");
            }}>نسخ الـ Prompt</Button>
            <Button size="sm" variant="secondary" onClick={() =>
              downloadMarkdown(`context-pack-${projectName}-v${pack?.version ?? 0}.md`, content)
            }>تحميل Markdown</Button>
            <PrintButton />
            <a href="https://chatgpt.com" target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg bg-[var(--v-primary)] px-4 py-2 text-sm font-bold text-white">
              فتح ChatGPT (رفع يدوي)
            </a>
          </div>
          <p className="text-xs text-[var(--v-text-secondary)]">
            الحمولة تُرفع يدويًا داخل ChatGPT. لا يوجد أي استدعاء AI أو API من هنا.
          </p>
        </>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Small primitives
// ---------------------------------------------------------------------------
function SaveBar({ onSave, pending }: { onSave: () => void; pending: boolean }) {
  return (
    <div className="flex justify-end pt-2 border-t border-[var(--v-border)]">
      <Button variant="primary" onClick={onSave} disabled={pending}>حفظ الإعدادات</Button>
    </div>
  );
}

function SelectField({ label, value, options, onChange, hint }: {
  label: string; value: string; options: readonly string[];
  onChange: (v: string) => void; hint?: string;
}) {
  return (
    <div className="w-full">
      <label className="mb-1.5 block text-xs font-medium text-[var(--v-text-secondary)]">{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="h-10 w-full rounded-lg border border-[var(--v-border)] bg-[var(--v-surface)] px-3 text-sm">
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
      {hint && <p className="mt-1 text-[11px] text-[var(--v-text-secondary)]">{hint}</p>}
    </div>
  );
}

function TextField({ label, value, onChange }: {
  label: string; value: string; onChange: (v: string) => void;
}) {
  return (
    <div className="w-full">
      <label className="mb-1.5 block text-xs font-medium text-[var(--v-text-secondary)]">{label}</label>
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)}
        className="h-10 w-full rounded-lg border border-[var(--v-border)] bg-[var(--v-surface)] px-3 text-sm" />
    </div>
  );
}

function ListField({ label, items, onChange, placeholder }: {
  label: string; items: string[]; onChange: (v: string[]) => void; placeholder?: string;
}) {
  const [draft, setDraft] = useState("");
  return (
    <div className="w-full">
      <label className="mb-1.5 block text-xs font-medium text-[var(--v-text-secondary)]">{label}</label>
      <div className="flex gap-2 mb-2">
        <input type="text" value={draft} onChange={(e) => setDraft(e.target.value)}
          placeholder={placeholder}
          className="h-9 flex-1 rounded-lg border border-[var(--v-border)] bg-[var(--v-surface)] px-3 text-sm" />
        <Button size="sm" variant="secondary" onClick={() => {
          const v = draft.trim();
          if (!v) return;
          onChange([...items, v]); setDraft("");
        }}>إضافة</Button>
      </div>
      {items.length > 0 && (
        <ul className="flex flex-col gap-1">
          {items.map((it, i) => (
            <li key={`${it}-${i}`} className="flex items-center justify-between rounded-lg bg-[var(--v-surface-2)] px-3 py-1.5 text-sm">
              <span>{it}</span>
              <button type="button" onClick={() => onChange(items.filter((_, j) => j !== i))}
                className="text-xs text-[var(--v-red)]">حذف</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ColorsEditor({ colors, onChange }: {
  colors: { name: string; hex: string }[];
  onChange: (v: { name: string; hex: string }[]) => void;
}) {
  const [name, setName] = useState("");
  const [hex, setHex] = useState("#");
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-[var(--v-text-secondary)]">ألوان العلامة</label>
      <div className="flex gap-2 mb-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="الاسم"
          className="h-9 flex-1 rounded-lg border border-[var(--v-border)] bg-[var(--v-surface)] px-3 text-sm" />
        <input value={hex} onChange={(e) => setHex(e.target.value)} placeholder="#RRGGBB"
          className="h-9 w-32 rounded-lg border border-[var(--v-border)] bg-[var(--v-surface)] px-3 text-sm font-mono" />
        <Button size="sm" variant="secondary" onClick={() => {
          if (!name.trim() || !hex.trim()) return;
          onChange([...colors, { name: name.trim(), hex: hex.trim() }]);
          setName(""); setHex("#");
        }}>إضافة</Button>
      </div>
      {colors.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {colors.map((c, i) => (
            <li key={i} className="flex items-center gap-2 rounded-lg bg-[var(--v-surface-2)] px-2 py-1 text-xs">
              <span className="inline-block h-4 w-4 rounded" style={{ backgroundColor: c.hex }} />
              {c.name} · {c.hex}
              <button type="button" onClick={() => onChange(colors.filter((_, j) => j !== i))}
                className="text-[var(--v-red)]">×</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ReferencesEditor({ refs, onChange }: {
  refs: DesignReference[]; onChange: (v: DesignReference[]) => void;
}) {
  const [draft, setDraft] = useState<DesignReference>({ url: "", screenshot_url: null, liked: "", avoid: "", notes: "" });
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-[var(--v-text-secondary)]">مراجع بصرية</label>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2 mb-2">
        <input value={draft.url} onChange={(e) => setDraft({ ...draft, url: e.target.value })} placeholder="URL"
          className="h-9 rounded-lg border border-[var(--v-border)] bg-[var(--v-surface)] px-3 text-sm" />
        <input value={draft.liked} onChange={(e) => setDraft({ ...draft, liked: e.target.value })} placeholder="ما نستفيد منه"
          className="h-9 rounded-lg border border-[var(--v-border)] bg-[var(--v-surface)] px-3 text-sm" />
        <input value={draft.avoid} onChange={(e) => setDraft({ ...draft, avoid: e.target.value })} placeholder="ما نتجنّبه"
          className="h-9 rounded-lg border border-[var(--v-border)] bg-[var(--v-surface)] px-3 text-sm" />
        <input value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} placeholder="ملاحظات"
          className="h-9 rounded-lg border border-[var(--v-border)] bg-[var(--v-surface)] px-3 text-sm" />
      </div>
      <Button size="sm" variant="secondary" onClick={() => {
        if (!draft.url.trim()) { toast.error("URL مطلوب"); return; }
        onChange([...refs, draft]);
        setDraft({ url: "", screenshot_url: null, liked: "", avoid: "", notes: "" });
      }}>إضافة مرجع</Button>
      {refs.length > 0 && (
        <ul className="flex flex-col gap-2 mt-2">
          {refs.map((r, i) => (
            <li key={i} className="rounded-lg bg-[var(--v-surface-2)] p-2 text-xs flex justify-between gap-3">
              <div>
                <div className="font-mono">{r.url}</div>
                {r.liked && <div>نستفيد: {r.liked}</div>}
                {r.avoid && <div>نتجنّب: {r.avoid}</div>}
                {r.notes && <div>ملاحظات: {r.notes}</div>}
              </div>
              <button type="button" onClick={() => onChange(refs.filter((_, j) => j !== i))}
                className="text-[var(--v-red)] self-start">حذف</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
