import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PrintButton from "@/components/ui/PrintButton";
import { getConfig } from "@/lib/prototype-studio/config-service";
import { getLatest } from "@/lib/prototype-studio/artifact-service";
import "@/app/print.css";

/**
 * صفحة PDF لـ Prototype Studio — إعدادات الاستوديو + Context Pack الأخير
 * + Build Brief المعتمَد الأخير. بدون Codex/starter prompt.
 */
export default async function PrototypeStudioPrintPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: project } = await supabase
    .from("projects")
    .select("name")
    .eq("id", projectId)
    .maybeSingle();
  if (!project) notFound();

  const [cfg, contextPack, approvedBrief] = await Promise.all([
    getConfig(projectId),
    getLatest(projectId, "context_pack"),
    getLatest(projectId, "build_brief", ["approved"]),
  ]);

  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-3xl px-8 py-10 text-[#0A1735]" dir="rtl">
        <div className="no-print mb-4 rounded border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
          💡 <strong>لأنظف PDF:</strong> اضغط Ctrl+P ← More Settings ← uncheck &quot;Headers and footers&quot;. ثم Save as PDF.
        </div>
        <div className="no-print mb-6">
          <PrintButton />
        </div>

        <header className="border-b-2 border-[#3D5CFF] pb-3">
          <h1 className="font-display text-3xl">Prototype Studio — {project.name}</h1>
          <p className="mt-1 text-sm text-slate-500">
            آخر تحديث للإعدادات: {cfg.updatedAt && cfg.updatedAt !== new Date(0).toISOString() ? new Date(cfg.updatedAt).toLocaleDateString("ar-EG") : "—"}
          </p>
        </header>

        <Section title="الإعدادات الأساسية">
          <KV label="نوع النموذج" value={cfg.prototypeType} />
          <KV label="هدف النموذج" value={cfg.prototypeGoal} />
          <KV label="المنصّة" value={cfg.platform} />
          <KV label="مستوى الدقّة" value={cfg.fidelity} />
          <KV label="اللغة" value={`${cfg.language}${cfg.isRtl ? " (RTL)" : ""}`} />
          <KV label="متطلّبات الـ Backend" value={cfg.backendRequirement} />
          <KV label="استراتيجية البيانات" value={cfg.dataStrategy} />
        </Section>

        <Section title="الشخصيات الأساسية (Personas)">
          <BulletList items={cfg.primaryPersonas} />
        </Section>

        <Section title="التدفّقات الأساسية (Core Flows)">
          <BulletList items={cfg.coreFlows} />
        </Section>

        <Section title="النطاق">
          <p className="mb-1 font-bold text-[#16A34A]">داخل النطاق</p>
          <BulletList items={cfg.inScopeItems} />
          <p className="mb-1 mt-3 font-bold text-slate-500">خارج النطاق</p>
          <BulletList items={cfg.outOfScopeItems} />
        </Section>

        <Section title="الاتجاه البصري">
          <KV label="الأسلوب البصري" value={cfg.designDirection.visual_style} />
          <KV label="كثافة الواجهة" value={cfg.designDirection.ui_density} />
          <KV label="تفضيل التخطيط" value={cfg.designDirection.layout_preference} />
          <KV label="تفضيل التنقّل" value={cfg.designDirection.navigation_preference} />
          <KV label="ملاحظات الوصولية" value={cfg.designDirection.accessibility_notes} />
          {cfg.designDirection.brand_colors.length > 0 && (
            <div className="mt-2">
              <p className="font-semibold">ألوان العلامة</p>
              <ul className="mt-1 space-y-1">
                {cfg.designDirection.brand_colors.map((c, i) => (
                  <li key={i} className="flex items-center gap-2 text-xs">
                    <span
                      className="inline-block h-4 w-4 rounded border border-slate-300"
                      style={{ backgroundColor: c.hex }}
                    />
                    <span>{c.name}</span>
                    <span className="font-mono text-slate-500">{c.hex}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {(cfg.designDirection.typography.heading || cfg.designDirection.typography.body || cfg.designDirection.typography.sizes) && (
            <div className="mt-2">
              <p className="font-semibold">الطباعة</p>
              <KV label="العناوين" value={cfg.designDirection.typography.heading} />
              <KV label="النص" value={cfg.designDirection.typography.body} />
              <KV label="المقاسات" value={cfg.designDirection.typography.sizes} />
            </div>
          )}
        </Section>

        {cfg.designReferences.length > 0 && (
          <Section title="مراجع التصميم">
            <ul className="list-disc space-y-2 pr-5">
              {cfg.designReferences.map((r, i) => (
                <li key={i}>
                  <a href={r.url} className="text-[#3D5CFF] underline">{r.url}</a>
                  {r.liked && <span className="block text-xs text-slate-600">أعجب: {r.liked}</span>}
                  {r.avoid && <span className="block text-xs text-slate-600">تجنّب: {r.avoid}</span>}
                  {r.notes && <span className="block text-xs text-slate-500">— {r.notes}</span>}
                </li>
              ))}
            </ul>
          </Section>
        )}

        <Section title={`Context Pack${contextPack ? ` v${contextPack.version}` : ""}`}>
          {contextPack ? (
            <pre className="whitespace-pre-wrap text-xs leading-relaxed text-slate-700">
              {contextPack.contentMd}
            </pre>
          ) : (
            <Empty />
          )}
        </Section>

        <Section title={`Build Brief (معتمَد)${approvedBrief ? ` v${approvedBrief.version}` : ""}`}>
          {approvedBrief ? (
            <pre className="whitespace-pre-wrap text-xs leading-relaxed text-slate-700">
              {approvedBrief.contentMd}
            </pre>
          ) : (
            <Empty />
          )}
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-6 break-inside-avoid">
      <h2 className="border-b border-slate-200 pb-1 font-display text-lg">{title}</h2>
      <div className="mt-2 text-sm leading-relaxed text-slate-700">{children}</div>
    </div>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <p>
      <strong>{label}:</strong> {value}
    </p>
  );
}

function Empty() {
  return <p className="text-slate-400">— لم يُملأ بعد —</p>;
}

function BulletList({ items }: { items: string[] }) {
  if (!items || items.length === 0) return <Empty />;
  return (
    <ul className="list-disc space-y-1 pr-5">
      {items.map((it, i) => (
        <li key={i}>{it}</li>
      ))}
    </ul>
  );
}
