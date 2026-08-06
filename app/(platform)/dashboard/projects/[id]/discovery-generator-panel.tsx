"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Sparkles, Loader2, Wand2, ExternalLink, CheckCircle2 } from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import { toast } from "@/components/ui/Toaster";
import {
  generateDiscoveryFormAction,
  getDiscoveryGenerationStatusAction,
} from "./discovery-generator-actions";

const DOMAIN_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "erp", label: "ERP / أنظمة مؤسسية" },
  { value: "crm", label: "CRM / إدارة عملاء" },
  { value: "lms", label: "LMS / تعليم" },
  { value: "school", label: "مدرسة / أكاديمية" },
  { value: "healthcare", label: "رعاية صحية" },
  { value: "hospital", label: "مستشفى" },
  { value: "clinic", label: "عيادة" },
  { value: "ecommerce", label: "تجارة إلكترونية" },
  { value: "restaurant", label: "مطاعم" },
  { value: "factory", label: "تصنيع / مصانع" },
  { value: "warehouse", label: "مخازن / لوجستيات" },
  { value: "accounting", label: "محاسبة / مالية" },
  { value: "construction", label: "إنشاءات / مقاولات" },
  { value: "legal", label: "قانوني" },
  { value: "generic", label: "أخرى / عام" },
];

const SIZE_OPTIONS = [
  { value: "startup", label: "شركة ناشئة" },
  { value: "sme", label: "صغيرة/متوسطة" },
  { value: "enterprise", label: "مؤسسة كبيرة" },
  { value: "government", label: "جهة حكومية" },
];

const COMPLEXITY_OPTIONS = [
  { value: "simple", label: "بسيط" },
  { value: "medium", label: "متوسط" },
  { value: "large", label: "كبير" },
  { value: "enterprise", label: "مؤسسي" },
];

const DEPTH_OPTIONS = [
  { value: "quick", label: "اكتشاف سريع" },
  { value: "standard", label: "قياسي" },
  { value: "deep", label: "عميق" },
  { value: "enterprise_audit", label: "تدقيق مؤسسي" },
];

const selectClass =
  "w-full rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-bg)] px-3 py-2 text-sm text-[var(--v-text)] outline-none focus:border-[var(--v-primary)]";
const inputClass =
  "w-full rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-bg)] px-3 py-2 text-sm text-[var(--v-text)] outline-none focus:border-[var(--v-primary)]";

/**
 * "توليد نموذج اكتشاف بالذكاء الاصطناعي" — بديل مكتبة القوالب الثابتة.
 * المستخدم بيوصف نشاط العميل + معايير بسيطة، والنظام بيولّد فورمًا
 * مخصصًا كاملًا يتحفظ كـ Template ويظهر فورًا في المكتبة ويشتغل مع
 * البوابة العامة وخط التحليل.
 */
