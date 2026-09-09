import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PrintButton from "@/components/ui/PrintButton";
import { requireViewQAReports } from "@/lib/engineering-qa/permissions";
import { getStagePrintData, getProjectNameForPrint, isPrintableStage, type PrintFinding } from "@/lib/engineering-qa/print-adapter";

/**
 * صفحة مستقلة (خارج تخطيط /dashboard) مُعدّة للطباعة/تصدير PDF لنتيجة
 * مرحلة واحدة من Engineering QA — نفس نمط صفحات الطباعة الموجودة بالفعل
 * (prototype-review-print/prd-print/developer-handoff-print/client-delivery-print):
 * بدون Header/Navigation، محمية بنفس فحص تسجيل الدخول + صلاحية عرض تقارير
 * Engineering QA (requireViewQAReports — نفس صلاحية اللوحة نفسها، صفر نظام
 * صلاحيات جديد)، وزرار "طباعة / حفظ كـ PDF" المشترك (PrintButton) يعتمد
 * على طباعة المتصفح — بالظبط زي كل صفحات الطباعة التانية في المشروع، من
 * غير أي مكتبة PDF جديدة.
 *
 * كل Finding بيتعرض بكل تفاصيله: نوع الفحص (المحور/التصنيف)، اسم الملف
 * والسطر، المشكلة (العنوان + الوصف + السبب الجذري + الأثر)، الحل المقترح
 * (recommended_fix + patch_suggestion)، والنتيجة المتوقعة بعد الإصلاح
 * (validation_steps) — عشان يكون تقرير قابل للإرسال لأي طرف تاني بدون
 * ما يحتاج يدخل المنصة أصلًا.
 */
