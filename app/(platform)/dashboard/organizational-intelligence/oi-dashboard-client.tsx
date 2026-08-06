"use client";

import { useState, useTransition } from "react";
import { Search, Brain, CheckCircle2, XCircle, Sparkles, TrendingUp, Database } from "lucide-react";
import Card from "@/components/ui/Card";
import PageHeader from "@/components/ui/PageHeader";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import EmptyState from "@/components/ui/EmptyState";
import { searchKnowledgeAction, setKnowledgeStatusAction, setPromptSuggestionStatusAction } from "./actions";
import type { KnowledgeSearchResult } from "@/lib/organizational-intelligence/search-service";
import type { ExecutiveDashboardMetrics } from "@/lib/organizational-intelligence/dashboard-metrics";
import type { OrganizationalKnowledge, PromptImprovementSuggestion } from "@/lib/types/database";

const CATEGORY_LABELS: Record<string, string> = {
  business_pattern: "نمط عمل", architecture_decision: "قرار معماري", ux_decision: "قرار UX", ui_pattern: "نمط UI",
  reusable_component: "مكوّن قابل لإعادة الاستخدام", common_requirement: "متطلب متكرر", common_risk: "خطر متكرر",
  common_integration: "تكامل متكرر", common_bug: "خطأ متكرر", common_mistake: "خطأ شائع", successful_solution: "حل ناجح",
  failed_solution: "حل فاشل", performance_lesson: "درس أداء", security_lesson: "درس أمان", deployment_lesson: "درس نشر",
  support_lesson: "درس دعم", customer_feedback_pattern: "نمط ملاحظات عميل", meeting_decision_pattern: "نمط قرار اجتماع",
  technical_decision: "قرار تقني", best_practice: "أفضل ممارسة",
};

