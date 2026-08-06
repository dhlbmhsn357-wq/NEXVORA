"use client";

import { useState, useTransition } from "react";
import { KeyRound, Trash2, Plus, ShieldCheck } from "lucide-react";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import type { AiKeyRow, KeyTier, KeyProvider } from "@/lib/ai/key-management";
import { getAiKeys, createAiKey, removeAiKey, toggleAiKey } from "./ai-keys-actions";

/**
 * مدير مفاتيح مزوّدي الذكاء الاصطناعي — مصدر مشترك عبر البيئات. تُضاف هنا
 * مرة واحدة، وتُقرأ تلقائيًّا في Vercel وRailway (تُدمَج مع متغيّرات البيئة).
 * لا تُعرض القيمة الكاملة أبدًا — تلميح آخر ٤ محارف فقط. يدعم Gemini
 * وOpenAI (ChatGPT) — OpenAI مفيش عنده Free tier فكل مفاتيحه مدفوعة.
 */
export default function AiKeysPanel({ initialKeys, cryptoConfigured }: { initialKeys: AiKeyRow[]; cryptoConfigured: boolean }) {
  const [provider, setProvider] = useState<KeyProvider>("gemini");
  const [keys, setKeys] = useState<AiKeyRow[]>(initialKeys);
  const [tier, setTier] = useState<KeyTier>("paid");
  const [rawKey, setRawKey] = useState("");
  const [label, setLabel] = useState("");
  const [msg, setMsg] = useState<{ tone: "success" | "danger" | "info"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const providerLabel = provider === "openai" ? "OpenAI (ChatGPT)" : "Gemini";

  function refresh(p: KeyProvider = provider) {
    getAiKeys(p).then((r) => { if (r.ok) setKeys(r.keys); });
  }

  function switchProvider(p: KeyProvider) {
    if (p === provider) return;
    setProvider(p);
    setMsg(null);
    setRawKey("");
    setLabel("");
    setTier("paid");
    refresh(p);
  }

  function add() {
    startTransition(async () => {
      const r = await createAiKey(tier, rawKey, label, provider);
      setMsg({ tone: r.ok ? "success" : "danger", text: r.message ?? (r.ok ? "أُضيف." : "فشل.") });
      if (r.ok) { setRawKey(""); setLabel(""); refresh(); }
    });
  }
  function del(id: string) {
    startTransition(async () => {
      const r = await removeAiKey(id);
      if (r.ok) refresh(); else setMsg({ tone: "danger", text: r.message ?? "" });
    });
  }
  function toggle(id: string, active: boolean) {
    startTransition(async () => {
      const r = await toggleAiKey(id, active);
      if (r.ok) refresh(); else setMsg({ tone: "danger", text: r.message ?? "" });
    });
  }

  const paid = keys.filter((k) => k.tier === "paid");
  const free = keys.filter((k) => k.tier === "free");

  return (
    <Card padding="md">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-[var(--v-text)]"><KeyRound size={15} /> مفاتيح الذكاء الاصطناعي (مصدر مشترك)</p>
        <Badge tone={paid.length > 0 ? "success" : "warning"}>
          {provider === "openai" ? `${keys.length} مفتاح` : `${paid.length} مدفوع · ${free.length} مجاني`}
        </Badge>
      </div>

      {/* مبدّل المزوّد */}
      <div className="mt-3 inline-flex overflow-hidden rounded-[var(--v-radius-md)] border border-[var(--v-border)]">
        {(["gemini", "openai"] as KeyProvider[]).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => switchProvider(p)}
            className={`px-3 py-1 text-xs font-semibold transition-colors ${provider === p ? "bg-[var(--v-primary)] text-white" : "text-[var(--v-text-secondary)] hover:bg-[var(--v-surface)]"}`}
          >
            {p === "openai" ? "OpenAI" : "Gemini"}
          </button>
        ))}
      </div>

      <p className="mt-2 text-xs text-[var(--v-text-muted)]">
        تُضاف هنا مرة واحدة وتُقرأ في كل البيئات (Vercel + Railway) تلقائيًّا — بدل ضبطها في كل مكان. تُدمَج مع متغيّرات البيئة ولا تُلغيها.
        {provider === "openai"
          ? " OpenAI مدفوع بالكامل بلا حصة مجانية — فعّله للمهام اللي تختارها من قسم «الموديل المستخدم لكل نوع مهمة»."
          : " المفتاح المدفوع يُجرَّب أولًا (حصته أعلى)."}
      </p>

      {!cryptoConfigured && (
        <div className="mt-3 rounded-[var(--v-radius-md)] border border-[var(--v-amber)]/40 bg-[var(--v-amber)]/5 px-3 py-2 text-xs text-[var(--v-text)]">
          <ShieldCheck size={13} className="inline" /> لتفعيل التخزين المشفَّر، اضبط <code className="rounded bg-[var(--v-surface-2)] px-1">MIGRATION_SECRET_KEY</code> (متغيّر واحد ثابت) في Vercel وRailway. بدونه لا تُحفظ المفاتيح.
        </div>
      )}

      {msg && (
        <div className={`mt-3 rounded-[var(--v-radius-md)] px-3 py-2 text-xs ${msg.tone === "success" ? "text-[var(--v-green)]" : msg.tone === "danger" ? "text-[var(--v-red)]" : "text-[var(--v-text-secondary)]"}`}>{msg.text}</div>
      )}

      {/* القائمة */}
      {keys.length > 0 && (
        <div className="mt-4 space-y-1.5">
          {keys.map((k) => (
            <div key={k.id} className="flex items-center justify-between gap-2 rounded-[var(--v-radius-sm)] bg-[var(--v-surface-2)] px-3 py-2 text-xs">
              <span className="flex items-center gap-2">
                <Badge tone={k.tier === "paid" ? "success" : "neutral"}>{k.tier === "paid" ? "مدفوع" : "مجاني"}</Badge>
                <span className="text-[var(--v-text)]">{k.label}</span>
                <code className="font-mono text-[var(--v-text-muted)]" dir="ltr">••••{k.key_hint}</code>
                {!k.active && <Badge tone="warning">معطّل</Badge>}
              </span>
              <span className="flex items-center gap-3">
                <button disabled={pending} onClick={() => toggle(k.id, !k.active)} className="text-[var(--v-primary)] underline">{k.active ? "تعطيل" : "تفعيل"}</button>
                <button disabled={pending} onClick={() => del(k.id)} className="text-[var(--v-red)]"><Trash2 size={13} /></button>
              </span>
            </div>
          ))}
        </div>
      )}

      {/* إضافة */}
      <div className="mt-4 space-y-2 border-t border-[var(--v-border)] pt-3">
        <div className="flex flex-wrap items-center gap-2">
          {provider === "gemini" && (
            <select value={tier} onChange={(e) => setTier(e.target.value as KeyTier)} className="rounded-[var(--v-radius-sm)] border border-[var(--v-border)] bg-[var(--v-surface)] px-2 py-1.5 text-xs text-[var(--v-text)]">
              <option value="paid">مدفوع (Paid)</option>
              <option value="free">مجاني (Free)</option>
            </select>
          )}
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="اسم مميّز (اختياري)" className="w-40 rounded-[var(--v-radius-sm)] border border-[var(--v-border)] bg-[var(--v-surface)] px-2 py-1.5 text-xs text-[var(--v-text)]" />
        </div>
        <input value={rawKey} onChange={(e) => setRawKey(e.target.value)} type="password" placeholder={`الصق مفتاح ${providerLabel} هنا`} dir="ltr" className="w-full rounded-[var(--v-radius-sm)] border border-[var(--v-border)] bg-[var(--v-surface)] px-2 py-1.5 text-xs text-[var(--v-text)]" />
        <Button variant="primary" size="sm" disabled={pending || rawKey.trim().length < 10} onClick={add} icon={<Plus size={14} />}>أضِف المفتاح</Button>
      </div>
    </Card>
  );
}
