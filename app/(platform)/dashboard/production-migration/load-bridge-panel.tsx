"use client";

import { useState, useEffect, useTransition, useCallback } from "react";
import { Download, Database, Plug, Trash2, CheckCircle2, PackageCheck, AlertTriangle } from "lucide-react";
import Badge, { type BadgeTone } from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import type { LoadBridgeState } from "@/lib/load-bridge/dashboard";
import type { LoadFormat, TargetType } from "@/lib/load-bridge/load-types";
import { getLoadState, buildPackage, getPackageLink, addLoadTarget, removeLoadTarget, checkLoadTarget } from "./actions";

/**
 * لوحة جسر الحمل — إغلاق فجوة الضخّ في الواجهة: تعرض المخرجات المُثبَّتة،
 * تبني حزمة تصدير (SQL/CSV/JSON) قابلة للتنزيل مع مطابقة الأعداد، وتدير
 * وجهات الحمل. تظهر بعد اكتمال الترحيل الحقيقي.
 */
export default function LoadBridgePanel({ executionId, onNotify }: { executionId: string; onNotify: (t: BadgeTone, s: string) => void }) {
  const [state, setState] = useState<LoadBridgeState | null>(null);
  const [format, setFormat] = useState<LoadFormat>("sql");
  const [targetId, setTargetId] = useState<string>("");
  const [pending, startTransition] = useTransition();

  const refresh = useCallback(() => {
    getLoadState(executionId).then((r) => { if (r.ok && r.state) setState(r.state); });
  }, [executionId]);
  useEffect(() => { refresh(); }, [refresh]);

  function build() {
    startTransition(async () => {
      const r = await buildPackage(executionId, format, targetId || null);
      if (r.ok) {
        onNotify(r.reconciliation?.reconciled ? "success" : "warning", r.message ?? (r.reconciliation?.reconciled ? "حزمة الحمل جاهزة ومطابقة." : "حزمة جاهزة — راجع تطابق الأعداد."));
        if (r.runId) openPackage(r.runId);
        refresh();
      } else {
        onNotify("danger", r.message ?? "تعذّر بناء الحزمة.");
      }
    });
  }

  function openPackage(runId: string) {
    getPackageLink(runId).then((r) => { if (r.ok && r.url) window.open(r.url, "_blank", "noopener"); });
  }

  if (!state) return null;
  const hasDatasets = state.datasets.length > 0;

  return (
    <div className="rounded-[var(--v-radius-md)] border border-[var(--v-primary)]/35 bg-[var(--v-primary)]/[0.03] p-3">
      <div className="mb-2 flex items-center gap-1.5 text-xs font-bold text-[var(--v-text)]"><PackageCheck size={15} /> جسر الحمل — الضخّ داخل الـ ERP</div>

      {!hasDatasets ? (
        <p className="text-xs text-[var(--v-text-muted)]">لا مخرجات مُثبَّتة بعد. تُثبَّت تلقائيًّا عند اكتمال ترحيل حقيقي (بعد تطبيق ترحيل 0091).</p>
      ) : (
        <>
          {/* المخرجات المُثبَّتة */}
          <div className="mb-3">
            <div className="mb-1 flex items-center gap-1.5 text-[0.7rem] font-bold text-[var(--v-text-secondary)]"><Database size={13} /> مخرجات مُثبَّتة — {state.datasetsTotal} صفّ عبر {state.datasets.length} كيان</div>
            <div className="flex flex-wrap gap-1">
              {state.datasets.map((d) => (
                <span key={d.id} className="rounded-[var(--v-radius-sm)] bg-[var(--v-surface-2)] px-2 py-0.5 text-[0.65rem] text-[var(--v-text-secondary)] tabular-nums">{d.label}: {d.row_count}</span>
              ))}
            </div>
          </div>

          {/* بناء حزمة الحمل */}
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-[0.7rem] text-[var(--v-text-muted)]">الصيغة</label>
            <select value={format} onChange={(e) => setFormat(e.target.value as LoadFormat)} className="rounded-[var(--v-radius-sm)] border border-[var(--v-border)] bg-[var(--v-surface)] px-2 py-1 text-xs text-[var(--v-text)]">
              <option value="sql">SQL (INSERT)</option>
              <option value="csv">CSV</option>
              <option value="json">JSON</option>
            </select>
            {state.targets.length > 0 && (
              <select value={targetId} onChange={(e) => setTargetId(e.target.value)} className="rounded-[var(--v-radius-sm)] border border-[var(--v-border)] bg-[var(--v-surface)] px-2 py-1 text-xs text-[var(--v-text)]">
                <option value="">تصدير (بلا وجهة)</option>
                {state.targets.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            )}
            <Button variant="primary" size="sm" loading={pending} disabled={pending} onClick={build} icon={<Download size={14} />}>بناء حزمة الحمل</Button>
          </div>

          {/* عمليات الحمل السابقة */}
          {state.runs.length > 0 && (
            <div className="mt-3 space-y-1">
              {state.runs.map((run) => (
                <div key={run.id} className="flex items-center justify-between gap-2 rounded-[var(--v-radius-sm)] bg-[var(--v-surface-2)] px-2.5 py-1.5 text-[0.7rem]">
                  <span className="flex items-center gap-1.5">
                    <Badge tone={run.reconciled ? "success" : "warning"}>{run.reconciled ? <CheckCircle2 size={11} /> : <AlertTriangle size={11} />}</Badge>
                    <span className="text-[var(--v-text)]">{run.format.toUpperCase()} · {run.mode === "direct" ? "مباشر" : "تصدير"} · {run.loaded_rows}/{run.total_rows} صفّ</span>
                  </span>
                  {run.package_key && <button onClick={() => openPackage(run.id)} className="text-[var(--v-primary)] underline">تنزيل</button>}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* إدارة وجهات الحمل */}
      <TargetManager state={state} onNotify={onNotify} onChange={refresh} pending={pending} startTransition={startTransition} />
    </div>
  );
}

function TargetManager({ state, onNotify, onChange, pending, startTransition }: { state: LoadBridgeState; onNotify: (t: BadgeTone, s: string) => void; onChange: () => void; pending: boolean; startTransition: React.TransitionStartFunction }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<TargetType>("sql_file");
  const [endpoint, setEndpoint] = useState("");
  const [secret, setSecret] = useState("");
  const desc = state.targetTypes.find((t) => t.key === type);

  function add() {
    const config: Record<string, unknown> = {};
    if (type === "rest_api" && endpoint.trim()) config.endpoint = endpoint.trim();
    if (type === "supabase" && endpoint.trim()) config.url = endpoint.trim();
    startTransition(async () => {
      const r = await addLoadTarget({ projectId: null, name, targetType: type, config, secret: secret || undefined });
      onNotify(r.ok ? "success" : "danger", r.ok ? "أُضيفت الوجهة." : (r.message ?? ""));
      if (r.ok) { setName(""); setEndpoint(""); setSecret(""); setOpen(false); onChange(); }
    });
  }

  return (
    <div className="mt-3 border-t border-[var(--v-border)] pt-2">
      <div className="mb-1 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[0.7rem] font-bold text-[var(--v-text-secondary)]"><Plug size={13} /> وجهات الحمل</span>
        <button onClick={() => setOpen((o) => !o)} className="text-[0.7rem] text-[var(--v-primary)] underline">{open ? "إغلاق" : "+ وجهة"}</button>
      </div>

      {state.targets.map((t) => (
        <div key={t.id} className="flex items-center justify-between gap-2 py-0.5 text-[0.7rem]">
          <span className="flex items-center gap-1.5 text-[var(--v-text)]">{t.name} <Badge tone={t.configured ? "success" : "neutral"}>{t.configured ? "مُهيَّأة" : "مسودّة"}</Badge> <span className="text-[var(--v-text-muted)]">{t.target_type}</span></span>
          <span className="flex items-center gap-2">
            <button disabled={pending} onClick={() => startTransition(async () => { const r = await checkLoadTarget(t.id); onNotify(r.ok ? "info" : "danger", r.message ?? ""); onChange(); })} className="text-[var(--v-primary)] underline">اختبار</button>
            <button disabled={pending} onClick={() => startTransition(async () => { const r = await removeLoadTarget(t.id); onNotify(r.ok ? "success" : "danger", r.ok ? "حُذفت." : (r.message ?? "")); onChange(); })} className="text-[var(--v-red)]"><Trash2 size={12} /></button>
          </span>
        </div>
      ))}

      {open && (
        <div className="mt-2 space-y-1.5 rounded-[var(--v-radius-sm)] bg-[var(--v-surface-2)] p-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="اسم الوجهة" className="w-full rounded-[var(--v-radius-sm)] border border-[var(--v-border)] bg-[var(--v-surface)] px-2 py-1 text-xs text-[var(--v-text)]" />
          <select value={type} onChange={(e) => setType(e.target.value as TargetType)} className="w-full rounded-[var(--v-radius-sm)] border border-[var(--v-border)] bg-[var(--v-surface)] px-2 py-1 text-xs text-[var(--v-text)]">
            {state.targetTypes.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
          </select>
          {desc && <p className="text-[0.65rem] text-[var(--v-text-muted)]">{desc.description}</p>}
          {type === "rest_api" && <input value={endpoint} onChange={(e) => setEndpoint(e.target.value)} placeholder="نقطة النهاية (URL، يدعم {entity})" className="w-full rounded-[var(--v-radius-sm)] border border-[var(--v-border)] bg-[var(--v-surface)] px-2 py-1 text-xs text-[var(--v-text)]" dir="ltr" />}
          {type === "supabase" && <input value={endpoint} onChange={(e) => setEndpoint(e.target.value)} placeholder="رابط مشروع Supabase الهدف" className="w-full rounded-[var(--v-radius-sm)] border border-[var(--v-border)] bg-[var(--v-surface)] px-2 py-1 text-xs text-[var(--v-text)]" dir="ltr" />}
          {desc?.needsSecret && <input value={secret} onChange={(e) => setSecret(e.target.value)} type="password" placeholder={desc.secretField?.label ?? "السرّ"} className="w-full rounded-[var(--v-radius-sm)] border border-[var(--v-border)] bg-[var(--v-surface)] px-2 py-1 text-xs text-[var(--v-text)]" dir="ltr" />}
          <Button variant="secondary" size="sm" disabled={pending || !name.trim()} onClick={add}>حفظ الوجهة</Button>
        </div>
      )}
    </div>
  );
}