function MetricCard({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string | number; tone: string }) {
  return (
    <Card padding="md" className="flex items-center gap-3">
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--v-radius-md)] ${tone}`}>{icon}</div>
      <div>
        <p className="text-xl font-bold tabular-nums text-[var(--v-text)]">{value}</p>
        <p className="text-xs text-[var(--v-text-muted)]">{label}</p>
      </div>
    </Card>
  );
}

export default function OrganizationalIntelligenceDashboard({
  metrics,
  candidateKnowledge,
  promptSuggestions,
  canManage,
}: {
  metrics: ExecutiveDashboardMetrics;
  candidateKnowledge: OrganizationalKnowledge[];
  promptSuggestions: PromptImprovementSuggestion[];
  canManage: boolean;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<KnowledgeSearchResult[] | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [isSearching, startSearch] = useTransition();
  const [isPending, startAction] = useTransition();

  function runSearch() {
    setSearchError(null);
    startSearch(async () => {
      const result = await searchKnowledgeAction(query);
      if (!result.ok) {
        setSearchError(result.message);
        setResults(null);
        return;
      }
      setResults(result.results);
    });
  }

  function handleKnowledgeStatus(id: string, status: "approved" | "rejected") {
    startAction(async () => {
      await setKnowledgeStatusAction(id, status);
    });
  }

  function handleSuggestionStatus(id: string, status: "applied" | "dismissed") {
    startAction(async () => {
      await setPromptSuggestionStatusAction(id, status);
    });
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="الذكاء التنظيمي والتعلّم المستمر"
        icon={Brain}
        description="معرفة قابلة لإعادة الاستخدام مستخرجة من مشاريع الشركة السابقة — أدلة حقيقية فقط، صفر معلومات مُختلقة."
      />


      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <MetricCard icon={<Database size={18} className="text-[var(--v-primary)]" />} label="إجمالي المعرفة" value={metrics.totalKnowledgeItems} tone="bg-[var(--v-primary-tint)]" />
        <MetricCard icon={<CheckCircle2 size={18} className="text-[var(--v-green)]" />} label="معرفة معتمدة/مُتحقَّقة" value={metrics.validatedCount + metrics.approvedCount} tone="bg-[var(--v-green)]/10" />
        <MetricCard icon={<Brain size={18} className="text-[var(--v-amber)]" />} label="مشاريع تمت معالجتها" value={metrics.projectsProcessed} tone="bg-[var(--v-amber)]/10" />
        <MetricCard icon={<Sparkles size={18} className="text-[var(--v-info)]" />} label="توصيات ذكية مولّدة" value={metrics.totalRecommendations} tone="bg-[var(--v-info)]/10" />
        <MetricCard icon={<TrendingUp size={18} className="text-[var(--v-primary)]" />} label="معدّل إعادة الاستخدام" value={`${metrics.reuseRatePercent}%`} tone="bg-[var(--v-primary-tint)]" />
      </div>

      {metrics.topCategories.length > 0 && (
        <Card padding="md">
          <p className="mb-3 text-sm font-semibold text-[var(--v-text)]">أكثر فئات المعرفة تكرارًا</p>
          <div className="flex flex-wrap gap-2">
            {metrics.topCategories.map((c) => (
              <Badge key={c.category} tone="primary">
                {CATEGORY_LABELS[c.category] ?? c.category} — {c.count}
              </Badge>
            ))}
          </div>
        </Card>
      )}

      <Card padding="md">
        <p className="mb-3 text-sm font-semibold text-[var(--v-text)]">بحث دلالي (Semantic Search) في قاعدة المعرفة</p>
        <div className="flex gap-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="مثال: هل نفذنا نظام صلاحيات معقّد قبل كده؟"
            onKeyDown={(e) => e.key === "Enter" && runSearch()}
          />
          <Button variant="primary" onClick={runSearch} loading={isSearching}>
            <Search size={15} /> بحث
          </Button>
        </div>
        {searchError && <p className="mt-2 text-xs text-[var(--v-red)]">{searchError}</p>}
        {results !== null && (
          <div className="mt-4 space-y-2">
            {results.length === 0 ? (
              <p className="text-xs text-[var(--v-text-muted)]">لا توجد نتائج ذات صلة كافية.</p>
            ) : (
              results.map((r) => (
                <div key={r.id} className="rounded-[var(--v-radius-md)] border border-[var(--v-border)] p-3">
                  <div className="flex items-center justify-between gap-2">
                    <Badge tone="primary">{CATEGORY_LABELS[r.category] ?? r.category}</Badge>
                    <span className="text-[11px] tabular-nums text-[var(--v-text-muted)]">تشابه {Math.round(r.similarity * 100)}%</span>
                  </div>
                  <p className="mt-2 text-sm font-medium text-[var(--v-text)]">{r.title}</p>
                  <p className="mt-1 text-xs text-[var(--v-text-secondary)]">{r.content}</p>
                </div>
              ))
            )}
          </div>
        )}
      </Card>

      <Card padding="md">
        <p className="mb-3 text-sm font-semibold text-[var(--v-text)]">معرفة قيد المراجعة (Governance)</p>
        {candidateKnowledge.length === 0 ? (
          <EmptyState title="لا توجد معرفة قيد المراجعة حاليًا" description="أي معرفة جديدة تُستخرج من مشروع مؤرشف تظهر هنا لحد ما تتكرر أو تُعتمد يدويًا." />
        ) : (
          <div className="space-y-2">
            {candidateKnowledge.map((k) => (
              <div key={k.id} className="rounded-[var(--v-radius-md)] border border-[var(--v-border)] p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Badge tone="primary">{CATEGORY_LABELS[k.category] ?? k.category}</Badge>
                    <span className="text-[11px] tabular-nums text-[var(--v-text-muted)]">تكرار {k.occurrence_count} — ثقة {k.confidence_score}%</span>
                  </div>
                  {canManage && (
                    <div className="flex gap-1.5">
                      <Button variant="outline" size="sm" onClick={() => handleKnowledgeStatus(k.id, "approved")} disabled={isPending}>
                        <CheckCircle2 size={13} /> اعتماد
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => handleKnowledgeStatus(k.id, "rejected")} disabled={isPending}>
                        <XCircle size={13} /> رفض
                      </Button>
                    </div>
                  )}
                </div>
                <p className="mt-2 text-sm font-medium text-[var(--v-text)]">{k.title}</p>
                <p className="mt-1 text-xs text-[var(--v-text-secondary)]">{k.content}</p>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card padding="md">
        <p className="mb-3 text-sm font-semibold text-[var(--v-text)]">اقتراحات تحسين البرومبتات (للمراجعة اليدوية)</p>
        {promptSuggestions.length === 0 ? (
          <EmptyState title="لا توجد اقتراحات حاليًا" description="بتظهر هنا بس لو فيه إشارة نتيجة سيئة حقيقية مرتبطة ببرومبت توليد معيّن." />
        ) : (
          <div className="space-y-2">
            {promptSuggestions.map((s) => (
              <div key={s.id} className="rounded-[var(--v-radius-md)] border border-[var(--v-border)] p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <code className="text-[11px] text-[var(--v-text-muted)]">{s.prompt_reference}</code>
                  {canManage && (
                    <div className="flex gap-1.5">
                      <Button variant="outline" size="sm" onClick={() => handleSuggestionStatus(s.id, "applied")} disabled={isPending}>
                        تم التطبيق يدويًا
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => handleSuggestionStatus(s.id, "dismissed")} disabled={isPending}>
                        تجاهل
                      </Button>
                    </div>
                  )}
                </div>
                <p className="mt-2 text-sm font-medium text-[var(--v-text)]">{s.suggestion}</p>
                <p className="mt-1 text-xs text-[var(--v-text-secondary)]">{s.rationale}</p>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