export default function DiscoveryGeneratorPanel({
  isAdmin,
  activeTemplate,
}: {
  isAdmin: boolean;
  /** القالب المعروض حاليًا للمشروع — نتيح تحسينه وإعادة توليده مباشرة. */
  activeTemplate?: { id: string; name: string; isAiGenerated: boolean } | null;
}) {
  const router = useRouter();
  const [businessDescription, setBusinessDescription] = useState("");
  const [clientGoals, setClientGoals] = useState("");
  const [knownFeatures, setKnownFeatures] = useState("");
  const [industryDomain, setIndustryDomain] = useState("erp");
  const [companySize, setCompanySize] = useState("sme");
  const [complexity, setComplexity] = useState("medium");
  const [depth, setDepth] = useState("standard");
  const [templateName, setTemplateName] = useState("");

  const [generating, setGenerating] = useState(false);
  const [resultTemplateId, setResultTemplateId] = useState<string | null>(null);
  const [refinement, setRefinement] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  if (!isAdmin) return null;

  // النموذج القابل للتحسين: المولّد لتوّه في هذه الجلسة، وإلا القالب
  // المعروض حاليًا للمشروع (بشرط أنه مولّد بالذكاء الاصطناعي — عنده
  // generation_input نقدر نبني عليه بدون إعادة ملء الفورم).
  const refineTargetId =
    resultTemplateId ?? (activeTemplate?.isAiGenerated ? activeTemplate.id : null);

  function startPolling(jobId: string) {
    let elapsed = 0;
    pollRef.current = setInterval(async () => {
      elapsed += 3;
      const status = await getDiscoveryGenerationStatusAction(jobId);
      if (!status.ok) return;
      if (status.status === "completed" && status.templateId) {
        if (pollRef.current) clearInterval(pollRef.current);
        setGenerating(false);
        setResultTemplateId(status.templateId);
        toast.success("تم توليد نموذج الاكتشاف بنجاح.");
        router.refresh();
      } else if (status.status === "failed") {
        if (pollRef.current) clearInterval(pollRef.current);
        setGenerating(false);
        toast.error(status.message ?? "فشل توليد النموذج.");
      } else if (elapsed > 250) {
        if (pollRef.current) clearInterval(pollRef.current);
        setGenerating(false);
        toast.error("استغرق التوليد وقتًا أطول من المتوقع — حاول مرة أخرى.");
      }
    }, 3000);
  }

  async function handleGenerate(opts?: { previousTemplateId?: string }) {
    const isRefine = !!opts?.previousTemplateId;
    if (isRefine && !refinement.trim()) {
      toast.error("اكتب التعديلات أو الإضافات المطلوبة أولًا.");
      return;
    }
    setResultTemplateId(null);
    setGenerating(true);
    const result = await generateDiscoveryFormAction({
      businessDescription,
      clientGoals,
      knownFeatures,
      industryDomain,
      companySize,
      complexity,
      depth,
      templateName,
      ...(isRefine ? { refinement: refinement.trim(), previousTemplateId: opts!.previousTemplateId } : {}),
    });
    if (!result.ok || !result.jobId) {
      setGenerating(false);
      toast.error(result.message ?? "تعذّر بدء التوليد.");
      return;
    }
    toast.success(isRefine ? "جاري إعادة التوليد بالتعديلات — لحظات." : "جاري توليد نموذج مخصص — لحظات.");
    startPolling(result.jobId);
  }

  return (
    <Card padding="md">
      <p className="mb-1 flex items-center gap-2 text-sm font-semibold text-[var(--v-text)]">
        <Sparkles size={16} className="text-[var(--v-primary)]" /> توليد نموذج اكتشاف بالذكاء الاصطناعي
      </p>
      <p className="mb-4 text-xs text-[var(--v-text-muted)]">
        اوصف نشاط العميل، والنظام هيولّد فورم اكتشاف مخصص بالكامل — يتحفظ تلقائيًا كقالب في المكتبة وجاهز للإرسال.
      </p>

      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--v-text-secondary)]">وصف نشاط العميل *</label>
          <textarea
            value={businessDescription}
            onChange={(e) => setBusinessDescription(e.target.value)}
            rows={3}
            placeholder="مثلاً: نظام ERP لشركة تصنيع لديها عدة مخازن وخط إنتاج وأوامر شراء."
            className={inputClass}
            disabled={generating}
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--v-text-secondary)]">أهداف العميل (اختياري)</label>
            <textarea
              value={clientGoals}
              onChange={(e) => setClientGoals(e.target.value)}
              rows={2}
              placeholder="أتمتة العمليات، تقليل العمل اليدوي…"
              className={inputClass}
              disabled={generating}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--v-text-secondary)]">مزايا معروفة (اختياري)</label>
            <textarea
              value={knownFeatures}
              onChange={(e) => setKnownFeatures(e.target.value)}
              rows={2}
              placeholder="مخزون، فواتير، تقارير، صلاحيات…"
              className={inputClass}
              disabled={generating}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--v-text-secondary)]">المجال</label>
            <select value={industryDomain} onChange={(e) => setIndustryDomain(e.target.value)} className={selectClass} disabled={generating}>
              {DOMAIN_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--v-text-secondary)]">حجم الشركة</label>
            <select value={companySize} onChange={(e) => setCompanySize(e.target.value)} className={selectClass} disabled={generating}>
              {SIZE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--v-text-secondary)]">التعقيد</label>
            <select value={complexity} onChange={(e) => setComplexity(e.target.value)} className={selectClass} disabled={generating}>
              {COMPLEXITY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--v-text-secondary)]">عمق الاكتشاف</label>
            <select value={depth} onChange={(e) => setDepth(e.target.value)} className={selectClass} disabled={generating}>
              {DEPTH_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--v-text-secondary)]">اسم القالب (اختياري)</label>
          <input
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
            placeholder="لو فاضي، هيقترح النظام اسمًا"
            className={inputClass}
            disabled={generating}
          />
        </div>

        <Button variant="primary" icon={generating ? <Loader2 size={15} className="animate-spin" /> : <Wand2 size={15} />} onClick={() => handleGenerate()} disabled={generating}>
          {generating ? "جاري التوليد…" : "توليد النموذج"}
        </Button>
      </div>

      {resultTemplateId && (
        <div className="mt-4">
          <div className="flex flex-wrap items-center gap-2 rounded-[var(--v-radius-md)] border border-[var(--v-green)]/40 bg-[var(--v-green)]/5 p-3">
            <CheckCircle2 size={16} className="text-[var(--v-green)]" />
            <span className="text-xs text-[var(--v-text)]">النموذج جاهز وأُضيف لمكتبة القوالب.</span>
            <Link
              href={`/dashboard/templates/${resultTemplateId}`}
              className="inline-flex items-center gap-1 text-xs font-medium text-[var(--v-primary)] hover:underline"
            >
              فتح للمراجعة والتعديل <ExternalLink size={12} />
            </Link>
          </div>
        </div>
      )}

      {/* تحسين وإعادة التوليد — يظهر للنموذج اللي لسه اتولّد أو للقالب
          المعروض حاليًا (لو مولّد بالذكاء الاصطناعي). يبني نسخة محسّنة. */}
      {refineTargetId && (
        <div className="mt-4 rounded-[var(--v-radius-md)] border border-[var(--v-border)] p-3">
          <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-[var(--v-text-secondary)]">
            <Wand2 size={13} className="text-[var(--v-primary)]" />
            {resultTemplateId
              ? "مش عاجبك؟ عدّل واطلب إضافات وأعد التوليد"
              : `تعديل النموذج الحالي${activeTemplate?.name ? ` «${activeTemplate.name}»` : ""} وإعادة توليده`}
          </label>
          <textarea
            value={refinement}
            onChange={(e) => setRefinement(e.target.value)}
            rows={3}
            placeholder="مثلاً: ضيف قسم عن التكاملات مع الأنظمة الحالية، اسأل عن عدد الفروع والمخازن، شيل الأسئلة المكررة عن الميزانية، خلّي أسئلة الموبايل شرطية."
            className={inputClass}
            disabled={generating}
          />
          <p className="mt-1 text-[11px] text-[var(--v-text-muted)]">
            النظام هيبني نموذجًا جديدًا محسّنًا (يحافظ على الأسئلة الجيدة + يطبّق تعديلاتك) ويحفظه كقالب جديد — من غير ما تعيد ملء الفورم.
          </p>
          <div className="mt-2">
            <Button
              variant="secondary"
              size="sm"
              icon={generating ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
              onClick={() => handleGenerate({ previousTemplateId: refineTargetId })}
              disabled={generating || !refinement.trim()}
            >
              {generating ? "جاري إعادة التوليد…" : "تعديل وإعادة التوليد"}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