export default async function QaStagePrintPage({
  params,
}: {
  params: Promise<{ stageKey: string; reviewId: string }>;
}) {
  const { stageKey, reviewId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  if (!isPrintableStage(stageKey)) {
    notFound();
  }

  const auth = await requireViewQAReports();
  if (!auth.ok) {
    notFound();
  }

  const data = await getStagePrintData(stageKey, reviewId);
  if (!data) {
    notFound();
  }

  const projectName = await getProjectNameForPrint(data.projectId);
  const severityCounts = countBySeverity(data.findings);

  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-3xl px-8 py-10 text-[#0A1735]" dir="rtl">
        <div className="mb-6 print:hidden">
          <PrintButton />
        </div>

        <p className="text-sm font-bold tracking-widest text-[#3D5CFF]">VELORA — Engineering QA</p>
        <h1 className="font-display mt-2 text-3xl">{data.stageLabel}</h1>
        <p className="mt-1 text-lg text-slate-600">{projectName}</p>
        <p className="mt-2 text-sm text-slate-500">
          مراجعة رقم {data.version} · {STATUS_LABELS[data.status] ?? data.status}
          {data.generatedAt ? ` · تاريخ التوليد: ${new Date(data.generatedAt).toLocaleString("ar-EG")}` : ""}
        </p>

        <div className="mt-3 flex flex-wrap gap-2">
          {(["critical", "high", "medium", "low", "info"] as const).map((sev) =>
            severityCounts[sev] > 0 ? (
              <span
                key={sev}
                className="rounded-full px-3 py-1 text-xs font-bold text-white"
                style={{ backgroundColor: SEVERITY_COLOR[sev] }}
              >
                {SEVERITY_LABEL[sev]}: {severityCounts[sev]}
              </span>
            ) : null
          )}
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
            الإجمالي: {data.findings.length}
          </span>
        </div>

        {data.scoreSummary && (
          <Section title="ملخّص الدرجات (Score Summary)">
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(data.scoreSummary).map(([key, value]) => (
                <div key={key} className="rounded border border-slate-200 p-2 text-center">
                  <p className="text-xl font-bold">{value}</p>
                  <p className="text-[11px] text-slate-500">{prettifyKey(key)}</p>
                </div>
              ))}
            </div>
          </Section>
        )}

        <Section title={`النتائج التفصيلية (${data.findings.length})`}>
          {data.findings.length === 0 ? (
            <p className="text-sm text-slate-500">لا توجد نتائج مسجّلة لهذه المراجعة.</p>
          ) : (
            <div className="space-y-5">
              {[...data.findings]
                .sort(
                  (a, b) =>
                    (SEVERITY_ORDER as readonly string[]).indexOf(a.severity) -
                    (SEVERITY_ORDER as readonly string[]).indexOf(b.severity)
                )
                .map((f, i) => (
                  <FindingCard key={i} finding={f} index={i + 1} />
                ))}
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}

function FindingCard({ finding: f, index }: { finding: PrintFinding; index: number }) {
  const color = SEVERITY_COLOR[f.severity as keyof typeof SEVERITY_COLOR] ?? "#64748B";
  return (
    <div className="break-inside-avoid rounded border border-slate-200" style={{ borderInlineStartWidth: 4, borderInlineStartColor: color }}>
      <div className="p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-bold">
            #{index} — {f.title}
          </p>
          <span className="rounded-full px-2 py-0.5 text-[11px] font-bold text-white" style={{ backgroundColor: color }}>
            {SEVERITY_LABEL[f.severity as keyof typeof SEVERITY_LABEL] ?? f.severity}
          </span>
        </div>

        <p dir="ltr" className="mt-1 text-left text-xs text-slate-500">
          {f.filePath}
          {f.lineStart ? ` : ${f.lineStart}${f.lineEnd && f.lineEnd !== f.lineStart ? `-${f.lineEnd}` : ""}` : ""}
        </p>
        <p className="mt-0.5 text-[11px] text-slate-400">التصنيف: {prettifyKey(f.categoryKey)}</p>

        <Field label="المشكلة">{f.description}</Field>
        {f.rootCause && <Field label="السبب الجذري">{f.rootCause}</Field>}
        {f.impact && <Field label="الأثر">{f.impact}</Field>}
        {f.attackScenario && <Field label="سيناريو الاستغلال">{f.attackScenario}</Field>}

        {f.recommendedFix && <Field label="الحل المقترح">{f.recommendedFix}</Field>}
        {f.patchSuggestion && (
          <div className="mt-2">
            <p className="text-xs font-bold text-slate-600">مقترح التعديل (Patch)</p>
            <pre dir="ltr" className="mt-1 overflow-x-auto rounded bg-slate-50 p-2 text-left text-[11px] leading-relaxed text-slate-700">
              {f.patchSuggestion}
            </pre>
          </div>
        )}
        {f.codeSnippet && (
          <div className="mt-2">
            <p className="text-xs font-bold text-slate-600">مقتطف الكود الحالي</p>
            <pre dir="ltr" className="mt-1 overflow-x-auto rounded bg-slate-50 p-2 text-left text-[11px] leading-relaxed text-slate-700">
              {f.codeSnippet}
            </pre>
          </div>
        )}

        {f.validationSteps.length > 0 && (
          <div className="mt-2">
            <p className="text-xs font-bold text-slate-600">النتيجة المتوقعة بعد الإصلاح / خطوات التحقق</p>
            <ul className="mt-1 list-disc space-y-0.5 pr-5 text-xs text-slate-700">
              {f.validationSteps.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </div>
        )}

        {f.referenceLinks.length > 0 && (
          <div className="mt-2">
            <p className="text-xs font-bold text-slate-600">مراجع</p>
            <ul dir="ltr" className="mt-1 list-disc space-y-0.5 pr-5 text-left text-[11px] text-slate-500">
              {f.referenceLinks.map((l, i) => (
                <li key={i}>{l}</li>
              ))}
            </ul>
          </div>
        )}

        {f.carriedOver && <p className="mt-2 text-[11px] text-slate-400">منقول من مراجعة سابقة (لم يُصلَح بعد).</p>}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-2">
      <p className="text-xs font-bold text-slate-600">{label}</p>
      <p className="mt-0.5 text-xs leading-relaxed text-slate-700">{children}</p>
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

const SEVERITY_ORDER = ["critical", "high", "medium", "low", "info"] as const;

const SEVERITY_LABEL: Record<string, string> = {
  critical: "حرج",
  high: "عالي",
  medium: "متوسط",
  low: "منخفض",
  info: "معلومة",
};

const SEVERITY_COLOR: Record<string, string> = {
  critical: "#DC2626",
  high: "#D97706",
  medium: "#2563EB",
  low: "#64748B",
  info: "#94A3B8",
};

const STATUS_LABELS: Record<string, string> = {
  ready: "جاهز",
  generating: "قيد التوليد",
  failed: "فشل",
  pending: "في الانتظار",
};

function countBySeverity(findings: PrintFinding[]): Record<string, number> {
  const counts: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const f of findings) counts[f.severity] = (counts[f.severity] ?? 0) + 1;
  return counts;
}

function prettifyKey(key: string): string {
  return key
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
