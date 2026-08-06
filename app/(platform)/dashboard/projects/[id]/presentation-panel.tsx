"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  generateClientPresentation,
  regeneratePresentationSlide,
  editPresentationSlide,
  generateShareLink,
  revokeShareLink,
  downloadPresentationPptx,
  getPresentationVersions,
} from "./presentation-actions";
import { MonitorPlay, Check } from "lucide-react";
import { CLIENT_PRESENTATION_SLIDE_KEYS } from "@/lib/types/database";
import { checkPresentationConsistency } from "@/lib/presentation/quality-check";
import RegenerateConfirmDialog from "@/components/ui/RegenerateConfirmDialog";
import CompareModalShell from "@/components/ui/CompareModalShell";
import EditableSectionCard from "@/components/ui/EditableSectionCard";
import Badge from "@/components/ui/Badge";
import AiBadge from "@/components/ui/AiBadge";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import type {
  ClientPresentation,
  ClientPresentationSlideKey,
  ClientPresentationVersion,
} from "@/lib/types/database";
import { useBackgroundRefresh } from "@/lib/ui/use-background-refresh";

const slideLabels: Record<ClientPresentationSlideKey, string> = {
  cover: "الغلاف",
  agenda: "جدول الأعمال",
  executive_summary: "الملخص التنفيذي",
  about_company: "عن الشركة",
  business_problem: "المشكلة",
  current_situation: "الوضع الحالي",
  pain_points: "نقاط الألم",
  our_understanding: "فهمنا لأعمالك",
  vision: "رؤية الحل",
  solution: "الحل",
  scope: "نطاق العمل",
  features: "أهم الميزات",
  modules: "وحدات النظام",
  workflow: "سير العمل الجديد",
  before_after: "قبل وبعد",
  departments: "الأقسام المستفيدة",
  user_roles: "المستخدمون والأدوار",
  reports: "التقارير ولوحات المتابعة",
  ai_capabilities: "قدرات الذكاء الاصطناعي",
  timeline: "الجدول الزمني",
  architecture: "نظرة عامة على النظام",
  risks: "المخاطر وخطط المواجهة",
  roi: "العائد على الاستثمار",
  kpis: "مؤشرات الأداء الرئيسية",
  roadmap: "خارطة الطريق",
  transformation: "رحلة التحوّل",
  next_steps: "الخطوات القادمة",
  qa: "أسئلة وأجوبة",
  closing: "الخاتمة",
};

export default function PresentationPanel({
  projectId,
  projectName,
  presentation,
  currentBrainVersion,
  currentPrdVersion,
  currentReviewVersion,
}: {
  projectId: string;
  projectName: string;
  presentation: ClientPresentation | null;
  currentBrainVersion: number | null;
  currentPrdVersion: number | null;
  currentReviewVersion: number | null;
}) {
  const router = useRouter();
  const [generating, setGenerating] = useState(false);
  const [message, setMessage] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [language, setLanguage] = useState<"ar" | "en">(presentation?.language ?? "ar");
  const [showCompare, setShowCompare] = useState(false);
  const [versions, setVersions] = useState<ClientPresentationVersion[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [compareA, setCompareA] = useState<number | null>(null);
  const [compareB, setCompareB] = useState<number | null>(null);

  const isGenerating =
    presentation?.status === "generating" ||
    (generating && presentation?.status !== "failed" && presentation?.status !== "idle");
  const hasContent = !!(presentation && presentation.version > 0);
  // فحص اتساق حتمي (بدون AI) بيمشي وقت العرض — بيرصد تسريب مصطلحات
  // تقنية أو محتوى Placeholder قبل ما الـ PM يقدّم العرض للعميل.
  const qualityWarnings = hasContent
    ? checkPresentationConsistency(presentation.slides_content, { clientName: projectName }).filter((w) => w.severity === "warning")
    : [];
  const isOutdated =
    hasContent &&
    presentation &&
    ((currentBrainVersion !== null && presentation.generated_from_brain_version !== currentBrainVersion) ||
      (currentPrdVersion !== null && presentation.generated_from_prd_version !== currentPrdVersion) ||
      (currentReviewVersion !== null &&
        presentation.generated_from_review_version !== currentReviewVersion));
  const shareUrl = presentation?.share_token
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/present/${presentation.share_token}`
    : null;

  const displayMessage = message || presentation?.last_error || "";

  // تحديث دوري مُجمَّع: منسّق واحد لكل الصفحة بدل مؤقّت لكل لوحة، بيقف
  // لما التبويب يكون مخفي وبيبطّل خالص لو المهمة اتعلّقت.
  useBackgroundRefresh(presentation?.status === "generating");

  async function runGenerate() {
    setShowConfirm(false);
    setGenerating(true);
    setMessage("");
    const result = await generateClientPresentation(projectId, projectName, language);
    if (result.status === "missing_data") {
      setMessage(result.message);
      setGenerating(false);
    } else if (result.status === "already_generating") {
      setMessage("فيه توليد شغال بالفعل، استنى يخلص.");
    }
    // "started" → التوليد بدأ في الخلفية؛ الـ Polling هيلتقط النتيجة.
    router.refresh();
  }

  function handleGenerateClick() {
    if (hasContent) setShowConfirm(true);
    else runGenerate();
  }

  async function handleGenerateLink() {
    await generateShareLink(projectId);
    router.refresh();
  }

  async function handleRevokeLink() {
    if (!window.confirm("الرابط الحالي هيتوقف فورًا ولو متضمّن في موقع أو رسالة مُرسلة، هيبقى مكسور. متأكد؟")) {
      return;
    }
    await revokeShareLink(projectId);
    router.refresh();
  }

  async function handleCopyLink() {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleDownloadPptx() {
    if (!presentation?.pptx_storage_path) return;
    setDownloading(true);
    const url = await downloadPresentationPptx(presentation.pptx_storage_path);
    setDownloading(false);
    if (url) window.open(url, "_blank");
    else setMessage("تعذّر إنشاء رابط تنزيل PPTX.");
  }

  async function handleOpenCompare() {
    setShowCompare(true);
    setLoadingVersions(true);
    const v = await getPresentationVersions(projectId);
    setVersions(v);
    if (v.length >= 2) {
      setCompareA(v[1].version);
      setCompareB(v[0].version);
    }
    setLoadingVersions(false);
  }

  if (!presentation || !hasContent) {
    return (
      <div>
        <EmptyState
          icon={<MonitorPlay size={28} />}
          title="لسه مفيش عرض للعميل لهذا المشروع"
          description="محتاج Project Brain وPRD جاهزين أولاً."
          primaryAction={{
            label: isGenerating ? "جاري التوليد…" : "Generate Client Presentation",
            onClick: handleGenerateClick,
            loading: isGenerating,
          }}
        />
        {displayMessage && <p className="mt-3 text-center text-xs text-[var(--v-amber)]">{displayMessage}</p>}
        {isGenerating && (
          <p className="mt-2 text-center text-xs text-[var(--v-text-muted)]">
            التوليد شغّال في الخلفية — تقدر تسيب الصفحة وترجع، مش هيضيع. ممكن ياخد لحد كام دقيقة لو الكوتة مزدحمة.
          </p>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--v-text-muted)]">
          <AiBadge />
          <Badge>نسخة {presentation.version}</Badge>
          <Badge>{presentation.status}</Badge>
          <span>آخر تحديث: {new Date(presentation.updated_at).toLocaleString("ar-EG")}</span>
          {isOutdated && <Badge tone="warning">Presentation Outdated</Badge>}
          {isGenerating && (
            <Badge tone="warning">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
              جاري التوليد…
            </Badge>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex overflow-hidden rounded-[var(--v-radius-md)] border border-[var(--v-border)]" role="group" aria-label="لغة العرض">
            <button
              type="button"
              onClick={() => setLanguage("ar")}
              className={`px-3 py-1 text-xs font-semibold transition-colors ${language === "ar" ? "bg-[var(--v-primary)] text-white" : "text-[var(--v-text-secondary)] hover:bg-[var(--v-surface)]"}`}
            >
              عربي
            </button>
            <button
              type="button"
              onClick={() => setLanguage("en")}
              className={`px-3 py-1 text-xs font-semibold transition-colors ${language === "en" ? "bg-[var(--v-primary)] text-white" : "text-[var(--v-text-secondary)] hover:bg-[var(--v-surface)]"}`}
            >
              EN
            </button>
          </div>
          <Button variant="outline" size="sm" onClick={handleGenerateClick} loading={isGenerating}>
            Regenerate
          </Button>
          <Button variant="outline" size="sm" onClick={handleOpenCompare}>
            Compare Versions
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownloadPptx}
            disabled={!presentation.pptx_storage_path}
            loading={downloading}
          >
            {downloading ? "جاري التجهيز…" : "Download PPTX"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.open(`/client-delivery-print/${projectId}`, "_blank")}
          >
            تصدير PDF
          </Button>
        </div>
      </div>

      {displayMessage && (
        <div
          className={`mb-4 rounded-[var(--v-radius-md)] border p-3 text-xs ${
            presentation.status === "failed"
              ? "border-[var(--v-red)]/30 bg-[var(--v-red)]/10 text-[var(--v-red)]"
              : "border-[var(--v-amber)]/30 bg-[var(--v-amber)]/10 text-[var(--v-amber)]"
          }`}
        >
          {displayMessage}
        </div>
      )}
      {!presentation.pptx_storage_path && (
        <div className="mb-4 rounded-[var(--v-radius-md)] border border-[var(--v-amber)]/30 bg-[var(--v-amber)]/10 p-3 text-xs text-[var(--v-amber)]">
          مفيش ملف PPTX متاح لسه — جرّب Regenerate.
        </div>
      )}

      {qualityWarnings.length > 0 && (
        <div className="mb-4 rounded-[var(--v-radius-md)] border border-[var(--v-amber)]/30 bg-[var(--v-amber)]/10 p-3 text-xs text-[var(--v-amber)]">
          <p className="mb-1 font-semibold">فحص الاتساق رصد {qualityWarnings.length} ملاحظة قبل التقديم:</p>
          <ul className="list-disc space-y-0.5 pr-4">
            {qualityWarnings.slice(0, 6).map((w, i) => (
              <li key={i}>{w.message}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="mb-4 rounded-[var(--v-radius-lg)] border border-[var(--v-border)] bg-[var(--v-bg)] p-4">
        <p className="mb-2 text-sm font-semibold text-[var(--v-text)]">رابط المشاركة العام</p>
        {shareUrl ? (
          <div className="flex flex-wrap items-center gap-2">
            <code dir="ltr" className="flex-1 truncate rounded-[var(--v-radius-md)] bg-[var(--v-surface)] px-3 py-2 text-xs text-[var(--v-text)]">
              {shareUrl}
            </code>
            <Button variant="outline" size="sm" onClick={handleCopyLink}>
              {copied ? (
                <>
                  <Check size={13} /> تم النسخ
                </>
              ) : (
                "Copy Link"
              )}
            </Button>
            <Button variant="danger" size="sm" onClick={handleRevokeLink}>
              Revoke Link
            </Button>
          </div>
        ) : (
          <Button variant="primary" onClick={handleGenerateLink}>
            إنشاء رابط مشاركة
          </Button>
        )}
      </div>

      <div className="space-y-3">
        {CLIENT_PRESENTATION_SLIDE_KEYS.filter(
          // العروض المولّدة قبل التوسعة ماعندهاش الشرائح الجديدة — نعرض
          // بس الموجود فعلًا؛ إعادة التوليد الكاملة بتضيف الباقي.
          (key) => presentation.slides_content[key] !== undefined
        ).map((key) => (
          <SlideCard
            key={key}
            projectId={projectId}
            projectName={projectName}
            slideKey={key}
            presentation={presentation}
            disabled={isGenerating}
            onChanged={() => router.refresh()}
          />
        ))}
      </div>

      {showConfirm && (
        <RegenerateConfirmDialog
          title="يوجد عرض حالي (ربما فيه تعديلات يدوية)"
          message="التوليد الجديد هيستبدل المحتوى الحالي. النسخة الحالية هتفضل محفوظة في سجل النسخ."
          outdatedWarning={
            isOutdated
              ? "تنبيه: Project Brain أو PRD أو Prototype Review اتغيّروا من آخر توليد للعرض ده — النسخة الجديدة هتعتمد على أحدث البيانات، وممكن تختلف بشكل ملحوظ."
              : null
          }
          onCancel={() => setShowConfirm(false)}
          onConfirm={runGenerate}
        />
      )}

      {showCompare && (
        <CompareModalShell
          versions={versions}
          loading={loadingVersions}
          compareA={compareA}
          compareB={compareB}
          setCompareA={setCompareA}
          setCompareB={setCompareB}
          onClose={() => setShowCompare(false)}
        >
          {(versionA, versionB) => {
            if (!versionA.slides_content || !versionB.slides_content) return null;
            return (
              <div className="space-y-3">
                {CLIENT_PRESENTATION_SLIDE_KEYS.map((key) => {
                  const oldVal = JSON.stringify(versionA.slides_content?.[key]);
                  const newVal = JSON.stringify(versionB.slides_content?.[key]);
                  if (oldVal === newVal) return null;
                  return (
                    <div key={key} className="rounded-[var(--v-radius-md)] border border-[var(--v-border)] p-2">
                      <p className="text-xs font-semibold text-[var(--v-text)]">{slideLabels[key]} — تغيّر</p>
                      <div className="mt-1 grid grid-cols-1 gap-2 md:grid-cols-2 text-[11px] text-[var(--v-text-secondary)]">
                        <div className="rounded bg-[var(--v-red)]/5 p-2">v{versionA.version}: {oldVal}</div>
                        <div className="rounded bg-[var(--v-green)]/5 p-2">v{versionB.version}: {newVal}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          }}
        </CompareModalShell>
      )}
    </div>
  );
}

function SlideCard({
  projectId,
  projectName,
  slideKey,
  presentation,
  disabled,
  onChanged,
}: {
  projectId: string;
  projectName: string;
  slideKey: ClientPresentationSlideKey;
  presentation: ClientPresentation;
  disabled: boolean;
  onChanged: () => void;
}) {
  const slide = presentation.slides_content[slideKey];

  return (
    <EditableSectionCard
      headerLabel={<span className="text-sm font-semibold text-[var(--v-text)]">{slideLabels[slideKey]}</span>}
      disabled={disabled}
      viewContent={
        <pre className="whitespace-pre-wrap rounded-[var(--v-radius-md)] bg-[var(--v-surface)] p-2 text-xs text-[var(--v-text)]">
          {JSON.stringify(slide, null, 2)}
        </pre>
      }
      getInitialDraft={() => JSON.stringify(slide, null, 2)}
      onSave={async (draft) => {
        try {
          const parsed = JSON.parse(draft);
          await editPresentationSlide(projectId, slideKey, parsed);
        } catch {
          // JSON غير صالح — يتجاهل الحفظ بهدوء، بنفس سلوك النسخة الأصلية بالظبط
        }
        return { ok: true };
      }}
      onChanged={onChanged}
      textareaRows={8}
      textareaDir="ltr"
      regenerate={{
        label: "Regenerate Slide",
        regeneratingLabel: "جاري إعادة التوليد…",
        onRegenerate: async () => {
          await regeneratePresentationSlide(projectId, projectName, slideKey);
        },
      }}
    />
  );
}
